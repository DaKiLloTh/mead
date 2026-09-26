// Package security covers OSV.dev vulnerability scanning, Gatekeeper/
// code-signing inspection, quarantine removal, and local APFS snapshots --
// everything mead does to help a user reason about whether it's safe to
// run or remove something.
package security

import (
	"bytes"
	"context"
	"encoding/json/v2" // OSV.dev request/response bodies; unrelated to the
	// Wails RPC boundary (see internal/brew/brewinfo.go for the full note).
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"mead/internal/brew"
	"mead/internal/system"
)

// ---- CVE scanning: `brew vulns` (Homebrew >= 7) with an OSV.dev direct-API
// fallback for older Homebrew installs that don't have the command ----
//
// Homebrew 7 added a native `brew vulns` command that checks installed
// formulae against the same OSV.dev database mead used to query directly
// itself, but with more: severity, fixed-version info, and a formula's own
// patch already resolving a CVE reported separately from one that's still
// open. ScanVulnerabilities prefers that native command -- one fewer
// network-calling code path for mead to maintain, and strictly more
// information for the same check -- and only falls back to the old direct
// OSV.dev HTTP call when `brew vulns` genuinely isn't available (Homebrew
// 6 and earlier). That's a real capability check (see HasVulnsCommand),
// not a hardcoded minimum-version guess: it asks Homebrew itself, via
// `brew commands`, whether the command exists.
//
// Casks were never covered by the old OSV.dev path (it only ever built
// queries for non-cask, installed, versioned packages) and aren't covered
// by `brew vulns` either -- see its own --help: "Check formula for known
// security vulnerabilities". vulnScanTargets preserves that exclusion for
// both paths.

// vulnScanTargets is the pure filtering logic behind ScanVulnerabilities:
// only installed formulae with a known version are worth checking. Casks
// are always excluded here, matching what `brew vulns` itself limits
// itself to (see its --help text) and what the old direct OSV.dev call
// did too.
func vulnScanTargets(pkgs []brew.BrewPackage) []brew.BrewPackage {
	var targets []brew.BrewPackage
	for _, p := range pkgs {
		if !p.IsCask && p.Installed && p.InstalledVersion != "" {
			targets = append(targets, p)
		}
	}
	return targets
}

// hasCommand is the pure lookup behind HasVulnsCommand: does `want` appear
// in a list of command names (as `brew commands --quiet` reports them)?
func hasCommand(names []string, want string) bool {
	for _, n := range names {
		if n == want {
			return true
		}
	}
	return false
}

// HasVulnsCommand reports whether this Homebrew installation has a native
// `brew vulns` command (added in Homebrew 7). It's checked via
// `brew commands --quiet`, which lists every command Homebrew currently
// recognizes, rather than by parsing `brew --version` against a hardcoded
// minimum -- that way this reflects a real, present capability instead of
// an assumption about what a given version number implies, which holds up
// better against forks/vendored Homebrew builds that don't track upstream
// version numbers exactly. A failure to even list commands is treated as
// "not available" -- the safe direction for a feature-detection check --
// which naturally routes to the OSV.dev fallback rather than a genuine
// error.
func HasVulnsCommand(ctx context.Context) bool {
	names, err := brew.CommandNames(ctx)
	if err != nil {
		return false
	}
	return hasCommand(names, "vulns")
}

// normalizeSeverity lower-cases and validates a severity string (as
// reported by `brew vulns --json`, e.g. "MEDIUM", "UNKNOWN") against
// VulnSeverity's known set, falling back to VulnSeverityUnknown for
// anything else -- including "", which brew vulns itself never actually
// emits (its own severity_display falls back to the literal string
// "UNKNOWN"), but which is worth handling defensively rather than
// producing a badge with no matching style.
func normalizeSeverity(s string) VulnSeverity {
	switch VulnSeverity(strings.ToLower(strings.TrimSpace(s))) {
	case VulnSeverityCritical:
		return VulnSeverityCritical
	case VulnSeverityHigh:
		return VulnSeverityHigh
	case VulnSeverityMedium:
		return VulnSeverityMedium
	case VulnSeverityLow:
		return VulnSeverityLow
	default:
		return VulnSeverityUnknown
	}
}

// ---- `brew vulns --json` ----

// brewVulnsOutput mirrors the top-level shape of `brew vulns --json`,
// authoritatively sourced from Homebrew's own vulns/output.rb
// (Output.json), not just its --help text -- see the PR description for
// the real captured output this was checked against on Homebrew 7.0.6.
type brewVulnsOutput struct {
	Findings        []brewVulnsFinding `json:"findings"`
	SkippedFormulae []string           `json:"skipped_formulae"`
}

type brewVulnsFinding struct {
	Formula         string          `json:"formula"`
	Version         string          `json:"version"`
	Tag             string          `json:"tag"`
	RepoURL         string          `json:"repo_url"`
	Vulnerabilities []brewVulnEntry `json:"vulnerabilities"`
	Patched         []brewVulnEntry `json:"patched"`
}

type brewVulnEntry struct {
	ID            string   `json:"id"`
	Severity      string   `json:"severity"`
	Summary       string   `json:"summary"`
	Aliases       []string `json:"aliases"`
	FixedVersions []string `json:"fixed_versions"`
}

// parseBrewVulnsJSON decodes `brew vulns --json`'s stdout. It's the pure
// half of scanVulnerabilitiesViaBrew: given the raw bytes, either a valid
// payload or a decode error, with no process-running involved, so it's
// exercisable directly against real captured output.
func parseBrewVulnsJSON(data []byte) (*brewVulnsOutput, error) {
	var out brewVulnsOutput
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("parsing brew vulns output: %w", err)
	}
	return &out, nil
}

// toVulnerabilities converts brew vulns' JSON vulnerability entries to
// mead's own Vulnerability type, normalizing severity and guaranteeing
// non-nil Aliases/FixedVersions slices (so they marshal to `[]`, not
// `null`, across the Wails RPC boundary).
func toVulnerabilities(entries []brewVulnEntry) []Vulnerability {
	out := make([]Vulnerability, 0, len(entries))
	for _, e := range entries {
		aliases := e.Aliases
		if aliases == nil {
			aliases = []string{}
		}
		fixed := e.FixedVersions
		if fixed == nil {
			fixed = []string{}
		}
		out = append(out, Vulnerability{
			ID:            e.ID,
			Severity:      normalizeSeverity(e.Severity),
			Summary:       e.Summary,
			Aliases:       aliases,
			FixedVersions: fixed,
		})
	}
	return out
}

// buildVulnResults is the pure decision logic behind
// scanVulnerabilitiesViaBrew: given the packages that were actually asked
// about and brew vulns' parsed response, produce exactly one VulnResult
// per target -- including ones brew vulns didn't mention at all (nothing
// to report: clean) and ones it explicitly skipped -- rather than only
// the subset that had findings.
func buildVulnResults(targets []brew.BrewPackage, parsed *brewVulnsOutput) []VulnResult {
	findingByFormula := make(map[string]brewVulnsFinding, len(parsed.Findings))
	for _, f := range parsed.Findings {
		findingByFormula[f.Formula] = f
	}
	skipped := make(map[string]bool, len(parsed.SkippedFormulae))
	for _, s := range parsed.SkippedFormulae {
		skipped[s] = true
	}

	results := make([]VulnResult, len(targets))
	for i, p := range targets {
		// brew vulns reports tap formulae by their full name
		// ("hashicorp/tap/terraform"), while p.Name is the short name.
		f, ok := findingByFormula[p.Name]
		if !ok && p.FullName != "" {
			f, ok = findingByFormula[p.FullName]
		}
		if ok {
			results[i] = VulnResult{
				Name:    p.Name,
				Version: p.InstalledVersion,
				Open:    toVulnerabilities(f.Vulnerabilities),
				Patched: toVulnerabilities(f.Patched),
			}
			continue
		}
		results[i] = VulnResult{
			Name:    p.Name,
			Version: p.InstalledVersion,
			Open:    []Vulnerability{},
			Patched: []Vulnerability{},
			Skipped: skipped[p.Name] || skipped[p.FullName],
		}
	}
	return results
}

// scanVulnerabilitiesViaBrew runs `brew vulns --json` against exactly the
// given targets and turns its output into mead's own VulnResult shape.
//
// `brew vulns` exits non-zero whenever it reports any finding (open or
// patched) -- that's the answer, not a failure to report, the same
// non-zero-on-findings convention brew.BundleCheck already relies on for
// `brew bundle check`. So a non-nil error from RunBrew here isn't treated
// as fatal on its own: if stdout still decodes as brew vulns' expected
// JSON shape, that's used regardless of exit status, and only a payload
// that doesn't parse at all (brew missing, an unknown formula name, a
// network failure inside brew vulns' own OSV.dev call, etc) is reported
// as a real error.
func scanVulnerabilitiesViaBrew(ctx context.Context, targets []brew.BrewPackage) ([]VulnResult, error) {
	names := make([]string, len(targets))
	for i, p := range targets {
		names[i] = p.Name
	}
	args := append([]string{"vulns", "--json"}, names...)
	out, runErr := brew.RunBrew(ctx, args...)
	parsed, parseErr := parseBrewVulnsJSON([]byte(out))
	if parseErr != nil {
		if runErr != nil {
			return nil, runErr
		}
		return nil, parseErr
	}
	return buildVulnResults(targets, parsed), nil
}

// ---- OSV.dev direct API (fallback for Homebrew < 7, which has no
// `brew vulns` command) ----

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

// buildOSVResults is the pure decision logic behind
// scanVulnerabilitiesViaOSV: given the packages that were queried and
// OSV.dev's batch response (aligned index-for-index with the request's own
// queries), produce one VulnResult per target. OSV.dev's querybatch
// endpoint returns bare vulnerability IDs with no severity, summary, or
// patched-vs-open distinction, so Open only ever gets an ID plus
// VulnSeverityUnknown -- this is strictly less informative than
// scanVulnerabilitiesViaBrew's result, which is exactly why `brew vulns`
// is preferred whenever it's available.
func buildOSVResults(targets []brew.BrewPackage, batchResp osvBatchResponse) []VulnResult {
	results := make([]VulnResult, len(targets))
	for i, p := range targets {
		open := []Vulnerability{}
		if i < len(batchResp.Results) {
			for _, v := range batchResp.Results[i].Vulns {
				open = append(open, Vulnerability{
					ID:            v.ID,
					Severity:      VulnSeverityUnknown,
					Aliases:       []string{},
					FixedVersions: []string{},
				})
			}
		}
		results[i] = VulnResult{Name: p.Name, Version: p.InstalledVersion, Open: open, Patched: []Vulnerability{}}
	}
	return results
}

// scanVulnerabilitiesViaOSV is the original direct-HTTP OSV.dev path, kept
// as a fallback for Homebrew installs older than 7 that don't have
// `brew vulns` (see HasVulnsCommand). It's best-effort: any network/API
// failure degrades to an Error on each result rather than failing the
// whole scan, since this is informational, not load-bearing.
func scanVulnerabilitiesViaOSV(ctx context.Context, targets []brew.BrewPackage) ([]VulnResult, error) {
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
			results[i] = VulnResult{Name: p.Name, Version: p.InstalledVersion, Open: []Vulnerability{}, Patched: []Vulnerability{}, Error: "network error: " + err.Error()}
		}
		return results, nil
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		results := make([]VulnResult, len(targets))
		for i, p := range targets {
			results[i] = VulnResult{Name: p.Name, Version: p.InstalledVersion, Open: []Vulnerability{}, Patched: []Vulnerability{}, Error: fmt.Sprintf("osv.dev returned HTTP %d", resp.StatusCode)}
		}
		return results, nil
	}

	var batchResp osvBatchResponse
	if err := json.UnmarshalRead(resp.Body, &batchResp); err != nil {
		return nil, err
	}

	return buildOSVResults(targets, batchResp), nil
}

// ScanVulnerabilities checks installed formulae for known vulnerabilities,
// preferring Homebrew's own `brew vulns` command (Homebrew >= 7) and
// falling back to a direct OSV.dev API call when it isn't available. See
// the doc comment above vulnScanTargets for the full reasoning.
//
// If `brew vulns` is available but fails at runtime (no network path to
// OSV.dev, an unexpected output shape, etc), that's reported per-package
// via VulnResult.Error rather than silently retried against the OSV.dev
// fallback -- both paths would hit the same underlying OSV.dev outage for
// the same reason, so a second network round-trip wouldn't recover
// anything, and silently switching data sources given failure could also
// mask what's actually wrong. The fallback exists specifically for
// Homebrew installs where the command itself doesn't exist, not for
// papering over `brew vulns` having a bad day.
func ScanVulnerabilities(ctx context.Context, pkgs []brew.BrewPackage) ([]VulnResult, error) {
	targets := vulnScanTargets(pkgs)
	if len(targets) == 0 {
		return []VulnResult{}, nil
	}

	if HasVulnsCommand(ctx) {
		results, err := scanVulnerabilitiesViaBrew(ctx, targets)
		if err == nil {
			return results, nil
		}
		results = make([]VulnResult, len(targets))
		for i, p := range targets {
			results[i] = VulnResult{Name: p.Name, Version: p.InstalledVersion, Open: []Vulnerability{}, Patched: []Vulnerability{}, Error: err.Error()}
		}
		return results, nil
	}

	return scanVulnerabilitiesViaOSV(ctx, targets)
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

	spctlOut, spctlErr := system.RunCmd(ctx, "spctl", "--assess", "--type", "execute", "-vv", appPath)
	info.Assessment = strings.TrimSpace(spctlOut)
	info.GatekeeperOK = spctlErr == nil

	codesignOut, _ := system.RunCmd(ctx, "codesign", "-dv", "--verbose=4", appPath)
	if m := authorityRe.FindStringSubmatch(codesignOut); m != nil {
		info.Authority = strings.TrimSpace(m[1])
		info.Signed = true
	}
	if m := teamIDRe.FindStringSubmatch(codesignOut); m != nil {
		info.TeamID = strings.TrimSpace(m[1])
	}

	xattrOut, _ := system.RunCmd(ctx, "xattr", appPath)
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
	out, err := system.RunCmd(ctx, "xattr", "-d", "com.apple.quarantine", appPath)
	return out, err
}

// ResolveCaskAppPath finds the first /Applications/<App>.app for a cask,
// preferring the artifact list from `brew info` and falling back to the
// package's display name.
func ResolveCaskAppPath(pkg *brew.BrewPackage) string {
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

// ResolveMasAppPath resolves a Mac App Store app's display name (as `mas
// list` reports it, e.g. "Windows App") to its installed .app bundle in
// /Applications. Unlike a cask, there's no manifest telling us the real
// filename, but in practice `mas`'s display name and the .app's own
// filename match exactly for every app checked while building this (mas
// list vs. ls /Applications: "WhatsApp" -> WhatsApp.app, "Windows App" ->
// "Windows App.app"), so that's tried first. The case-insensitive
// directory scan is a fallback for the rare case where they differ only in
// casing, not a primary strategy -- if neither matches, "" is returned
// like ResolveCaskAppPath, and the caller treats that as "no icon"
// rather than an error.
func ResolveMasAppPath(name string) string {
	guess := filepath.Join("/Applications", name+".app")
	if _, err := os.Stat(guess); err == nil {
		return guess
	}
	entries, err := os.ReadDir("/Applications")
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if !e.IsDir() || !strings.HasSuffix(e.Name(), ".app") {
			continue
		}
		if strings.EqualFold(strings.TrimSuffix(e.Name(), ".app"), name) {
			return filepath.Join("/Applications", e.Name())
		}
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
	out, err := system.RunCmd(ctx, "tmutil", "localsnapshot")
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
	_, err := system.RunCmd(ctx, "open", "-R", path)
	return err
}
