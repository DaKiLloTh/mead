package menubar

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type fakeLaunchctl struct {
	calls [][]string
	fail  map[string]error
}

func (f *fakeLaunchctl) run(args ...string) error {
	f.calls = append(f.calls, args)
	return f.fail[args[0]]
}

// newTestAgent returns an Agent rooted in a temp dir, with mead-mon
// present when withHelper is true.
func newTestAgent(t *testing.T, withHelper bool) (*Agent, *fakeLaunchctl) {
	t.Helper()
	dir := t.TempDir()
	helper := filepath.Join(dir, "mead.app", "Contents", "MacOS", "mead-mon")
	if withHelper {
		if err := os.MkdirAll(filepath.Dir(helper), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(helper, []byte("#!/bin/sh\n"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	f := &fakeLaunchctl{}
	return &Agent{
		launchAgentsDir: filepath.Join(dir, "LaunchAgents"),
		defaultMarker:   filepath.Join(dir, "config", "mead", "menubar-default-applied"),
		helper:          helper,
		uid:             501,
		launchctl:       f.run,
	}, f
}

func TestHelperPath(t *testing.T) {
	got := HelperPath("/Applications/mead.app/Contents/MacOS/mead")
	if got != "/Applications/mead.app/Contents/MacOS/mead-mon" {
		t.Errorf("HelperPath = %q", got)
	}
}

func TestPlistIsValidAndEscapesThePath(t *testing.T) {
	p := Plist("/Users/a&b/mead.app/Contents/MacOS/mead-mon")
	s := string(p)
	for _, want := range []string{
		"<string>app.mead.menubar</string>",
		"<string>/Users/a&amp;b/mead.app/Contents/MacOS/mead-mon</string>",
		"<key>RunAtLoad</key>\n\t<true/>",
	} {
		if !strings.Contains(s, want) {
			t.Errorf("plist missing %q:\n%s", want, s)
		}
	}
	if _, err := exec.LookPath("plutil"); err == nil {
		f := filepath.Join(t.TempDir(), "x.plist")
		if err := os.WriteFile(f, p, 0o644); err != nil {
			t.Fatal(err)
		}
		if out, err := exec.Command("plutil", "-lint", f).CombinedOutput(); err != nil {
			t.Errorf("plutil -lint: %v: %s", err, out)
		}
	}
}

func TestStatus(t *testing.T) {
	a, _ := newTestAgent(t, false)
	if got := a.Status(); got != (Status{}) {
		t.Errorf("without helper = %+v", got)
	}

	a, _ = newTestAgent(t, true)
	if got := a.Status(); got != (Status{Available: true}) {
		t.Errorf("with helper, off = %+v", got)
	}
	if err := a.Enable(); err != nil {
		t.Fatal(err)
	}
	if got := a.Status(); got != (Status{Available: true, Enabled: true}) {
		t.Errorf("with helper, on = %+v", got)
	}
}

func TestEnableWritesPlistAndBootstraps(t *testing.T) {
	a, f := newTestAgent(t, true)
	f.fail = map[string]error{"bootout": errors.New("not loaded")}

	if err := a.SetEnabled(true); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(a.plistPath())
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(Plist(a.helper)) {
		t.Errorf("plist = %s", got)
	}
	want := [][]string{
		{"bootout", "gui/501/app.mead.menubar"},
		{"bootstrap", "gui/501", a.plistPath()},
	}
	if !reflect.DeepEqual(f.calls, want) {
		t.Errorf("launchctl calls = %v, want %v", f.calls, want)
	}
}

func TestEnableWithoutHelperFails(t *testing.T) {
	a, f := newTestAgent(t, false)
	if err := a.Enable(); err == nil {
		t.Fatal("want an error when mead-mon isn't bundled")
	}
	if len(f.calls) != 0 {
		t.Errorf("launchctl calls = %v, want none", f.calls)
	}
	if _, err := os.Stat(a.plistPath()); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("plist written anyway: %v", err)
	}
}

func TestEnableReportsBootstrapFailure(t *testing.T) {
	a, f := newTestAgent(t, true)
	f.fail = map[string]error{"bootstrap": errors.New("boom")}
	if err := a.Enable(); err == nil || err.Error() != "boom" {
		t.Errorf("err = %v, want boom", err)
	}
}

func TestDisableStopsAndRemoves(t *testing.T) {
	a, f := newTestAgent(t, true)
	if err := a.Enable(); err != nil {
		t.Fatal(err)
	}
	f.calls = nil

	if err := a.SetEnabled(false); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(f.calls, [][]string{{"bootout", "gui/501/app.mead.menubar"}}) {
		t.Errorf("launchctl calls = %v", f.calls)
	}
	if a.Status().Enabled {
		t.Error("still enabled after Disable")
	}
}

func TestDisableWhenAlreadyOff(t *testing.T) {
	a, f := newTestAgent(t, true)
	f.fail = map[string]error{"bootout": errors.New("not loaded")}
	if err := a.Disable(); err != nil {
		t.Errorf("Disable when off = %v", err)
	}
}

func TestRepairIfMoved(t *testing.T) {
	a, f := newTestAgent(t, true)

	// Off: nothing to repair.
	if err := a.RepairIfMoved(); err != nil || len(f.calls) != 0 {
		t.Fatalf("off: err=%v calls=%v", err, f.calls)
	}

	// On and pointing here: left alone.
	if err := a.Enable(); err != nil {
		t.Fatal(err)
	}
	f.calls = nil
	if err := a.RepairIfMoved(); err != nil || len(f.calls) != 0 {
		t.Fatalf("current: err=%v calls=%v", err, f.calls)
	}

	// On but pointing at an old location: rewritten and restarted.
	if err := os.WriteFile(a.plistPath(), Plist("/Volumes/old/mead.app/Contents/MacOS/mead-mon"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := a.RepairIfMoved(); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(a.plistPath())
	if string(got) != string(Plist(a.helper)) {
		t.Errorf("plist not repaired: %s", got)
	}
	if len(f.calls) != 2 || f.calls[1][0] != "bootstrap" {
		t.Errorf("launchctl calls = %v", f.calls)
	}
}

func TestRepairSkipsWhenThisBuildHasNoHelper(t *testing.T) {
	a, f := newTestAgent(t, false)
	if err := os.MkdirAll(a.launchAgentsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(a.plistPath(), Plist("/Applications/mead.app/Contents/MacOS/mead-mon"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := a.RepairIfMoved(); err != nil || len(f.calls) != 0 {
		t.Errorf("err=%v calls=%v, want the existing agent left alone", err, f.calls)
	}
}

func TestNewAgent(t *testing.T) {
	a, err := NewAgent()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(a.helper) != "mead-mon" || !strings.HasSuffix(a.launchAgentsDir, filepath.Join("Library", "LaunchAgents")) {
		t.Errorf("agent = %+v", a)
	}
}

func TestEnableByDefaultOnceTurnsItOnThenRespectsOff(t *testing.T) {
	a, f := newTestAgent(t, true)

	if err := a.EnableByDefaultOnce(); err != nil {
		t.Fatal(err)
	}
	if !a.Status().Enabled {
		t.Fatal("not enabled on first run")
	}

	if err := a.Disable(); err != nil {
		t.Fatal(err)
	}
	f.calls = nil
	if err := a.EnableByDefaultOnce(); err != nil {
		t.Fatal(err)
	}
	if a.Status().Enabled || len(f.calls) != 0 {
		t.Errorf("turned back on after the user switched it off: calls=%v", f.calls)
	}
}

func TestEnableByDefaultOnceLeavesAnAlreadyEnabledAgentAlone(t *testing.T) {
	a, f := newTestAgent(t, true)
	if err := a.Enable(); err != nil {
		t.Fatal(err)
	}
	f.calls = nil
	if err := a.EnableByDefaultOnce(); err != nil {
		t.Fatal(err)
	}
	if len(f.calls) != 0 {
		t.Errorf("launchctl calls = %v, want none", f.calls)
	}
}

func TestEnableByDefaultOnceWaitsForABuildWithTheHelper(t *testing.T) {
	a, f := newTestAgent(t, false)
	if err := a.EnableByDefaultOnce(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(a.defaultMarker); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("marker written by a build without the helper: %v", err)
	}
	if len(f.calls) != 0 {
		t.Errorf("launchctl calls = %v, want none", f.calls)
	}
}

func TestEnableByDefaultOnceDoesNotRetryAFailedEnable(t *testing.T) {
	a, f := newTestAgent(t, true)
	f.fail = map[string]error{"bootstrap": errors.New("boom")}
	if err := a.EnableByDefaultOnce(); err == nil {
		t.Fatal("want the bootstrap error")
	}
	f.calls = nil
	if err := a.EnableByDefaultOnce(); err != nil || len(f.calls) != 0 {
		t.Errorf("second run: err=%v calls=%v, want nothing", err, f.calls)
	}
}
