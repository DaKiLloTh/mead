package main

import (
	"context"
	"log"
	"time"

	"mead/internal/brew"
)

// checkTimeout bounds a single `brew outdated` call so a hung/slow brew
// invocation can't wedge the polling loop indefinitely.
const checkTimeout = 2 * time.Minute

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
