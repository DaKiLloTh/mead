// Package app is the Wails-bound orchestration/glue layer: the App struct
// and every method exposed to the frontend. It calls into the brew, store,
// jobs, and security packages to do the actual work.
package app

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mead/internal/brew"
	"mead/internal/jobs"
	"mead/internal/security"
	"mead/internal/store"
	"mead/internal/system"
)

// gistURLRe matches a gist.github.com URL embedded in `brew gist-logs`
// output. The path segment is restricted to characters that actually
// appear in gist URLs (alphanumerics, hyphens, underscores, and slashes)
// so trailing punctuation from surrounding prose -- e.g. a period ending a
// sentence -- isn't swept into the match.
var gistURLRe = regexp.MustCompile(`https://gist\.github\.com/[A-Za-z0-9_/-]+`)

// App struct
type App struct {
	ctx   context.Context
	jobs  *jobs.Manager
	store *store.Store

	// iconsMu guards icons, an in-memory cache of extracted cask app icons
	// keyed by cask name (see CaskIcon). Extraction shells out to plutil
	// and sips, so it's worth caching -- but only for the life of this
	// process: it's cheap enough to regenerate on next launch that
	// persisting it to disk isn't worth the complexity.
	iconsMu sync.Mutex
	icons   map[string]string
}

// New creates a new App application struct.
func New() *App {
	st, err := store.NewStore()
	if err != nil {
		// Fall back to an in-memory, unpersisted store rather than failing
		// startup over what's a nice-to-have (favorites/tags/history).
		st = store.NewInMemory()
	}
	return &App{jobs: jobs.NewManager(), store: st}
}

// Startup is called when the app starts. The context is saved so we can
// call the runtime methods.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.jobs.SetContext(ctx)
}

func (a *App) record(action, name string, isCask bool) func(success bool) {
	return func(success bool) {
		a.store.AppendHistory(store.HistoryEntry{
			Time:    time.Now().Format(time.RFC3339),
			Action:  action,
			Name:    name,
			IsCask:  isCask,
			Success: success,
		})
	}
}

// ---- read-only queries ----

func (a *App) GetSystemInfo() (*brew.SystemInfo, error) {
	return brew.GetSystemInfo(a.ctx)
}

func (a *App) ListInstalled() ([]brew.BrewPackage, error) {
	return brew.ListInstalled(a.ctx)
}

func (a *App) GetInfo(name string, isCask bool) (*brew.BrewPackage, error) {
	return brew.GetInfo(a.ctx, name, isCask)
}

func (a *App) Search(query string, desc bool) ([]brew.SearchResult, error) {
	return brew.Search(a.ctx, query, desc)
}

func (a *App) Outdated(greedy bool) ([]brew.OutdatedPackage, error) {
	return brew.Outdated(a.ctx, greedy)
}

func (a *App) Missing() ([]string, error) {
	return brew.Missing(a.ctx)
}

func (a *App) Taps() ([]string, error) {
	return brew.Taps(a.ctx)
}

func (a *App) Services() ([]brew.Service, error) {
	return brew.Services(a.ctx)
}

func (a *App) Leaves() ([]string, error) {
	return brew.Leaves(a.ctx)
}

func (a *App) Uses(name string) ([]string, error) {
	return brew.Uses(a.ctx, name)
}

func (a *App) Deps(name string, isCask bool) (string, error) {
	return brew.Deps(a.ctx, name, isCask)
}

func (a *App) GetCacheInfo() (*brew.CacheInfo, error) {
	return brew.GetCacheInfo(a.ctx)
}

// LargestInstalledPackages reports the largest installed formulae and casks
// by on-disk size (top 20), so the user can see what's worth uninstalling to
// free up space.
func (a *App) LargestInstalledPackages() ([]brew.PackageSize, error) {
	return brew.LargestInstalled(a.ctx, 20)
}

func (a *App) Config() (string, error) {
	return brew.Config(a.ctx)
}

// SystemLocale reports the current macOS user's preferred locale (e.g.
// "en-US"), or "" if it can't be determined. The frontend calls this once
// at startup to seed i18next's initial language -- see system.SystemLocale
// for why this is more reliable here than the webview's navigator.language.
func (a *App) SystemLocale() string {
	return system.SystemLocale(a.ctx)
}

// ---- streaming (long-running) actions; each returns a job id, and the
// frontend subscribes to job:start / job:output / job:done events ----

// caskAppDirFlag returns the `--appdir=<dir>` flag for a configured cask
// install directory, or nil if none is configured (blank meaning "use
// brew's default"). Shared by caskFlagsFor (which always forces --cask
// alongside it) and buildCollectionInstallArgs (which appends it without
// --cask, since a collection install must not force every package to
// resolve as a cask) so the appdir-flag format is defined in exactly one
// place.
func caskAppDirFlag(caskAppDir string) []string {
	if caskAppDir == "" {
		return nil
	}
	return []string{"--appdir=" + caskAppDir}
}

// caskFlagsFor is the pure core of caskFlags: given a cask-appdir setting
// (blank meaning "use brew's default"), it returns the flags to append for
// a command that installs/reinstalls/upgrades a single cask -- forcing
// --cask (to disambiguate the name) plus --appdir if a custom directory is
// configured. Split out from caskFlags so it's directly unit testable
// without an *App/*Store.
func caskFlagsFor(caskAppDir string) []string {
	flags := []string{"--cask"}
	flags = append(flags, caskAppDirFlag(caskAppDir)...)
	return flags
}

// caskFlags returns the flags to append for a cask-touching command,
// including --appdir if the user has set a custom cask install directory in
// Settings.
func (a *App) caskFlags() []string {
	return caskFlagsFor(a.store.CaskAppDir())
}

func (a *App) Install(name string, isCask bool) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Install %s", name), err.Error())
	}
	args := []string{"install"}
	if isCask {
		args = append(args, a.caskFlags()...)
	}
	args = append(args, name)
	return a.jobs.StartTracked(fmt.Sprintf("Install %s", name), a.record("install", name, isCask), args...)
}

func (a *App) Uninstall(name string, isCask bool, zap bool, force bool) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Uninstall %s", name), err.Error())
	}
	args := []string{"uninstall"}
	if isCask {
		args = append(args, "--cask")
		if zap {
			args = append(args, "--zap")
		}
	}
	if force {
		args = append(args, "--force")
	}
	args = append(args, name)
	title := fmt.Sprintf("Uninstall %s", name)
	switch {
	case zap && force:
		title = fmt.Sprintf("Uninstall %s (all versions, and its data)", name)
	case zap:
		title = fmt.Sprintf("Uninstall %s (and its data)", name)
	case force:
		title = fmt.Sprintf("Uninstall %s (all versions)", name)
	}
	return a.jobs.StartTracked(title, a.record("uninstall", name, isCask), args...)
}

func (a *App) Reinstall(name string, isCask bool) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Reinstall %s", name), err.Error())
	}
	args := []string{"reinstall"}
	if isCask {
		args = append(args, a.caskFlags()...)
	}
	args = append(args, name)
	return a.jobs.StartTracked(fmt.Sprintf("Reinstall %s", name), a.record("reinstall", name, isCask), args...)
}

func (a *App) Upgrade(name string, isCask bool) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Upgrade %s", name), err.Error())
	}
	args := []string{"upgrade"}
	if isCask {
		args = append(args, a.caskFlags()...)
	}
	args = append(args, name)
	return a.jobs.StartTracked(fmt.Sprintf("Upgrade %s", name), a.record("upgrade", name, isCask), args...)
}

func (a *App) UpgradeAll(greedy bool) string {
	args := []string{"upgrade"}
	title := "Upgrade all packages"
	if greedy {
		args = append(args, "--greedy")
		title = "Upgrade all packages (including auto-updating casks)"
	}
	return a.jobs.StartTracked(title, a.record("upgrade", "all packages", false), args...)
}

// Update is the one job allowed to run brew's own auto-update machinery --
// everywhere else we suppress it (see brew.Env), so a GUI click doesn't
// silently trigger a slow background update.
func (a *App) Update() string {
	return a.jobs.StartWithEnv("Update Homebrew", brew.EnvAllowingAutoUpdate(), "update")
}

func (a *App) Cleanup(dryRun bool) string {
	args := []string{"cleanup"}
	if dryRun {
		args = append(args, "-n")
	}
	title := "Cleanup"
	if dryRun {
		title = "Cleanup (preview)"
	}
	return a.jobs.Start(title, args...)
}

// ClearCache runs `brew cleanup --prune=all`, which removes every cache
// entry regardless of age -- unlike the plain Cleanup above, it doesn't
// respect Homebrew's default 120-day retention (or its habit of keeping the
// most recent download around in case of reinstall). Homebrew's own safety
// checks around in-use bottles still apply.
func (a *App) ClearCache() string {
	return a.jobs.Start("Clear Cache", "cleanup", "--prune=all")
}

func (a *App) Autoremove(dryRun bool) string {
	args := []string{"autoremove"}
	title := "Remove orphaned dependencies"
	if dryRun {
		args = append(args, "--dry-run")
		title = "Remove orphaned dependencies (preview)"
	}
	return a.jobs.Start(title, args...)
}

func (a *App) Doctor() string {
	return a.jobs.StartLenient("Doctor", "doctor")
}

func (a *App) Pin(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Pin %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Pin %s", name), a.record("pin", name, false), "pin", name)
}

func (a *App) Unpin(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Unpin %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Unpin %s", name), a.record("unpin", name, false), "unpin", name)
}

func (a *App) Link(name string, overwrite bool) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Link %s", name), err.Error())
	}
	args := []string{"link"}
	if overwrite {
		args = append(args, "--overwrite", "--force")
	}
	args = append(args, name)
	return a.jobs.StartTracked(fmt.Sprintf("Link %s", name), a.record("link", name, false), args...)
}

func (a *App) Unlink(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Unlink %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Unlink %s", name), a.record("unlink", name, false), "unlink", name)
}

func (a *App) TapAdd(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Tap %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Tap %s", name), a.record("tap", name, false), "tap", name)
}

func (a *App) TapRemove(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Untap %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Untap %s", name), a.record("untap", name, false), "untap", name)
}

// TapRemoveForce is offered as a retry when a plain untap fails because the
// tap still has installed formulae from it.
func (a *App) TapRemoveForce(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Untap %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Force untap %s", name), a.record("untap", name, false), "untap", "--force", name)
}

func (a *App) TapInfo(name string) (*brew.TapDetail, error) {
	return brew.TapInfo(a.ctx, name)
}

func (a *App) ServiceStart(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Start service %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Start service %s", name), "services", "start", name)
}

func (a *App) ServiceStop(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Stop service %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Stop service %s", name), "services", "stop", name)
}

func (a *App) ServiceRestart(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Restart service %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Restart service %s", name), "services", "restart", name)
}

func (a *App) ServicesCleanup() string {
	return a.jobs.Start("Clean up unused services", "services", "cleanup")
}

func (a *App) CancelJob(id string) bool {
	return a.jobs.Cancel(id)
}

// ---- user data: favorites, tags, notes, snoozes, history ----

func (a *App) GetUserData() store.UserData {
	return a.store.Snapshot()
}

func (a *App) ToggleFavorite(name string, isCask bool) error {
	return a.store.ToggleFavorite(store.PkgKey(name, isCask))
}

func (a *App) SetTags(name string, isCask bool, tags []string) error {
	return a.store.SetTags(store.PkgKey(name, isCask), tags)
}

func (a *App) SetNote(name string, isCask bool, note string) error {
	return a.store.SetNote(store.PkgKey(name, isCask), note)
}

func (a *App) SnoozePackage(name string, isCask bool, days int) error {
	return a.store.Snooze(store.PkgKey(name, isCask), time.Now().AddDate(0, 0, days))
}

func (a *App) UnsnoozePackage(name string, isCask bool) error {
	return a.store.Unsnooze(store.PkgKey(name, isCask))
}

func (a *App) ClearHistory() error {
	return a.store.ClearHistory()
}

func (a *App) SetCaskAppDir(dir string) error {
	return a.store.SetCaskAppDir(strings.TrimSpace(dir))
}

// ClearAllData wipes favorites/tags/notes/snoozes/history but keeps
// app-level Settings (e.g. the cask install directory).
func (a *App) ClearAllData() error {
	return a.store.ClearAll()
}

func (a *App) RevealLocalDataFile() error {
	return security.RevealInFinder(a.ctx, a.store.Path())
}

// ---- user data backup/restore (native file dialogs, same pattern as the
// Brewfile export/import below) ----

// ExportUserDataToFile writes the current UserData (favorites, tags, notes,
// snoozes, history, and settings) as pretty-printed JSON -- the same shape
// already persisted to disk -- to a file the user picks via a native save
// dialog. Returns the chosen path, or "" if the user cancelled.
func (a *App) ExportUserDataToFile() (string, error) {
	raw, err := json.MarshalIndent(a.store.Snapshot(), "", "  ")
	if err != nil {
		return "", err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export mead data",
		DefaultFilename: "mead-data.json",
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // user cancelled
	}
	if err := os.WriteFile(path, raw, 0644); err != nil {
		return "", err
	}
	return path, nil
}

// PickUserDataFile opens a native file picker and returns the chosen path
// (empty string if cancelled), so the frontend can confirm the destructive
// replace *after* the user has actually picked a file, before calling
// ImportUserDataFromFile.
func (a *App) PickUserDataFile() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a mead data export",
	})
}

// ImportUserDataFromFile reads and parses the JSON file at path and
// replaces the store's favorites/tags/notes/snoozes/history with it (see
// Store.Import for what happens to Settings, and for the well-formedness
// check). A malformed or unrelated JSON file is rejected with an error
// and never touches existing state.
func (a *App) ImportUserDataFromFile(path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var data store.UserData
	if err := json.Unmarshal(raw, &data); err != nil {
		return fmt.Errorf("not a valid JSON file: %w", err)
	}
	return a.store.Import(data)
}

// ---- Homebrew's own analytics preference (distinct from the per-command
// HOMEBREW_NO_ANALYTICS suppression in brew.Env, which only affects mead's
// own invocations) ----

func (a *App) AnalyticsState() (string, error) {
	return brew.RunBrew(a.ctx, "analytics")
}

func (a *App) AnalyticsSetEnabled(enabled bool) string {
	if enabled {
		return a.jobs.Start("Enable Homebrew analytics", "analytics", "on")
	}
	return a.jobs.Start("Disable Homebrew analytics", "analytics", "off")
}

func (a *App) AnalyticsRegenerateUUID() string {
	return a.jobs.Start("Regenerate analytics ID", "analytics", "regenerate-uuid")
}

// ---- security ----

func (a *App) ScanVulnerabilities() ([]security.VulnResult, error) {
	pkgs, err := brew.ListInstalled(a.ctx)
	if err != nil {
		return nil, err
	}
	return security.ScanVulnerabilities(a.ctx, pkgs)
}

func (a *App) InspectCaskSecurity(name string) (*security.SecurityInfo, error) {
	pkg, err := brew.GetInfo(a.ctx, name, true)
	if err != nil {
		return nil, err
	}
	appPath := security.ResolveCaskAppPath(pkg)
	if appPath == "" {
		return nil, fmt.Errorf("couldn't find an installed .app for %s", name)
	}
	return security.InspectAppSecurity(a.ctx, appPath)
}

// RemoveQuarantine is synchronous (a single xattr call) so it's exposed as
// a plain error-returning method rather than a streaming job. It takes a
// cask name -- not a raw filesystem path -- and resolves the .app path
// itself via security.ResolveCaskAppPath, the same helper InspectCaskSecurity
// uses, so the frontend can't point it at an arbitrary .app bundle that mead
// doesn't actually manage.
func (a *App) RemoveQuarantine(name string) error {
	if name == "" {
		return fmt.Errorf("no cask name given")
	}
	pkg, err := brew.GetInfo(a.ctx, name, true)
	if err != nil {
		return err
	}
	appPath := security.ResolveCaskAppPath(pkg)
	if appPath == "" {
		return fmt.Errorf("couldn't find an installed .app for %s", name)
	}
	out, err := security.RemoveQuarantine(a.ctx, appPath)
	if err != nil {
		if out != "" {
			return fmt.Errorf("%s: %s", err.Error(), out)
		}
		return err
	}
	return nil
}

// CreateSnapshot is a synchronous safety net -- an instant local APFS
// snapshot, not a full Time Machine backup -- offered as an opt-in checkbox
// before destructive operations (force-uninstall, Brewfile cleanup).
func (a *App) CreateSnapshot() error {
	return security.CreateLocalSnapshot(a.ctx)
}

// RevealPackage opens Finder at an installed package's location -- the .app
// for a cask, or its Cellar keg directory for a formula.
func (a *App) RevealPackage(name string, isCask bool) error {
	pkg, err := brew.GetInfo(a.ctx, name, isCask)
	if err != nil {
		return err
	}
	if isCask {
		appPath := security.ResolveCaskAppPath(pkg)
		if appPath == "" {
			return fmt.Errorf("couldn't find an installed .app for %s", name)
		}
		return security.RevealInFinder(a.ctx, appPath)
	}
	if !pkg.Installed {
		return fmt.Errorf("%s isn't installed", name)
	}
	prefixOut, err := brew.RunBrew(a.ctx, "--prefix")
	if err != nil {
		return err
	}
	kegPath := filepath.Join(strings.TrimSpace(prefixOut), "Cellar", name, pkg.InstalledVersion)
	return security.RevealInFinder(a.ctx, kegPath)
}

// CaskIcon returns a cask's app icon as a base64 "data:image/png;base64,..."
// URI, extracted lazily from the installed .app bundle the first time it's
// requested and cached in-memory (keyed by cask name) after that. It's
// called per-row/per-grid-cell as the frontend renders (the Installed list,
// the package detail pane, the Applications grid) rather than fetched for
// every installed cask up front in one batch call -- that spreads the cost
// of shelling out to plutil/sips for potentially dozens of casks across
// individual renders instead of one big call blocking the whole UI, and
// lets each view render progressively as icons resolve. The frontend caps
// how many of these it has in flight at once (see
// frontend/src/hooks/useCaskIcon.ts) rather than firing one per row
// unbounded.
//
// A miss -- no resolvable .app, no CFBundleIconFile, a corrupt Info.plist,
// a sips failure, anything -- returns "" with a nil error rather than
// propagating the underlying error. From the frontend's point of view "no
// icon" and "icon extraction failed" are the same outcome: fall back to the
// colored monogram tile. The empty result is cached too, so a cask that
// can't produce an icon isn't re-attempted (and re-shelled-out-to) on every
// render.
func (a *App) CaskIcon(name string) (string, error) {
	a.iconsMu.Lock()
	if cached, ok := a.icons[name]; ok {
		a.iconsMu.Unlock()
		return cached, nil
	}
	a.iconsMu.Unlock()

	dataURI := a.extractCaskIcon(name)

	a.iconsMu.Lock()
	if a.icons == nil {
		a.icons = map[string]string{}
	}
	a.icons[name] = dataURI
	a.iconsMu.Unlock()

	return dataURI, nil
}

// extractCaskIcon does the actual (uncached) lookup + extraction for
// CaskIcon, folding every failure mode into "" rather than an error.
func (a *App) extractCaskIcon(name string) string {
	pkg, err := brew.GetInfo(a.ctx, name, true)
	if err != nil {
		return ""
	}
	appPath := security.ResolveCaskAppPath(pkg)
	if appPath == "" {
		return ""
	}
	dataURI, err := security.ExtractAppIcon(a.ctx, appPath)
	if err != nil {
		return ""
	}
	return dataURI
}

// OpenCaskApp launches an installed cask's .app bundle via `open`, the
// double-click action in the Applications grid -- distinct from
// RevealPackage, which only selects the app in Finder without launching it.
func (a *App) OpenCaskApp(name string) error {
	pkg, err := brew.GetInfo(a.ctx, name, true)
	if err != nil {
		return err
	}
	appPath := security.ResolveCaskAppPath(pkg)
	if appPath == "" {
		return fmt.Errorf("couldn't find an installed .app for %s", name)
	}
	return security.OpenApp(a.ctx, appPath)
}

// GistLogs uploads a formula's most recent build/install logs to a GitHub
// gist via `brew gist-logs`, for easy troubleshooting/support -- it's
// quick enough to run synchronously rather than as a streaming job.
func (a *App) GistLogs(name string) (string, error) {
	if err := brew.ValidName(name); err != nil {
		return "", err
	}
	out, err := brew.RunBrew(a.ctx, "gist-logs", name)
	if err != nil {
		return "", err
	}
	if m := gistURLRe.FindString(out); m != "" {
		return m, nil
	}
	return strings.TrimSpace(out), nil
}

// ---- adopt & duplicates ----

func (a *App) ScanAdoptableApps() ([]brew.AdoptCandidate, error) {
	return brew.ScanAdoptableApps(a.ctx)
}

// buildAdoptCaskArgs builds the `brew install --cask --adopt <name>`
// argument list, including --appdir if a custom cask install directory is
// configured. Pure so it's directly unit testable.
func buildAdoptCaskArgs(name string, caskAppDir string) []string {
	args := []string{"install"}
	args = append(args, caskFlagsFor(caskAppDir)...)
	args = append(args, "--adopt", name)
	return args
}

// AdoptCask takes over management of an app that's already installed by
// hand, using brew's own --adopt flag so it doesn't reinstall/overwrite it.
func (a *App) AdoptCask(name string) string {
	if err := brew.ValidName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Adopt %s", name), err.Error())
	}
	args := buildAdoptCaskArgs(name, a.store.CaskAppDir())
	return a.jobs.StartTracked(fmt.Sprintf("Adopt %s", name), a.record("adopt", name, true), args...)
}

func (a *App) FindDuplicateApps() ([]brew.DuplicateApp, error) {
	return brew.FindDuplicateApps(a.ctx)
}

// ---- Mac App Store bridge (via the `mas` CLI) ----

func (a *App) MasAvailable() bool {
	return brew.MasAvailable()
}

func (a *App) MasList() ([]brew.MasApp, error) {
	return brew.MasList(a.ctx)
}

func (a *App) MasOutdated() ([]brew.MasApp, error) {
	return brew.MasOutdated(a.ctx)
}

// buildMasUpgradeArgs builds the `mas upgrade [id]` argument list: a single
// id upgrades just that app, while an empty id upgrades everything mas
// considers outdated. Pure so the "this must be a mas job, not a brew job"
// shape is directly unit testable.
func buildMasUpgradeArgs(id string) []string {
	args := []string{"upgrade"}
	if id != "" {
		args = append(args, id)
	}
	return args
}

func (a *App) MasUpgrade(id string) string {
	if id == "" {
		return a.jobs.Fail("App Store upgrade", "missing app id")
	}
	return a.jobs.StartMas(fmt.Sprintf("Upgrade App Store app %s", id), buildMasUpgradeArgs(id)...)
}

func (a *App) MasUpgradeAll() string {
	return a.jobs.StartMas("Upgrade all App Store apps", buildMasUpgradeArgs("")...)
}

// ---- Brewfile import/export (native file dialogs) ----

func (a *App) ExportBrewfileToFile() (string, error) {
	content, err := brew.RunBrew(a.ctx, "bundle", "dump", "--force", "--file=-")
	if err != nil {
		return "", err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export Brewfile",
		DefaultFilename: "Brewfile",
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // user cancelled
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) ImportBrewfile() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a Brewfile",
	})
	if err != nil {
		return a.jobs.Fail("Import Brewfile", err.Error())
	}
	if path == "" {
		return a.jobs.Fail("Import Brewfile", "cancelled")
	}
	return a.jobs.Start("Import Brewfile", "bundle", "install", "--file="+path)
}

// PickBrewfile opens a native file picker and returns the chosen path (empty
// string if cancelled), for the Check/List/Cleanup flows below which all
// operate against a single Brewfile the user selects once.
func (a *App) PickBrewfile() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: "Select a Brewfile"})
}

func (a *App) BundleCheck(path string) (string, error) {
	return brew.BundleCheck(a.ctx, path)
}

func (a *App) BundleList(path string) (string, error) {
	return brew.BundleList(a.ctx, path)
}

func (a *App) BundleCleanupPreview(path string) ([]brew.BundleCleanupItem, error) {
	return brew.BundleCleanupPreview(a.ctx, path)
}

func (a *App) BundleCleanup(path string) string {
	return a.jobs.Start("Brewfile cleanup", "bundle", "cleanup", "--force", "--file="+path)
}
