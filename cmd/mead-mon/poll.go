package main

import (
	"context"
	"log"
	"os/exec"
	"time"

	"fyne.io/systray"

	"mead/internal/brew"
)

// checkTimeout bounds a single check -- a `brew update` refresh followed by
// `brew outdated` -- so a hung/slow brew invocation can't wedge the polling
// loop indefinitely. Wider than a bare `brew outdated` alone would need,
// since `brew update` does a real network fetch.
const checkTimeout = 5 * time.Minute

// upgradeTimeout bounds Update all. Upgrading everything can legitimately
// take a long time (large casks, source builds), so this is generous.
const upgradeTimeout = 2 * time.Hour

// poller owns the mutable state (the tray status and the last-seen outdated
// set, for shouldNotify to compare against) and drives brew checks, Update
// all, tray updates and notifications. Checks and Update all both run on
// the one loop in run, so they never overlap. The decisions themselves
// (menuView, shouldNotify, notificationBody) live in plain functions
// elsewhere so they can be unit tested without a tray or a brew subprocess.
type poller struct {
	cfg      Config
	st       status
	previous []string

	// The outside world, as fields so tests can swap in fakes.
	refreshIndex func(context.Context) error
	outdated     func(context.Context, bool) ([]brew.OutdatedPackage, error)
	runBrew      func(context.Context, ...string) (string, error)
	notify       func(title, body string) error
	show         func(view)
}

func newPoller(cfg Config, tr *tray) *poller {
	return &poller{
		cfg:          cfg,
		refreshIndex: brew.Update,
		outdated:     brew.Outdated,
		runBrew:      brew.RunBrew,
		notify:       notify,
		show:         tr.render,
	}
}

func (p *poller) render() {
	p.show(menuView(p.st))
}

// checkOnce runs one outdated-package check: queries brew, updates the tray,
// and fires a notification if the outdated set changed since the last
// check.
func (p *poller) checkOnce() {
	p.st.checking = true
	p.render()
	defer func() {
		p.st.checking = false
		p.render()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()

	// Refresh Homebrew's own local index before checking for outdated
	// packages. `brew outdated` only ever compares against whatever's
	// already cached locally, and unlike the main GUI app's own polling,
	// nothing else keeps that cache fresh for mead-mon (see issue #88). A
	// failure here isn't fatal -- Outdated() below just falls back to
	// whatever's already cached, same as it always has, and the failure is
	// only logged.
	if err := p.refreshIndex(ctx); err != nil {
		log.Printf("mead-mon: refreshing Homebrew's update index: %v", err)
	}

	pkgs, err := p.outdated(ctx, p.cfg.Greedy)
	if err != nil {
		log.Printf("mead-mon: checking outdated packages: %v", err)
		p.st.checkFailed = true
		return
	}
	p.st.checked = true
	p.st.checkFailed = false
	p.st.count = len(pkgs)

	current := outdatedNames(pkgs)
	if shouldNotify(p.previous, current) && len(current) > 0 {
		if err := p.notify("mead", notificationBody(current)); err != nil {
			log.Printf("mead-mon: sending notification: %v", err)
		}
	}
	p.previous = current
}

// upgradeAll runs `brew upgrade` for everything, reports the result as a
// notification, then re-checks so the count reflects what's left.
func (p *poller) upgradeAll() {
	p.st.upgrading = true
	p.render()

	ctx, cancel := context.WithTimeout(context.Background(), upgradeTimeout)
	_, err := p.runBrew(ctx, upgradeArgs(p.cfg.Greedy)...)
	cancel()
	if err != nil {
		log.Printf("mead-mon: update all: %v", err)
	}
	if nerr := p.notify("mead", upgradeResultText(err)); nerr != nil {
		log.Printf("mead-mon: sending notification: %v", nerr)
	}

	p.st.upgrading = false
	p.checkOnce()
}

// run performs an immediate check, then checks again on every tick of the
// configured interval and runs Update all when it's clicked, until ctx is
// done.
func (p *poller) run(ctx context.Context, updateAllClicked <-chan struct{}) {
	p.checkOnce()

	interval := time.Duration(p.cfg.IntervalMinutes) * time.Minute
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.checkOnce()
		case <-updateAllClicked:
			p.upgradeAll()
		}
	}
}

// runMenuListener handles the menu items that don't touch brew, so they stay
// responsive while a check or Update all is running.
func (t *tray) runMenuListener() {
	for {
		select {
		case <-t.openMead.ClickedCh:
			if err := exec.Command("open", openMeadArgs()...).Run(); err != nil {
				log.Printf("mead-mon: opening mead: %v", err)
			}
		case <-t.quit.ClickedCh:
			systray.Quit()
			return
		}
	}
}
