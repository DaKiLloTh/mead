package security

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"mead/internal/brew"
)

// leftoverLocation describes one of the well-known, narrowly-scoped
// filesystem locations macOS apps conventionally leave traces in. This is
// the complete list ScanLeftovers ever looks at -- deliberately not a
// broader walk of arbitrary user directories, since a general filesystem
// sweep looking for "leftover-looking" files would be both slow and risky.
type leftoverLocation struct {
	kind   LeftoverKind
	relDir string // relative to $HOME/Library
}

var leftoverLocations = []leftoverLocation{
	{kind: LeftoverApplicationSupport, relDir: "Application Support"},
	{kind: LeftoverCaches, relDir: "Caches"},
	{kind: LeftoverLogs, relDir: "Logs"},
	{kind: LeftoverPreferences, relDir: "Preferences"},
	{kind: LeftoverSavedState, relDir: "Saved Application State"},
}

// cfBundleIdentifierRe extracts CFBundleIdentifier from an Info.plist
// that's already been normalized to XML text via readPlistXML (see
// icons.go), the same narrow-regex-over-normalized-XML approach
// cfBundleIconFileRe uses for CFBundleIconFile.
var cfBundleIdentifierRe = regexp.MustCompile(`(?s)<key>CFBundleIdentifier</key>\s*<string>([^<]*)</string>`)

// parseCFBundleIdentifier pulls the CFBundleIdentifier value out of an
// Info.plist's XML text, returning "" if the key isn't present.
func parseCFBundleIdentifier(plistXML string) string {
	m := cfBundleIdentifierRe.FindStringSubmatch(plistXML)
	if m == nil {
		return ""
	}
	return strings.TrimSpace(m[1])
}

// readCFBundleIdentifier reads an app bundle's Info.plist and returns its
// CFBundleIdentifier (e.g. "com.company.AppName") -- the value macOS itself
// uses to name that app's entries in Preferences and Saved Application
// State.
func readCFBundleIdentifier(ctx context.Context, plistPath string) (string, error) {
	xmlOut, err := readPlistXML(ctx, plistPath)
	if err != nil {
		return "", err
	}
	id := parseCFBundleIdentifier(xmlOut)
	if id == "" {
		return "", fmt.Errorf("no CFBundleIdentifier in %s", plistPath)
	}
	return id, nil
}

// buildLegitimateSet gathers every name/identifier that ScanLeftovers must
// never flag: every installed cask's token, full (display) name, resolved
// .app bundle name, and (when the bundle's Info.plist is still readable)
// its CFBundleIdentifier. Everything is lowercased for case-insensitive
// comparison against leftover entry names, which macOS doesn't consistently
// case the same way brew does.
func buildLegitimateSet(ctx context.Context) (map[string]bool, error) {
	pkgs, err := brew.ListInstalled(ctx)
	if err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for _, p := range pkgs {
		if !p.IsCask {
			continue
		}
		addLegitimateName(set, p.Name)
		addLegitimateName(set, p.FullName)

		appPath := ResolveCaskAppPath(&p)
		if appPath == "" {
			continue
		}
		addLegitimateName(set, strings.TrimSuffix(filepath.Base(appPath), ".app"))

		plistPath := filepath.Join(appPath, "Contents", "Info.plist")
		if bundleID, err := readCFBundleIdentifier(ctx, plistPath); err == nil {
			addLegitimateName(set, bundleID)
		}
	}
	return set, nil
}

func addLegitimateName(set map[string]bool, name string) {
	name = strings.TrimSpace(name)
	if name == "" {
		return
	}
	set[strings.ToLower(name)] = true
}

// leftoverCandidate is a raw directory-listing entry from one of the
// well-known leftover locations, before its size is measured -- kept
// minimal so the orphan decision (filterOrphanEntries) is pure and testable
// without touching disk.
type leftoverCandidate struct {
	Path string
	Name string // raw entry name on disk, e.g. "Google Chrome" or "com.company.App.plist"
	Kind LeftoverKind
}

// compareKey derives the identifier filterOrphanEntries checks against the
// legitimate set from a candidate's raw entry name: Preferences and Saved
// Application State name entries after the bundle identifier plus a fixed
// suffix (".plist" / ".savedState"), which must be stripped before
// comparison; Application Support/Caches/Logs entries are already bare (an
// app display name, or sometimes a bundle identifier).
func compareKey(kind LeftoverKind, rawName string) string {
	return strings.ToLower(strings.TrimSpace(displayName(kind, rawName)))
}

// displayName strips a leftover location's fixed suffix (if any) from a raw
// entry name, e.g. "com.company.App.plist" -> "com.company.App". Used both
// for the comparison key and for the human-facing LeftoverItem.Name.
func displayName(kind LeftoverKind, rawName string) string {
	switch kind {
	case LeftoverPreferences:
		return strings.TrimSuffix(rawName, ".plist")
	case LeftoverSavedState:
		return strings.TrimSuffix(rawName, ".savedState")
	default:
		return rawName
	}
}

// filterOrphanEntries is the pure decision core of ScanLeftovers: given the
// raw entries found under the well-known leftover locations and the set of
// currently-legitimate app names/identifiers (every installed cask's token,
// full name, resolved .app name, and bundle identifier, all lowercased), it
// returns only the entries that don't correspond to anything in that set --
// the ones worth showing the user as possible leftovers.
//
// This is deliberately conservative and best-effort: an entry only escapes
// being flagged if it matches the legitimate set exactly (case-
// insensitively) once its location-specific suffix is stripped -- there's
// no fuzzy/partial matching, since a false "still legitimate" match would
// hide something the user might actually want to clean up, while a false
// "orphan" match is fine because this is a preview the user reviews and
// selects from, never auto-deleted.
//
// Anything under the com.apple. bundle-identifier namespace is always
// treated as legitimate regardless of the set passed in: those are macOS's
// own preferences/state/caches, not something any Homebrew cask would ever
// own, and mead has no business ever suggesting they get removed.
func filterOrphanEntries(entries []leftoverCandidate, legitimate map[string]bool) []leftoverCandidate {
	out := make([]leftoverCandidate, 0, len(entries))
	for _, e := range entries {
		key := compareKey(e.Kind, e.Name)
		if key == "" || strings.HasPrefix(key, ".") || legitimate[key] || strings.HasPrefix(key, "com.apple.") {
			continue
		}
		out = append(out, e)
	}
	return out
}

// listCandidates reads the top-level entries of each well-known leftover
// location under libraryDir ($HOME/Library in real use, a temp-dir fixture
// in tests) and turns them into leftoverCandidates. A location that doesn't
// exist at all (e.g. no app has ever saved window state) yields no
// candidates from it rather than an error -- the same "missing == empty,
// not broken" pattern LargestInstalled's scanPackageDir uses for a missing
// Caskroom.
//
// Preferences is filtered to *.plist files (that directory also holds
// ByHost/ and other non-per-app entries mead has no business touching), and
// Saved Application State to *.savedState directories; the other three
// locations are filtered to directories, since that's the shape a real
// app's Application Support/Caches/Logs entry always takes.
func listCandidates(libraryDir string) []leftoverCandidate {
	var out []leftoverCandidate
	for _, loc := range leftoverLocations {
		dir := filepath.Join(libraryDir, loc.relDir)
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			name := e.Name()
			switch loc.kind {
			case LeftoverPreferences:
				if e.IsDir() || !strings.HasSuffix(name, ".plist") {
					continue
				}
			case LeftoverSavedState:
				if !e.IsDir() || !strings.HasSuffix(name, ".savedState") {
					continue
				}
			default:
				if !e.IsDir() {
					continue
				}
			}
			out = append(out, leftoverCandidate{
				Path: filepath.Join(dir, name),
				Name: name,
				Kind: loc.kind,
			})
		}
	}
	return out
}

// pathSize returns the total size in bytes of everything under path -- a
// single file's own size for a Preferences .plist, or the recursive size of
// a directory for everything else. Mirrors brew's own (unexported) dirSize
// helper in internal/brew/brewinfo.go; duplicated here in miniature rather
// than exported cross-package just for this one caller.
func pathSize(path string) (int64, error) {
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

// humanBytes formats a byte count the same way brew.humanBytes does
// (unexported there; duplicated here for the same reason as pathSize).
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

// scanLeftovers is ScanLeftovers's testable core: given a $HOME/Library path
// (the real one in production, a temp-dir fixture in tests) and an
// already-built legitimate set, it lists candidates, filters them down to
// orphans via the pure filterOrphanEntries, and measures each survivor's
// on-disk size, sorted largest-first.
func scanLeftovers(libraryDir string, legitimate map[string]bool) []LeftoverItem {
	orphans := filterOrphanEntries(listCandidates(libraryDir), legitimate)

	items := make([]LeftoverItem, 0, len(orphans))
	for _, o := range orphans {
		size, err := pathSize(o.Path)
		if err != nil {
			// Best-effort, same posture as LargestInstalled's
			// scanPackageDir: an unreadable entry shouldn't drop it from
			// the report, just show it as 0 rather than an exact size.
			size = 0
		}
		items = append(items, LeftoverItem{
			Path:      o.Path,
			Name:      displayName(o.Kind, o.Name),
			Kind:      o.Kind,
			SizeBytes: size,
			SizeHuman: humanBytes(size),
		})
	}

	sort.Slice(items, func(i, j int) bool { return items[i].SizeBytes > items[j].SizeBytes })
	return items
}

// ScanLeftovers scans the well-known locations macOS apps conventionally
// leave traces in (~/Library/Application Support, ~/Library/Caches,
// ~/Library/Preferences, ~/Library/Logs, and
// ~/Library/Saved Application State) for entries that don't correspond to
// any app currently installed via Homebrew -- orphaned config/cache/support
// files left behind by apps that were uninstalled outside brew, or that
// were never brew-managed to begin with.
//
// This is inherently best-effort (a leftover folder named "MyApp" might or
// might not correspond to some app that used to exist -- there's no perfect
// ground truth), so the result is meant as a preview for the user to
// manually review and select from, never acted on automatically.
func ScanLeftovers(ctx context.Context) ([]LeftoverItem, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	legitimate, err := buildLegitimateSet(ctx)
	if err != nil {
		return nil, err
	}
	return scanLeftovers(filepath.Join(home, "Library"), legitimate), nil
}

// isWithinLeftoverLocation reports whether path is exactly one of the
// well-known leftover locations' direct children under libraryDir -- e.g.
// "<libraryDir>/Caches/SomeApp", never "<libraryDir>/Caches" itself (which
// would wipe the whole cache directory) and never anything outside the five
// well-known locations altogether. This is the safety check DeleteLeftovers
// runs before removing anything, even though in practice every path it's
// called with originated from a prior ScanLeftovers result the user
// selected from.
func isWithinLeftoverLocation(path, libraryDir string) bool {
	for _, loc := range leftoverLocations {
		dir := filepath.Join(libraryDir, loc.relDir)
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			continue
		}
		if rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		if !strings.Contains(rel, string(filepath.Separator)) {
			return true
		}
	}
	return false
}

// DeleteLeftovers permanently removes exactly the given paths -- nothing
// more. Each path is validated to be a direct child of one of the
// well-known leftover locations before anything is touched (see
// isWithinLeftoverLocation); a path that fails that check is reported as an
// error rather than silently skipped, and every other requested path is
// still attempted. This is a genuinely destructive, irreversible operation
// -- callers (the App method backing the frontend's confirm-then-delete
// flow) must only ever pass paths the user explicitly selected from a
// ScanLeftovers preview.
func DeleteLeftovers(ctx context.Context, paths []string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	libraryDir := filepath.Join(home, "Library")

	var errs []string
	for _, p := range paths {
		clean := filepath.Clean(p)
		if !isWithinLeftoverLocation(clean, libraryDir) {
			errs = append(errs, fmt.Sprintf("%s: refusing to remove a path outside the well-known leftover locations", p))
			continue
		}
		if err := os.RemoveAll(clean); err != nil {
			errs = append(errs, fmt.Sprintf("%s: %s", p, err.Error()))
		}
	}
	if len(errs) > 0 {
		return fmt.Errorf("couldn't remove everything: %s", strings.Join(errs, "; "))
	}
	return nil
}
