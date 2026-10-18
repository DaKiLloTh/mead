package main

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"mead/internal/brew"
)

// fakeWorld records what the poller asked brew, the notifier and the tray
// to do, and answers with whatever each test sets up.
type fakeWorld struct {
	outdatedResult []brew.OutdatedPackage
	outdatedErr    error
	upgradeErr     error
	brewCalls      [][]string
	notifications  []string
	views          []view
}

func newTestPoller(w *fakeWorld, cfg Config) *poller {
	return &poller{
		cfg:          cfg,
		refreshIndex: func(context.Context) error { return errors.New("offline") },
		outdated: func(context.Context, bool) ([]brew.OutdatedPackage, error) {
			return w.outdatedResult, w.outdatedErr
		},
		runBrew: func(_ context.Context, args ...string) (string, error) {
			w.brewCalls = append(w.brewCalls, args)
			return "", w.upgradeErr
		},
		notify: func(_, body string) error {
			w.notifications = append(w.notifications, body)
			return nil
		},
		show: func(v view) { w.views = append(w.views, v) },
	}
}

func pkgs(names ...string) []brew.OutdatedPackage {
	out := make([]brew.OutdatedPackage, len(names))
	for i, n := range names {
		out[i] = brew.OutdatedPackage{Name: n}
	}
	return out
}

func (w *fakeWorld) last() view { return w.views[len(w.views)-1] }

func TestCheckShowsCountAndNotifiesOnce(t *testing.T) {
	w := &fakeWorld{outdatedResult: pkgs("git", "zsh")}
	p := newTestPoller(w, DefaultConfig())

	p.checkOnce()
	if w.views[0].header != "Checking for updates…" {
		t.Errorf("first render = %q, want the checking state", w.views[0].header)
	}
	if got := w.last(); !got.alert || got.badge != "2" || !got.updateAllEnabled {
		t.Errorf("after check = %+v", got)
	}
	p.checkOnce()
	if !reflect.DeepEqual(w.notifications, []string{"git, zsh"}) {
		t.Errorf("notifications = %v, want one for the new set", w.notifications)
	}
}

func TestCheckDoesNotNotifyWhenEverythingIsUpToDate(t *testing.T) {
	w := &fakeWorld{}
	p := newTestPoller(w, DefaultConfig())

	p.checkOnce()
	if len(w.notifications) != 0 {
		t.Errorf("notifications = %v, want none", w.notifications)
	}
	if got := w.last(); got.alert || got.header != "Up to date" {
		t.Errorf("view = %+v", got)
	}
}

func TestFailedCheckKeepsLastCount(t *testing.T) {
	w := &fakeWorld{outdatedResult: pkgs("git")}
	p := newTestPoller(w, DefaultConfig())
	p.checkOnce()

	w.outdatedErr = errors.New("brew broke")
	p.checkOnce()
	if got := w.last(); got.badge != "1" || got.header != "1 update available (last check failed)" {
		t.Errorf("view = %+v", got)
	}
}

func TestUpgradeAllRunsBrewNotifiesAndRechecks(t *testing.T) {
	w := &fakeWorld{outdatedResult: pkgs("git")}
	p := newTestPoller(w, Config{IntervalMinutes: 60, Greedy: true})
	p.checkOnce()

	w.outdatedResult = nil
	p.upgradeAll()

	if !reflect.DeepEqual(w.brewCalls, [][]string{{"upgrade", "--greedy"}}) {
		t.Errorf("brew calls = %v", w.brewCalls)
	}
	sawUpdating := false
	for _, v := range w.views {
		if v.header == "Updating…" && !v.updateAllEnabled {
			sawUpdating = true
		}
	}
	if !sawUpdating {
		t.Error("never showed the updating state")
	}
	if got := w.last(); got.alert || got.header != "Up to date" {
		t.Errorf("after upgrade = %+v", got)
	}
	if got := w.notifications[len(w.notifications)-1]; got != "All packages are up to date." {
		t.Errorf("last notification = %q", got)
	}
}

func TestUpgradeAllReportsFailure(t *testing.T) {
	w := &fakeWorld{outdatedResult: pkgs("firefox"), upgradeErr: errors.New("needs a password")}
	p := newTestPoller(w, DefaultConfig())
	p.checkOnce()
	p.upgradeAll()

	if got := w.notifications[len(w.notifications)-1]; got != "Update all failed: needs a password" {
		t.Errorf("last notification = %q", got)
	}
	if got := w.last(); got.badge != "1" || !got.updateAllEnabled {
		t.Errorf("after failed upgrade = %+v", got)
	}
}

func TestRunChecksThenHandlesUpdateAllUntilCancelled(t *testing.T) {
	w := &fakeWorld{outdatedResult: pkgs("git")}
	p := newTestPoller(w, DefaultConfig())
	ctx, cancel := context.WithCancel(context.Background())
	clicks := make(chan struct{})
	done := make(chan struct{})
	go func() {
		p.run(ctx, clicks)
		close(done)
	}()

	clicks <- struct{}{}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("run didn't stop after cancel")
	}
	if len(w.brewCalls) != 1 {
		t.Errorf("brew calls = %v, want one upgrade", w.brewCalls)
	}
}
