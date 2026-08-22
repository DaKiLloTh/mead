package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// ---- generic map helpers for defensively decoding brew's JSON ----

func mGetString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func mGetBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok && v != nil {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}

func mGetStringSlice(m map[string]interface{}, key string) []string {
	out := []string{}
	if v, ok := m[key]; ok && v != nil {
		if arr, ok := v.([]interface{}); ok {
			for _, e := range arr {
				if s, ok := e.(string); ok {
					out = append(out, s)
				}
			}
		}
	}
	return out
}

func mGetMap(m map[string]interface{}, key string) map[string]interface{} {
	if v, ok := m[key]; ok && v != nil {
		if mm, ok := v.(map[string]interface{}); ok {
			return mm
		}
	}
	return nil
}

func mGetArr(m map[string]interface{}, key string) []interface{} {
	if v, ok := m[key]; ok && v != nil {
		if arr, ok := v.([]interface{}); ok {
			return arr
		}
	}
	return nil
}

// ---- decoding `brew info --json=v2` payloads ----

func decodeInfoV2(data []byte) ([]BrewPackage, error) {
	var raw struct {
		Formulae []map[string]interface{} `json:"formulae"`
		Casks    []map[string]interface{} `json:"casks"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing brew info output: %w", err)
	}

	out := []BrewPackage{}
	for _, f := range raw.Formulae {
		out = append(out, formulaToPackage(f))
	}
	for _, c := range raw.Casks {
		out = append(out, caskToPackage(c))
	}
	return out, nil
}

func formulaToPackage(f map[string]interface{}) BrewPackage {
	p := BrewPackage{
		Name:         mGetString(f, "name"),
		FullName:     mGetString(f, "full_name"),
		IsCask:       false,
		Tap:          mGetString(f, "tap"),
		Desc:         mGetString(f, "desc"),
		Homepage:     mGetString(f, "homepage"),
		License:      mGetString(f, "license"),
		Outdated:     mGetBool(f, "outdated"),
		Pinned:       mGetBool(f, "pinned"),
		Deprecated:   mGetBool(f, "deprecated"),
		Disabled:     mGetBool(f, "disabled"),
		KegOnly:      mGetBool(f, "keg_only"),
		Dependencies: mGetStringSlice(f, "dependencies"),
	}
	if caveats := f["caveats"]; caveats != nil {
		if s, ok := caveats.(string); ok {
			p.Caveats = s
		}
	}
	if versions := mGetMap(f, "versions"); versions != nil {
		p.Version = mGetString(versions, "stable")
	}
	if installedArr := mGetArr(f, "installed"); len(installedArr) > 0 {
		p.Installed = true
		if last, ok := installedArr[len(installedArr)-1].(map[string]interface{}); ok {
			p.InstalledVersion = mGetString(last, "version")
			p.InstalledOnRequest = mGetBool(last, "installed_on_request")
			p.InstalledAsDependency = mGetBool(last, "installed_as_dependency")
		}
	}
	return p
}

func caskToPackage(c map[string]interface{}) BrewPackage {
	p := BrewPackage{
		Name:         mGetString(c, "token"),
		FullName:     mGetString(c, "full_token"),
		IsCask:       true,
		Tap:          mGetString(c, "tap"),
		Desc:         mGetString(c, "desc"),
		Homepage:     mGetString(c, "homepage"),
		Version:      mGetString(c, "version"),
		Outdated:     mGetBool(c, "outdated"),
		Deprecated:   mGetBool(c, "deprecated"),
		Disabled:     mGetBool(c, "disabled"),
		AutoUpdates:  mGetBool(c, "auto_updates"),
		Dependencies: []string{},
	}
	if names := mGetStringSlice(c, "name"); len(names) > 0 {
		p.FullName = names[0]
	}
	if caveats := c["caveats"]; caveats != nil {
		if s, ok := caveats.(string); ok {
			p.Caveats = s
		}
	}
	if installed, ok := c["installed"]; ok && installed != nil {
		if s, ok := installed.(string); ok && s != "" {
			p.Installed = true
			p.InstalledVersion = s
		}
	}
	if dependsOn := mGetMap(c, "depends_on"); dependsOn != nil {
		p.Dependencies = append(p.Dependencies, mGetStringSlice(dependsOn, "formula")...)
		p.Dependencies = append(p.Dependencies, mGetStringSlice(dependsOn, "cask")...)
	}
	p.Artifacts, p.AppPaths = parseCaskArtifacts(mGetArr(c, "artifacts"))
	return p
}

// parseCaskArtifacts turns brew's heterogeneous "artifacts" array into
// human-readable labels and, separately, any /Applications/*.app paths it
// installs (used for security inspection and quarantine removal).
func parseCaskArtifacts(artifacts []interface{}) (labels []string, appPaths []string) {
	for _, raw := range artifacts {
		entry, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		for key, val := range entry {
			switch key {
			case "app":
				for _, name := range interfaceStringSlice(val) {
					labels = append(labels, "App: "+name)
					appPaths = append(appPaths, filepath.Join("/Applications", name))
				}
			case "binary":
				for _, name := range interfaceStringSlice(val) {
					labels = append(labels, "Binary: "+name)
				}
			case "pkg":
				for _, name := range interfaceStringSlice(val) {
					labels = append(labels, "Installer package: "+name)
				}
			case "manpage":
				for _, name := range interfaceStringSlice(val) {
					labels = append(labels, "Man page: "+name)
				}
			}
		}
	}
	return labels, appPaths
}

// interfaceStringSlice normalizes a JSON value that may be a bare string or
// an array of strings (brew's artifact entries vary by artifact type).
func interfaceStringSlice(v interface{}) []string {
	switch t := v.(type) {
	case string:
		return []string{t}
	case []interface{}:
		var out []string
		for _, e := range t {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}

// ListInstalled returns all installed formulae and casks with full detail.
func ListInstalled(ctx context.Context) ([]BrewPackage, error) {
	out, err := runBrew(ctx, "info", "--json=v2", "--installed")
	if err != nil {
		return nil, err
	}
	pkgs, err := decodeInfoV2([]byte(out))
	if err != nil {
		return nil, err
	}
	sort.Slice(pkgs, func(i, j int) bool {
		return strings.ToLower(pkgs[i].Name) < strings.ToLower(pkgs[j].Name)
	})
	return pkgs, nil
}

// GetInfo fetches full detail for a single formula or cask.
func GetInfo(ctx context.Context, name string, isCask bool) (*BrewPackage, error) {
	if err := validName(name); err != nil {
		return nil, err
	}
	args := []string{"info", "--json=v2"}
	if isCask {
		args = append(args, "--cask")
	} else {
		args = append(args, "--formula")
	}
	args = append(args, name)
	out, err := runBrew(ctx, args...)
	if err != nil {
		return nil, err
	}
	pkgs, err := decodeInfoV2([]byte(out))
	if err != nil {
		return nil, err
	}
	if len(pkgs) == 0 {
		return nil, fmt.Errorf("no such package: %s", name)
	}
	return &pkgs[0], nil
}

// Search runs `brew search` for both formulae and casks and merges results.
func Search(ctx context.Context, query string) ([]SearchResult, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return []SearchResult{}, nil
	}
	results := []SearchResult{}

	formulaLines, err := runBrewLines(ctx, "search", "--formula", q)
	if err == nil {
		for _, l := range formulaLines {
			if isSearchNoise(l) {
				continue
			}
			results = append(results, SearchResult{Name: l, IsCask: false})
		}
	}

	caskLines, err := runBrewLines(ctx, "search", "--cask", q)
	if err == nil {
		for _, l := range caskLines {
			if isSearchNoise(l) {
				continue
			}
			results = append(results, SearchResult{Name: l, IsCask: true})
		}
	}

	return results, nil
}

func isSearchNoise(l string) bool {
	l = strings.TrimSpace(l)
	if l == "" {
		return true
	}
	if strings.HasPrefix(l, "==>") {
		return true
	}
	return false
}

// Outdated returns outdated formulae and casks.
func Outdated(ctx context.Context) ([]OutdatedPackage, error) {
	out, err := runBrew(ctx, "outdated", "--json=v2")
	if err != nil {
		return nil, err
	}
	var raw struct {
		Formulae []map[string]interface{} `json:"formulae"`
		Casks    []map[string]interface{} `json:"casks"`
	}
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return nil, fmt.Errorf("parsing brew outdated output: %w", err)
	}
	results := []OutdatedPackage{}
	for _, f := range raw.Formulae {
		results = append(results, OutdatedPackage{
			Name:              mGetString(f, "name"),
			IsCask:            false,
			InstalledVersions: mGetStringSlice(f, "installed_versions"),
			CurrentVersion:    mGetString(f, "current_version"),
			Pinned:            mGetBool(f, "pinned"),
		})
	}
	for _, c := range raw.Casks {
		results = append(results, OutdatedPackage{
			Name:              mGetString(c, "name"),
			IsCask:            true,
			InstalledVersions: mGetStringSlice(c, "installed_versions"),
			CurrentVersion:    mGetString(c, "current_version"),
		})
	}
	return results, nil
}

// Taps lists installed taps.
func Taps(ctx context.Context) ([]string, error) {
	return runBrewLines(ctx, "tap")
}

// Services lists brew services.
func Services(ctx context.Context) ([]Service, error) {
	out, err := runBrew(ctx, "services", "list", "--json")
	if err != nil {
		return nil, err
	}
	var raw []map[string]interface{}
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return nil, fmt.Errorf("parsing brew services output: %w", err)
	}
	services := []Service{}
	for _, s := range raw {
		pid := 0
		if v, ok := s["pid"]; ok && v != nil {
			if f, ok := v.(float64); ok {
				pid = int(f)
			}
		}
		services = append(services, Service{
			Name:    mGetString(s, "name"),
			Status:  mGetString(s, "status"),
			User:    mGetString(s, "user"),
			File:    mGetString(s, "file"),
			Running: mGetBool(s, "running"),
			PID:     pid,
		})
	}
	return services, nil
}

// Leaves lists formulae not depended on by any other installed formula.
func Leaves(ctx context.Context) ([]string, error) {
	return runBrewLines(ctx, "leaves")
}

// Uses lists installed formulae that depend on the given formula.
func Uses(ctx context.Context, name string) ([]string, error) {
	if err := validName(name); err != nil {
		return nil, err
	}
	return runBrewLines(ctx, "uses", "--installed", name)
}

// Deps returns the raw dependency tree text for a package.
func Deps(ctx context.Context, name string, isCask bool) (string, error) {
	if err := validName(name); err != nil {
		return "", err
	}
	args := []string{"deps", "--tree"}
	if isCask {
		args = append(args, "--cask")
	} else {
		args = append(args, "--formula")
	}
	args = append(args, name)
	return runBrew(ctx, args...)
}

// CacheInfo reports the size of brew's download cache.
func GetCacheInfo(ctx context.Context) (*CacheInfo, error) {
	pathOut, err := runBrew(ctx, "--cache")
	if err != nil {
		return nil, err
	}
	path := strings.TrimSpace(pathOut)
	size := dirSize(path)
	return &CacheInfo{Path: path, SizeBytes: size, SizeHuman: humanBytes(size)}, nil
}

func dirSize(path string) int64 {
	var total int64
	_ = filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	return total
}

func humanBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}

// Config returns the raw `brew config` diagnostic text.
func Config(ctx context.Context) (string, error) {
	return runBrew(ctx, "config")
}

// GetSystemInfo assembles a dashboard summary.
func GetSystemInfo(ctx context.Context) (*SystemInfo, error) {
	path, err := resolveBrewPath()
	if err != nil {
		return nil, err
	}
	versionOut, _ := runBrew(ctx, "--version")
	version := strings.TrimSpace(strings.SplitN(versionOut, "\n", 2)[0])
	prefixOut, _ := runBrew(ctx, "--prefix")
	prefix := strings.TrimSpace(prefixOut)

	info := &SystemInfo{
		BrewPath:    path,
		BrewVersion: version,
		Prefix:      prefix,
		Cellar:      filepath.Join(prefix, "Cellar"),
		Caskroom:    filepath.Join(prefix, "Caskroom"),
	}

	pkgs, err := ListInstalled(ctx)
	if err == nil {
		for _, p := range pkgs {
			if p.IsCask {
				info.InstalledCask++
			} else {
				info.InstalledForm++
			}
			if p.Deprecated {
				info.DeprecatedCount++
			}
			if p.Disabled {
				info.DisabledCount++
			}
			if p.Pinned {
				info.PinnedCount++
			}
		}
	}
	outdated, err := Outdated(ctx)
	if err == nil {
		info.OutdatedCount = len(outdated)
	}
	return info, nil
}
