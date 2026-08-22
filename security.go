package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ---- CVE scanning via OSV.dev (best-effort, no API key required) ----

const osvBatchURL = "https://api.osv.dev/v1/querybatch"

type osvQuery struct {
	Version string    `json:"version,omitempty"`
	Package osvPkgRef `json:"package"`
}

type osvPkgRef struct {
	Name      string `json:"name"`
	Ecosystem string `json:"ecosystem"`
}

type osvBatchRequest struct {
	Queries []osvQuery `json:"queries"`
}

type osvVulnRef struct {
	ID string `json:"id"`
}

type osvResult struct {
	Vulns []osvVulnRef `json:"vulns"`
}

type osvBatchResponse struct {
	Results []osvResult `json:"results"`
}

// ScanVulnerabilities checks installed formulae against OSV.dev's
// Homebrew ecosystem advisories. It's best-effort: any network/API
// failure degrades to "no known vulnerabilities found" for that package
// rather than failing the whole scan, since this is informational, not
// load-bearing.
func ScanVulnerabilities(ctx context.Context, pkgs []BrewPackage) ([]VulnResult, error) {
	var targets []BrewPackage
	for _, p := range pkgs {
		if !p.IsCask && p.Installed && p.InstalledVersion != "" {
			targets = append(targets, p)
		}
	}
	if len(targets) == 0 {
		return []VulnResult{}, nil
	}

	req := osvBatchRequest{}
	for _, p := range targets {
		req.Queries = append(req.Queries, osvQuery{
			Version: p.InstalledVersion,
			Package: osvPkgRef{Name: p.Name, Ecosystem: "Homebrew"},
		})
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, osvBatchURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		results := make([]VulnResult, len(targets))
		for i, p := range targets {
			results[i] = VulnResult{Name: p.Name, IsCask: false, Version: p.InstalledVersion, VulnIDs: []string{}, Error: "network error: " + err.Error()}
		}
		return results, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		results := make([]VulnResult, len(targets))
		for i, p := range targets {
			results[i] = VulnResult{Name: p.Name, IsCask: false, Version: p.InstalledVersion, VulnIDs: []string{}, Error: fmt.Sprintf("osv.dev returned HTTP %d", resp.StatusCode)}
		}
		return results, nil
	}

	var batchResp osvBatchResponse
	if err := json.NewDecoder(resp.Body).Decode(&batchResp); err != nil {
		return nil, err
	}

	results := make([]VulnResult, len(targets))
	for i, p := range targets {
		ids := []string{}
		if i < len(batchResp.Results) {
			for _, v := range batchResp.Results[i].Vulns {
				ids = append(ids, v.ID)
			}
		}
		results[i] = VulnResult{Name: p.Name, IsCask: false, Version: p.InstalledVersion, VulnIDs: ids}
	}
	return results, nil
}

// ---- Gatekeeper / code-signing inspection ----

var authorityRe = regexp.MustCompile(`(?m)^Authority=(.+)$`)
var teamIDRe = regexp.MustCompile(`(?m)^TeamIdentifier=(.+)$`)

// InspectAppSecurity runs `spctl` and `codesign` against a locally
// installed .app bundle to surface Gatekeeper/notarization status, mirroring
// (a lightweight version of) what macOS itself checks before first launch.
func InspectAppSecurity(ctx context.Context, appPath string) (*SecurityInfo, error) {
	if appPath == "" {
		return nil, fmt.Errorf("no app path to inspect")
	}
	if _, err := os.Stat(appPath); err != nil {
		return nil, fmt.Errorf("app not found at %s", appPath)
	}

	info := &SecurityInfo{AppPath: appPath}

	spctlOut, spctlErr := runCmd(ctx, "spctl", "--assess", "--type", "execute", "-vv", appPath)
	info.Assessment = strings.TrimSpace(spctlOut)
	info.GatekeeperOK = spctlErr == nil

	codesignOut, _ := runCmd(ctx, "codesign", "-dv", "--verbose=4", appPath)
	if m := authorityRe.FindStringSubmatch(codesignOut); m != nil {
		info.Authority = strings.TrimSpace(m[1])
		info.Signed = true
	}
	if m := teamIDRe.FindStringSubmatch(codesignOut); m != nil {
		info.TeamID = strings.TrimSpace(m[1])
	}

	xattrOut, _ := runCmd(ctx, "xattr", appPath)
	info.Quarantined = strings.Contains(xattrOut, "com.apple.quarantine")

	return info, nil
}

// RemoveQuarantine strips the com.apple.quarantine flag from a trusted app,
// the same effect as right-click > Open on a downloaded app.
func RemoveQuarantine(ctx context.Context, appPath string) (string, error) {
	if appPath == "" || !strings.HasSuffix(appPath, ".app") {
		return "", fmt.Errorf("refusing to touch a path that isn't an .app bundle")
	}
	if _, err := os.Stat(appPath); err != nil {
		return "", fmt.Errorf("app not found at %s", appPath)
	}
	out, err := runCmd(ctx, "xattr", "-d", "com.apple.quarantine", appPath)
	return out, err
}

// resolveCaskAppPath finds the first /Applications/<App>.app for a cask,
// preferring the artifact list from `brew info` and falling back to the
// package's display name.
func resolveCaskAppPath(pkg *BrewPackage) string {
	for _, p := range pkg.AppPaths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	guess := filepath.Join("/Applications", pkg.FullName+".app")
	if _, err := os.Stat(guess); err == nil {
		return guess
	}
	return ""
}

// CreateLocalSnapshot creates an instant local APFS snapshot of the boot
// volume via `tmutil localsnapshot` -- a lightweight safety net before a
// destructive operation. It does not require an external Time Machine disk;
// restoring from it is a normal macOS flow (Finder > right-click a folder >
// "Browse Time Machine snapshots...", or Recovery Mode), which mead doesn't
// reimplement.
func CreateLocalSnapshot(ctx context.Context) error {
	out, err := runCmd(ctx, "tmutil", "localsnapshot")
	if err != nil {
		msg := strings.TrimSpace(out)
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("couldn't create a local snapshot: %s", msg)
	}
	return nil
}

// RevealInFinder opens Finder with the given path selected, via `open -R`.
func RevealInFinder(ctx context.Context, path string) error {
	if path == "" {
		return fmt.Errorf("no path to reveal")
	}
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("not found: %s", path)
	}
	_, err := runCmd(ctx, "open", "-R", path)
	return err
}
