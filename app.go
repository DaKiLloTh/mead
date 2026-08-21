package main

import (
	"context"
	"fmt"
)

// App struct
type App struct {
	ctx  context.Context
	jobs *JobManager
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{jobs: NewJobManager()}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.jobs.setContext(ctx)
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

func (a *App) Outdated() ([]OutdatedPackage, error) {
	return Outdated(a.ctx)
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
	return a.jobs.Start(fmt.Sprintf("Install %s", name), args...)
}

func (a *App) Uninstall(name string, isCask bool) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Uninstall %s", name), err.Error())
	}
	args := []string{"uninstall"}
	if isCask {
		args = append(args, "--cask")
	}
	args = append(args, name)
	return a.jobs.Start(fmt.Sprintf("Uninstall %s", name), args...)
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
	return a.jobs.Start(fmt.Sprintf("Upgrade %s", name), args...)
}

func (a *App) UpgradeAll() string {
	return a.jobs.Start("Upgrade all packages", "upgrade")
}

func (a *App) Update() string {
	return a.jobs.Start("Update Homebrew", "update")
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

func (a *App) Doctor() string {
	return a.jobs.StartLenient("Doctor", "doctor")
}

func (a *App) Pin(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Pin %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Pin %s", name), "pin", name)
}

func (a *App) Unpin(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Unpin %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Unpin %s", name), "unpin", name)
}

func (a *App) TapAdd(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Tap %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Tap %s", name), "tap", name)
}

func (a *App) TapRemove(name string) string {
	if err := validName(name); err != nil {
		return a.jobs.Fail(fmt.Sprintf("Untap %s", name), err.Error())
	}
	return a.jobs.Start(fmt.Sprintf("Untap %s", name), "untap", name)
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
