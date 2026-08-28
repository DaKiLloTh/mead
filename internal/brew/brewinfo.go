package brew

// This file uses encoding/json/v2 (stable as of Go 1.27) for mead's own
// decoding of brew's JSON output. That's independent of the Wails RPC
// boundary, which still marshals App method return values with plain v1
// internally (see internal/binding/boundMethod.go in wailsapp/wails/v2) --
// this import doesn't change that, and the explicit []T{} empty-slice
// initializations elsewhere in this package that guard against v1's
// nil-slice-as-null behavior across that boundary must stay as they are.
import (
	"context"
	"encoding/json/v2"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
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

func mGetStringSlice(m map[string]any, key string) []string {
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

func mGetMap(m map[string]any, key string) map[string]any {
	if v, ok := m[key]; ok && v != nil {
		if mm, ok := v.(map[string]any); ok {
			return mm
		}
	}
	return nil
}

func mGetArr(m map[string]any, key string) []any {
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
		Formulae []map[string]any `json:"formulae"`
		Casks    []map[string]any `json:"casks"`
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

func formulaToPackage(f map[string]any) BrewPackage {
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
		if last, ok := installedArr[len(installedArr)-1].(map[string]any); ok {
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

func caskToPackage(c map[string]any) BrewPackage {
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
func interfaceStringSlice(v any) []string {
	switch t := v.(type) {
	case string:
		return []string{t}
	case []any:
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

	rankResults(results, q)
	enrichSearchResults(ctx, results)

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
	return decodeOutdatedV2([]byte(out))
}

// decodeOutdatedV2 parses `brew outdated --json=v2` output. Split out from
// Outdated so the decode logic (the part that actually depends on brew's
// JSON shape) is unit-testable without shelling out to brew.
func decodeOutdatedV2(data []byte) ([]OutdatedPackage, error) {
	var raw struct {
		Formulae []map[string]any `json:"formulae"`
		Casks    []map[string]any `json:"casks"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
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
	var raw []map[string]any
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
	var raw []map[string]any
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

// DependencyNode is one package in a structured dependency graph.
type DependencyNode struct {
	Name   string `json:"name"`
	IsCask bool   `json:"isCask"`
}

// DependencyEdge is a directed edge from a package to one of its direct
// dependencies in a structured dependency graph.
type DependencyEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// DependencyGraph is a structured node/edge dependency graph for a package,
// suitable for graph rendering -- unlike Deps's indented plain-text tree.
type DependencyGraph struct {
	Root  string           `json:"root"`
	Nodes []DependencyNode `json:"nodes"`
	Edges []DependencyEdge `json:"edges"`
}

// dotEdgePattern matches one `"parent" -> "child"` edge line from
// `brew deps --graph --dot` output.
var dotEdgePattern = regexp.MustCompile(`^\s*"([^"]+)"\s*->\s*"([^"]+)"\s*$`)

// parseDepsDot parses `brew deps --graph --dot`'s stdout into a
// DependencyGraph. The format is a minimal Graphviz DOT digraph: a
// "digraph {" header, one `"parent" -> "child"` line per direct dependency
// edge (quoted, arrow-separated), and a closing "}" -- see
// brewinfo_test.go for real captured fixtures. Any non-edge line (the
// digraph header/closing brace, blank lines) is ignored rather than
// treated as an error, so this stays forward-compatible with cosmetic
// formatting changes in future brew versions. A package with no
// dependencies produces an empty body ("digraph {\n\n}"), which yields a
// graph containing only the root node and no edges.
//
// Every non-root name discovered this way is a formula: brew's dependency
// model never lets a formula depend on a cask, and --graph's recursive
// walk only follows dependency edges, so every node reached by walking
// outward from the root is a formula. Only the root itself can be a cask
// (a cask depending directly on another cask is rare enough, and not
// distinguishable from this output alone, that it isn't worth chasing
// here) -- callers pass rootIsCask for it.
func parseDepsDot(dot string, root string, rootIsCask bool) *DependencyGraph {
	nodeSeen := map[string]bool{root: true}
	order := []string{root}
	edges := []DependencyEdge{}

	addNode := func(name string) {
		if !nodeSeen[name] {
			nodeSeen[name] = true
			order = append(order, name)
		}
	}

	for line := range strings.SplitSeq(dot, "\n") {
		m := dotEdgePattern.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		from, to := m[1], m[2]
		addNode(from)
		addNode(to)
		edges = append(edges, DependencyEdge{From: from, To: to})
	}

	nodes := make([]DependencyNode, 0, len(order))
	for _, name := range order {
		nodes = append(nodes, DependencyNode{Name: name, IsCask: name == root && rootIsCask})
	}

	return &DependencyGraph{Root: root, Nodes: nodes, Edges: edges}
}

// DepsGraph returns a structured node/edge dependency graph for a package,
// suitable for graph rendering (see parseDepsDot). Unlike Deps, this shells
// out to `brew deps --graph --dot`, which emits a machine-parseable
// Graphviz digraph instead of an indented text tree -- no fragile
// box-drawing-character parsing required. Installed-vs-not status isn't
// resolved here; the frontend already keeps a cached installed-packages
// list (via useInstalledPackages()) that it cross-references against by
// name, so there's no need to re-query per node on the backend.
func DepsGraph(ctx context.Context, name string, isCask bool) (*DependencyGraph, error) {
	if err := ValidName(name); err != nil {
		return nil, err
	}
	args := []string{"deps", "--graph", "--dot"}
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
	return parseDepsDot(out, name, isCask), nil
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

// homebrewLastUpdatedString is the pure decision logic behind
// GetHomebrewLastUpdated: given the mtime of brew's own FETCH_HEAD file and
// the error (if any) from stat'ing it, decides the SystemInfo.
// HomebrewLastUpdated value.
//
// Homebrew doesn't expose a separate "latest available Homebrew version" to
// diff against the installed one -- `brew update` updates Homebrew's own
// source alongside formula/cask definitions, so there's no clean "you're on
// vX, latest is vY" the way there is for individual outdated packages.
// What it does reliably track is when it was last updated: `brew --repo`
// is itself a git checkout, and git touches FETCH_HEAD inside that
// checkout's .git directory on every fetch it performs, including a fetch
// that finds nothing new and reports "Already up-to-date". That was
// confirmed empirically (see the PR description) rather than assumed --
// FETCH_HEAD's mtime moved to the current time after running `brew update`
// even when no new commits landed, which is exactly the "last checked"
// semantics wanted here. A plain `git log -1` commit date would instead
// reflect when upstream last shipped a commit to Homebrew's own source,
// which can lag well behind an up-to-date local checkout and would
// understate how recently the user actually updated.
//
// A stat error (non-git install, brew update never run and the file
// doesn't exist yet, permissions, ...) yields "" rather than an error --
// this is a nice-to-have indicator, not something a stat hiccup should
// turn into a failed GetSystemInfo call.
func homebrewLastUpdatedString(mtime time.Time, statErr error) string {
	if statErr != nil {
		return ""
	}
	return mtime.UTC().Format(time.RFC3339)
}

// GetHomebrewLastUpdated returns the RFC3339 timestamp of the last time
// `brew update` ran against this installation, or "" if it can't be
// determined. See homebrewLastUpdatedString for the reasoning behind the
// FETCH_HEAD-mtime approach.
func GetHomebrewLastUpdated(ctx context.Context) string {
	repoOut, err := RunBrew(ctx, "--repo")
	if err != nil {
		return ""
	}
	repo := strings.TrimSpace(repoOut)
	fetchHead := filepath.Join(repo, ".git", "FETCH_HEAD")
	info, statErr := os.Stat(fetchHead)
	var mtime time.Time
	if statErr == nil {
		mtime = info.ModTime()
	}
	return homebrewLastUpdatedString(mtime, statErr)
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
		BrewPath:            path,
		BrewVersion:         version,
		Prefix:              prefix,
		Cellar:              cellar,
		Caskroom:            caskroom,
		HomebrewLastUpdated: GetHomebrewLastUpdated(ctx),
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
