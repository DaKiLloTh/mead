// Package menubar turns mead's menu bar companion (cmd/mead-mon) on and off.
//
// Release builds ship mead-mon as its own helper app inside mead's bundle
// (mead.app/Contents/Library/LoginItems/mead-mon.app, built by
// scripts/bundle-menubar.sh). Turning it on writes a per-user
// LaunchAgent so macOS starts it at login, and starts it now. Turning it off
// stops it and removes the LaunchAgent. It's off until the user turns it on
// in Settings.
//
// A LaunchAgent rather than SMAppService: SMAppService needs a signed helper
// bundle, and mead's builds are unsigned. A LaunchAgent works unsigned, and
// removing its plist removes every trace of it.
package menubar

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// Label is the LaunchAgent's launchd label, and its plist's file name.
const Label = "app.mead.menubar"

// helperApp is mead-mon's helper app, relative to mead's Contents folder.
// Its own Info.plist gives it its own identity (app.mead.menubar) and keeps
// it out of the Dock.
var helperApp = filepath.Join("Library", "LoginItems", "mead-mon.app")

// Status says whether this build ships the menu bar companion, and whether
// it's turned on.
type Status struct {
	Available bool `json:"available"`
	Enabled   bool `json:"enabled"`
}

// Agent manages the LaunchAgent for one user.
type Agent struct {
	// launchAgentsDir is ~/Library/LaunchAgents.
	launchAgentsDir string
	// helper is the absolute path to the bundled mead-mon executable.
	helper string
	uid    int
	// launchctl runs launchctl with the given arguments. A field so tests
	// can record calls instead of touching launchd.
	launchctl func(args ...string) error
}

// NewAgent returns an Agent for the current user and the running mead
// binary.
func NewAgent() (*Agent, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return &Agent{
		launchAgentsDir: filepath.Join(home, "Library", "LaunchAgents"),
		helper:          HelperPath(exe),
		uid:             os.Getuid(),
		launchctl: func(args ...string) error {
			out, err := exec.Command("/bin/launchctl", args...).CombinedOutput()
			if err != nil {
				return fmt.Errorf("launchctl %v: %v: %s", args, err, bytes.TrimSpace(out))
			}
			return nil
		},
	}, nil
}

// HelperPath is mead-mon's executable, given mead's own
// (mead.app/Contents/MacOS/mead).
func HelperPath(meadExecutable string) string {
	contents := filepath.Dir(filepath.Dir(meadExecutable))
	return filepath.Join(contents, helperApp, "Contents", "MacOS", "mead-mon")
}

func (a *Agent) plistPath() string {
	return filepath.Join(a.launchAgentsDir, Label+".plist")
}

func (a *Agent) domain() string {
	return fmt.Sprintf("gui/%d", a.uid)
}

// Status reports whether mead-mon is bundled and whether its LaunchAgent is
// installed.
func (a *Agent) Status() Status {
	_, helperErr := os.Stat(a.helper)
	_, plistErr := os.Stat(a.plistPath())
	return Status{Available: helperErr == nil, Enabled: plistErr == nil}
}

// Enable installs the LaunchAgent and starts mead-mon. Safe to call when
// it's already on: it rewrites the plist (picking up a moved app) and
// restarts mead-mon.
func (a *Agent) Enable() error {
	if _, err := os.Stat(a.helper); err != nil {
		return fmt.Errorf("this build of mead doesn't include the menu bar app (%s)", a.helper)
	}
	if err := os.MkdirAll(a.launchAgentsDir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(a.plistPath(), Plist(a.helper), 0o644); err != nil {
		return err
	}
	// Unload any previous copy first, so a re-enable picks up a new path.
	// Failing here just means it wasn't loaded.
	_ = a.launchctl("bootout", a.domain()+"/"+Label)
	return a.launchctl("bootstrap", a.domain(), a.plistPath())
}

// Disable stops mead-mon and removes the LaunchAgent. Safe to call when it's
// already off.
func (a *Agent) Disable() error {
	// Failing here just means it wasn't running.
	_ = a.launchctl("bootout", a.domain()+"/"+Label)
	if err := os.Remove(a.plistPath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// SetEnabled turns the menu bar companion on or off.
func (a *Agent) SetEnabled(on bool) error {
	if on {
		return a.Enable()
	}
	return a.Disable()
}

// RepairIfMoved re-enables the LaunchAgent when it's on but points somewhere
// other than this mead's bundled helper, e.g. after the app was moved or
// replaced by a copy elsewhere, or after an update moved the helper inside
// the bundle. Called at startup.
func (a *Agent) RepairIfMoved() error {
	current, err := os.ReadFile(a.plistPath())
	if err != nil {
		return nil
	}
	if bytes.Equal(current, Plist(a.helper)) {
		return nil
	}
	if _, err := os.Stat(a.helper); err != nil {
		return nil
	}
	return a.Enable()
}

// Plist is the LaunchAgent property list that starts helper at login.
// ProcessType Interactive keeps macOS from throttling a menu bar app, and
// LimitLoadToSessionType Aqua keeps it to graphical logins.
func Plist(helper string) []byte {
	var path bytes.Buffer
	_ = xml.EscapeText(&path, []byte(helper))
	return []byte(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>` + Label + `</string>
	<key>ProgramArguments</key>
	<array>
		<string>` + path.String() + `</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>ProcessType</key>
	<string>Interactive</string>
	<key>LimitLoadToSessionType</key>
	<string>Aqua</string>
</dict>
</plist>
`)
}
