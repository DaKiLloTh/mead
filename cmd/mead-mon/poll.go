package main

import (
	"context"
	"log"
	"time"

	"mead/internal/brew"
)

// checkTimeout bounds a single check -- a `brew update` refresh followed by
// `brew outdated` -- so a hung/slow brew invocation can't wedge the polling
// loop indefinitely. Wider than a bare `brew outdated` alone would need,
// since `brew update` does a real network fetch.
const checkTimeout = 5 * time.Minute

// poller owns the mutable state a real polling loop needs (the last-seen
// outdated set, for shouldNotify to compare against) and drives brew
// checks, tray updates, and notifications. It is intentionally thin: the
// actual decisions (shouldNotify, tooltipText, menuLine, notificationBody)
// live in plain functions elsewhere so they can be unit tested without a
// tray or a brew subprocess.
type poller struct {
	cfg      Config
	tr       *tray
	previous []string
}

func newPoller(cfg Config, tr *tray) *poller {
	return &poller{cfg: cfg, tr: tr}
}

// checkOnce runs one outdated-package check: queries brew, updates the tray,
// and fires a notification if the outdated set changed since the last
// check.
func (p *poller) checkOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), checkTimeout)
	defer cancel()

	// Refresh Homebrew's own local index before checking for outdated
	// packages. `brew outdated` only ever compares against whatever's
	// already cached locally, and unlike the main GUI app's own polling,
	// nothing else keeps that cache fresh for mead-mon (see issue #88). A
	// failure here isn't fatal -- Outdated() below just falls back to
	// whatever's already cached, same as it always has, and the failure is
	// only logged.
	if err := brew.Update(ctx); err != nil {
		log.Printf("mead-mon: refreshing Homebrew's update index: %v", err)
	}

	pkgs, err := brew.Outdated(ctx, p.cfg.Greedy)
	if err != nil {
		log.Printf("mead-mon: checking outdated packages: %v", err)
		return
	}

	current := outdatedNames(pkgs)
	if shouldNotify(p.previous, current) {
		if err := notify("mead-mon", notificationBody(current)); err != nil {
			log.Printf("mead-mon: sending notification: %v", err)
		}
	}
	p.previous = current

	p.tr.update(pkgs)
}

// run performs an immediate check, then checks again on every tick of the
// configured interval, until ctx is done.
func (p *poller) run(ctx context.Context) {
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
		}
	}
}
