package brew

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// ---- generic map helpers for defensively decoding brew's JSON ----

func mGetString(m map[string]any, key string) string {
	if v, ok := m[key]; ok && v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func mGetBool(m map[string]any, key string) bool {
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
		if arr, ok := v.([]any); ok {
			for _, e := range arr {
				if s, ok := e.(string); ok {
					out = append(out, s)
				}
			}
		}
	}
	return out
}

func mGetMap(m map[string]interface{}, key string) map[string]any {
	if v, ok := m[key]; ok && v != nil {
		if mm, ok := v.(map[string]any); ok {
			return mm
		}
	}
	return nil
}

func mGetArr(m map[string]interface{}, key string) []interface{} {
	if v, ok := m[key]; ok && v != nil {
		if arr, ok := v.([]any); ok {
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
		Name:          mGetString(f, "name"),
		FullName:      mGetString(f, "full_name"),
		IsCask:        false,
		Tap:           mGetString(f, "tap"),
		Desc:          mGetString(f, "desc"),
		Homepage:      mGetString(f, "homepage"),
		License:       mGetString(f, "license"),
		Outdated:      mGetBool(f, "outdated"),
		Pinned:        mGetBool(f, "pinned"),
		Deprecated:    mGetBool(f, "deprecated"),
		Disabled:      mGetBool(f, "disabled"),
		KegOnly:       mGetBool(f, "keg_only"),
		Dependencies:  mGetStringSlice(f, "dependencies"),
		ConflictsWith: mGetStringSlice(f, "conflicts_with"),
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
	if linkedKeg := mGetString(f, "linked_keg"); linkedKeg != "" {
		p.Linked = linkedKeg == p.InstalledVersion
	}
	return p
}

func caskToPackage(c map[string]interface{}) BrewPackage {
	p := BrewPackage{
		Name:          mGetString(c, "token"),
		FullName:      mGetString(c, "full_token"),
		IsCask:        true,
		Tap:           mGetString(c, "tap"),
		Desc:          mGetString(c, "desc"),
		Homepage:      mGetString(c, "homepage"),
		Version:       mGetString(c, "version"),
		Outdated:      mGetBool(c, "outdated"),
		Deprecated:    mGetBool(c, "deprecated"),
		Disabled:      mGetBool(c, "disabled"),
		AutoUpdates:   mGetBool(c, "auto_updates"),
		Dependencies:  []string{},
		ConflictsWith: []string{},
	}
	if names := mGetStringSlice(c, "name"); len(names) > 0 && strings.TrimSpace(names[0]) != "" {
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
	p.Artifacts, p.AppPaths, p.ZapTrashPaths = parseCaskArtifacts(mGetArr(c, "artifacts"))
	return p
}

// parseCaskArtifacts turns brew's heterogeneous "artifacts" array into
// human-readable labels, any /Applications/*.app paths it installs (used for
// security inspection and quarantine removal), and the paths its `zap`
// stanza would trash on uninstall --zap (shown to the user before they
// opt into that).
func parseCaskArtifacts(artifacts []any) (labels []string, appPaths []string, zapPaths []string) {
	labels = []string{}
	appPaths = []string{}
	zapPaths = []string{}
	for _, raw := range artifacts {
		entry, ok := raw.(map[string]any)
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
			case "zap":
				if zapArr, ok := val.([]any); ok {
					for _, ze := range zapArr {
						if zm, ok := ze.(map[string]any); ok {
							zapPaths = append(zapPaths, mGetStringSlice(zm, "trash")...)
						}
					}
				}
			}
		}
	}
	return labels, appPaths, zapPaths
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
	out, err := RunBrew(ctx, "info", "--json=v2", "--installed")
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
	if err := ValidName(name); err != nil {
		return nil, err
	}
	args := []string{"info", "--json=v2"}
	if isCask {
		args = append(args, "--cask")
	} else {
		args = append(args, "--formula")
	}
	args = append(args, name)
	out, err := RunBrew(ctx, args...)
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

// searchKey builds a dedupe key for merging formula/cask search results.
// This intentionally duplicates the tiny "cask:"/"formula:" format that
// store.PkgKey also uses for its own, unrelated purpose (keying favorites/
// tags/notes) -- the two are conceptually independent, and sharing the
// helper would mean this package importing the store package just for a
// three-line string formatter.
func searchKey(name string, isCask bool) string {
	if isCask {
		return "cask:" + name
	}
	return "formula:" + name
}

// Search runs `brew search` for both formulae and casks and merges results.
func Search(ctx context.Context, query string, desc bool) ([]SearchResult, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return []SearchResult{}, nil
	}
	results := []SearchResult{}
	seen := map[string]bool{}

	add := func(lines []string, isCask bool) {
		for _, l := range lines {
			if isSearchNoise(l) {
				continue
			}
			name := l
			if desc {
				// `--desc` lines look like "name: description text"
				if before, _, ok := strings.Cut(l, ":"); ok {
					name = strings.TrimSpace(before)
				}
			}
			key := searchKey(name, isCask)
			if seen[key] {
				continue
			}
			seen[key] = true
			results = append(results, SearchResult{Name: name, IsCask: isCask})
		}
	}

	formulaArgs := []string{"search", "--formula"}
	caskArgs := []string{"search", "--cask"}
	if desc {
		formulaArgs = append(formulaArgs, "--desc")
		caskArgs = append(caskArgs, "--desc")
	}
	formulaArgs = append(formulaArgs, q)
	caskArgs = append(caskArgs, q)

	if lines, err := runBrewLines(ctx, formulaArgs...); err == nil {
		add(lines, false)
	}
	if lines, err := runBrewLines(ctx, caskArgs...); err == nil {
		add(lines, true)
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
func Outdated(ctx context.Context, greedy bool) ([]OutdatedPackage, error) {
	args := []string{"outdated", "--json=v2"}
	if greedy {
		args = append(args, "--greedy")
	}
	out, err := RunBrew(ctx, args...)
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

// TapInfo fetches detail (remote URL, formula/cask counts) for a single tap.
func TapInfo(ctx context.Context, name string) (*TapDetail, error) {
	if err := ValidName(name); err != nil {
		return nil, err
	}
	out, err := RunBrew(ctx, "tap-info", "--json", name)
	if err != nil {
		return nil, err
	}
	var raw []map[string]interface{}
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return nil, fmt.Errorf("parsing brew tap-info output: %w", err)
	}
	if len(raw) == 0 {
		return nil, fmt.Errorf("no such tap: %s", name)
	}
	t := raw[0]
	return &TapDetail{
		Name:         mGetString(t, "name"),
		Installed:    mGetBool(t, "installed"),
		Official:     mGetBool(t, "official"),
		Remote:       mGetString(t, "remote"),
		FormulaCount: len(mGetArr(t, "formula_names")),
		CaskCount:    len(mGetArr(t, "cask_tokens")),
		LastCommit:   mGetString(t, "last_commit"),
	}, nil
}

// Services lists brew services.
func Services(ctx context.Context) ([]Service, error) {
	out, err := RunBrew(ctx, "services", "list", "--json")
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
	if err := ValidName(name); err != nil {
		return nil, err
	}
	return runBrewLines(ctx, "uses", "--installed", name)
}

// Missing lists installed formulae with a dependency that isn't installed
// (e.g. an interrupted install, or a manually removed dependency).
func Missing(ctx context.Context) ([]string, error) {
	return runBrewLines(ctx, "missing")
}

// Deps returns the raw dependency tree text for a package.
func Deps(ctx context.Context, name string, isCask bool) (string, error) {
	if err := ValidName(name); err != nil {
		return "", err
	}
	args := []string{"deps", "--tree"}
	if isCask {
		args = append(args, "--cask")
	} else {
		args = append(args, "--formula")
	}
	args = append(args, name)
	return RunBrew(ctx, args...)
}

// GetCacheInfo reports the size of brew's download cache.
func GetCacheInfo(ctx context.Context) (*CacheInfo, error) {
	pathOut, err := RunBrew(ctx, "--cache")
	if err != nil {
		return nil, err
	}
	path := strings.TrimSpace(pathOut)
	size, err := dirSize(path)
	if err != nil {
		return nil, fmt.Errorf("measuring cache size at %s: %w", path, err)
	}
	return &CacheInfo{Path: path, SizeBytes: size, SizeHuman: humanBytes(size)}, nil
}

// dirSize returns the total size in bytes of all files under path, walking
// recursively.
//
// A root that doesn't exist at all is treated as a healthy, empty result
// (0, nil) rather than an error -- that's the normal state of, say, brew's
// download cache on a fresh install that's never downloaded anything, and
// callers like GetCacheInfo should show "0 B", not an error banner, for it.
// Any other failure (permission denied on the root or on a subpath partway
// through the walk, an I/O error, etc) is returned rather than silently
// swallowed, so a caller never mistakes a truncated partial total for the
// true size.
func dirSize(path string) (int64, error) {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	var total int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			total += info.Size()
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return total, nil
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
	return RunBrew(ctx, "config")
}

// BundleCheck reports whether a Brewfile's dependencies are all installed.
func BundleCheck(ctx context.Context, path string) (string, error) {
	out, err := RunBrew(ctx, "bundle", "check", "--verbose", "--file="+path)
	if err != nil {
		// `bundle check` exits non-zero when unsatisfied; that's the answer,
		// not a failure to report.
		return out, nil
	}
	return out, nil
}

// BundleList lists everything a Brewfile declares.
func BundleList(ctx context.Context, path string) (string, error) {
	return RunBrew(ctx, "bundle", "list", "--all", "--file="+path)
}

// bundleCleanupSectionRe matches the section headers `brew bundle cleanup`
// prints before each group of names, e.g. "Would uninstall casks:".
var bundleCleanupSectionRe = regexp.MustCompile(`^Would uninstall (formulae|casks):$`)

// BundleCleanupPreview runs `brew bundle cleanup` *without* --force, which
// only ever prints what would be removed, and parses that into a structured
// list instead of leaving the frontend to render raw CLI text.
func BundleCleanupPreview(ctx context.Context, path string) ([]BundleCleanupItem, error) {
	out, err := RunBrew(ctx, "bundle", "cleanup", "--file="+path)
	if err != nil {
		return nil, err
	}
	items := []BundleCleanupItem{}
	isCask := false
	for line := range strings.SplitSeq(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if m := bundleCleanupSectionRe.FindStringSubmatch(line); m != nil {
			isCask = m[1] == "casks"
			continue
		}
		if strings.HasPrefix(line, "Run `brew bundle cleanup") {
			continue
		}
		items = append(items, BundleCleanupItem{Name: line, IsCask: isCask})
	}
	return items, nil
}

// cellarAndCaskroomPaths resolves brew's install prefix and derives the
// Cellar (formulae) and Caskroom (casks) directories beneath it. This is the
// one place that logic lives -- GetSystemInfo and LargestInstalled both call
// it rather than re-deriving `<prefix>/Cellar` and `<prefix>/Caskroom`
// independently.
func cellarAndCaskroomPaths(ctx context.Context) (prefix, cellar, caskroom string, err error) {
	prefixOut, err := RunBrew(ctx, "--prefix")
	if err != nil {
		return "", "", "", err
	}
	prefix = strings.TrimSpace(prefixOut)
	return prefix, filepath.Join(prefix, "Cellar"), filepath.Join(prefix, "Caskroom"), nil
}

// GetSystemInfo assembles a dashboard summary.
func GetSystemInfo(ctx context.Context) (*SystemInfo, error) {
	path, err := ResolveBrewPath()
	if err != nil {
		return nil, err
	}
	versionOut, _ := RunBrew(ctx, "--version")
	version := strings.TrimSpace(strings.SplitN(versionOut, "\n", 2)[0])
	prefix, cellar, caskroom, _ := cellarAndCaskroomPaths(ctx)

	base := &SystemInfo{
		BrewPath:    path,
		BrewVersion: version,
		Prefix:      prefix,
		Cellar:      cellar,
		Caskroom:    caskroom,
	}

	pkgs, pkgsErr := ListInstalled(ctx)
	outdated, outdatedErr := Outdated(ctx, false)

	return buildSystemInfo(base, pkgs, pkgsErr, outdated, outdatedErr)
}

// buildSystemInfo is the pure decision logic behind GetSystemInfo: given the
// already-populated base fields (brew path/version/prefix/etc, which come
// from I/O that GetSystemInfo performs) plus the results (or errors) of the
// ListInstalled and Outdated sub-calls, it decides what SystemInfo or error
// to hand back.
//
// It deliberately returns an error instead of a fabricated zero-value
// SystemInfo when a sub-call fails - a transient brew failure must not be
// indistinguishable from "0 formulae installed, 0 casks installed, 0
// outdated", which is what a genuinely empty, healthy system looks like.
func buildSystemInfo(base *SystemInfo, installed []BrewPackage, installedErr error, outdated []OutdatedPackage, outdatedErr error) (*SystemInfo, error) {
	if installedErr != nil {
		return nil, fmt.Errorf("listing installed packages: %w", installedErr)
	}
	if outdatedErr != nil {
		return nil, fmt.Errorf("checking outdated packages: %w", outdatedErr)
	}

	info := *base
	for _, p := range installed {
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
	info.OutdatedCount = len(outdated)
	return &info, nil
}
