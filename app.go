package main

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var gistURLRe = regexp.MustCompile(`https://gist\.github\.com/\S+`)

// App struct
type App struct {
	ctx   context.Context
	jobs  *JobManager
	store *Store
}

// NewApp creates a new App application struct
func NewApp() *App {
	store, err := NewStore()
	if err != nil {
		// Fall back to an in-memory, unpersisted store rather than failing
		// startup over what's a nice-to-have (favorites/tags/history).
		store = &Store{data: newUserData()}
	}
	return &App{jobs: NewJobManager(), store: store}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.jobs.setContext(ctx)
}

func (a *App) record(action, name string, isCask bool) func(success bool) {
	return func(success bool) {
		a.store.AppendHistory(HistoryEntry{
			Time:    time.Now().Format(time.RFC3339),
			Action:  action,
			Name:    name,
			IsCask:  isCask,
			Success: success,
		})
	}
}

// ---- read-only queries ----

func (a *App) GetSystemInfo() (*SystemInfo, error) {
	return GetSystemInfo(a.ctx)
}

func (a *App) ListInstalled() ([]BrewPackage, error) {
	return ListInstalled(a.ctx)
}

func (a *App) GetInfo(name string, isCask bool) (*BrewPackage, error) {
	return GetInfo(a.ctx, name, isCask)
}

func (a *App) Search(query string) ([]SearchResult, error) {
	return Search(a.ctx, query)
}

func (a *App) Outdated(greedy bool) ([]OutdatedPackage, error) {
	return Outdated(a.ctx, greedy)
}

func (a *App) Missing() ([]string, error) {
	return Missing(a.ctx)
}

func (a *App) Taps() ([]string, error) {
	return Taps(a.ctx)
}

func (a *App) Services() ([]Service, error) {
	return Services(a.ctx)
}

func (a *App) Leaves() ([]string, error) {
	return Leaves(a.ctx)
}

func (a *App) Uses(name string) ([]string, error) {
	return Uses(a.ctx, name)
}

func (a *App) Deps(name string, isCask bool) (string, error) {
	return Deps(a.ctx, name, isCask)
}

func (a *App) GetCacheInfo() (*CacheInfo, error) {
	return GetCacheInfo(a.ctx)
}

func (a *App) Config() (string, error) {
	return Config(a.ctx)
}

// ---- streaming (long-running) actions; each returns a job id, and the
// frontend subscribes to job:start / job:output / job:done events ----

func (a *App) Install(name string, isCask bool) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Install %s", name), err.Error())
	}
	args := []string{"install"}
	if isCask {
		args = append(args, "--cask")
	}
	args = append(args, name)
	return a.jobs.StartTracked(fmt.Sprintf("Install %s", name), a.record("install", name, isCask), args...)
}

func (a *App) Uninstall(name string, isCask bool, zap bool) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Uninstall %s", name), err.Error())
	}
	args := []string{"uninstall"}
	if isCask {
		args = append(args, "--cask")
		if zap {
			args = append(args, "--zap")
		}
	}
	args = append(args, name)
	title := fmt.Sprintf("Uninstall %s", name)
	if zap {
		title = fmt.Sprintf("Uninstall %s (and its data)", name)
	}
	return a.jobs.StartTracked(title, a.record("uninstall", name, isCask), args...)
}

func (a *App) Reinstall(name string, isCask bool) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Reinstall %s", name), err.Error())
	}
	args := []string{"reinstall"}
	if isCask {
		args = append(args, "--cask")
	}
	args = append(args, name)
	return a.jobs.StartTracked(fmt.Sprintf("Reinstall %s", name), a.record("reinstall", name, isCask), args...)
}

func (a *App) Upgrade(name string, isCask bool) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Upgrade %s", name), err.Error())
	}
	args := []string{"upgrade"}
	if isCask {
		args = append(args, "--cask")
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
// everywhere else we suppress it (see brewEnv) so a GUI click doesn't
// silently trigger a slow background update.
func (a *App) Update() string {
	return a.jobs.StartWithEnv("Update Homebrew", brewEnvAllowingAutoUpdate(), "update")
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
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Pin %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Pin %s", name), a.record("pin", name, false), "pin", name)
}

func (a *App) Unpin(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Unpin %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Unpin %s", name), a.record("unpin", name, false), "unpin", name)
}

func (a *App) TapAdd(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Tap %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Tap %s", name), a.record("tap", name, false), "tap", name)
}

func (a *App) TapRemove(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Untap %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Untap %s", name), a.record("untap", name, false), "untap", name)
}

func (a *App) ServiceStart(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Start service %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Start service %s", name), "services", "start", name)
}

func (a *App) ServiceStop(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Stop service %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Stop service %s", name), "services", "stop", name)
}

func (a *App) ServiceRestart(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Restart service %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Restart service %s", name), "services", "restart", name)
}

func (a *App) CancelJob(id string) bool {
	return a.jobs.Cancel(id)
}

// ---- user data: favorites, tags, notes, snoozes, history ----

func (a *App) GetUserData() UserData {
	return a.store.Snapshot()
}

func (a *App) ToggleFavorite(name string, isCask bool) error {
	return a.store.ToggleFavorite(pkgKey(name, isCask))
}

func (a *App) SetTags(name string, isCask bool, tags []string) error {
	return a.store.SetTags(pkgKey(name, isCask), tags)
}

func (a *App) SetNote(name string, isCask bool, note string) error {
	return a.store.SetNote(pkgKey(name, isCask), note)
}

func (a *App) SnoozePackage(name string, isCask bool, days int) error {
	return a.store.Snooze(pkgKey(name, isCask), time.Now().AddDate(0, 0, days))
}

func (a *App) UnsnoozePackage(name string, isCask bool) error {
	return a.store.Unsnooze(pkgKey(name, isCask))
}

func (a *App) ClearHistory() error {
	return a.store.ClearHistory()
}

// ---- security ----

func (a *App) ScanVulnerabilities() ([]VulnResult, error) {
	pkgs, err := ListInstalled(a.ctx)
	if err != nil {
		return nil, err
	}
	return ScanVulnerabilities(a.ctx, pkgs)
}

func (a *App) InspectCaskSecurity(name string) (*SecurityInfo, error) {
	pkg, err := GetInfo(a.ctx, name, true)
	if err != nil {
		return nil, err
	}
	appPath := resolveCaskAppPath(pkg)
	if appPath == "" {
		return nil, fmt.Errorf("couldn't find an installed .app for %s", name)
	}
	return InspectAppSecurity(a.ctx, appPath)
}

// RemoveQuarantine is synchronous (a single xattr call) so it's exposed as
// a plain error-returning method rather than a streaming job.
func (a *App) RemoveQuarantine(appPath string) error {
	if appPath == "" {
		return fmt.Errorf("no app path given")
	}
	out, err := RemoveQuarantine(a.ctx, appPath)
	if err != nil {
		if out != "" {
			return fmt.Errorf("%s: %s", err.Error(), out)
		}
		return err
	}
	return nil
}

// GistLogs uploads a formula's most recent build/install logs to a GitHub
// gist via `brew gist-logs`, for easy troubleshooting/support -- it's
// quick enough to run synchronously rather than as a streaming job.
func (a *App) GistLogs(name string) (string, error) {
	if err := validName(name); err != nil {
		return "", err
	}
	out, err := runBrew(a.ctx, "gist-logs", name)
	if err != nil {
		return "", err
	}
	if m := gistURLRe.FindString(out); m != "" {
		return m, nil
	}
	return strings.TrimSpace(out), nil
}

// ---- adopt & duplicates ----

func (a *App) ScanAdoptableApps() ([]AdoptCandidate, error) {
	return ScanAdoptableApps(a.ctx)
}

// AdoptCask takes over management of an app that's already installed by
// hand, using brew's own --adopt flag so it doesn't reinstall/overwrite it.
func (a *App) AdoptCask(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Adopt %s", name), err.Error())
	}
	return a.jobs.StartTracked(fmt.Sprintf("Adopt %s", name), a.record("adopt", name, true), "install", "--cask", "--adopt", name)
}

func (a *App) FindDuplicateApps() ([]DuplicateApp, error) {
	return FindDuplicateApps(a.ctx)
}

// ---- Mac App Store bridge (via the `mas` CLI) ----

func (a *App) MasAvailable() bool {
	return MasAvailable()
}

func (a *App) MasList() ([]MasApp, error) {
	return MasList(a.ctx)
}

func (a *App) MasOutdated() ([]MasApp, error) {
	return MasOutdated(a.ctx)
}

func (a *App) MasUpgrade(id string) string {
	if id == "" {
		return a.jobs.Fail("App Store upgrade", "missing app id")
	}
	return a.jobs.Start(fmt.Sprintf("Upgrade App Store app %s", id), "upgrade", id)
}

func (a *App) MasUpgradeAll() string {
	return a.jobs.Start("Upgrade all App Store apps", "upgrade")
}

// ---- Brewfile import/export (native file dialogs) ----

func (a *App) ExportBrewfileToFile() (string, error) {
	content, err := runBrew(a.ctx, "bundle", "dump", "--force", "--file=-")
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
