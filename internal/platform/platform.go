// Package platform is the capability layer proposed in
// docs/cross-platform-architecture.md: rather than the frontend or other Go
// packages assuming macOS, they ask this package what the current OS
// actually supports. Each build target (darwin.go, linux.go) provides its
// own Capabilities value behind the same exported name, selected at compile
// time by //go:build tags, so callers never branch on runtime.GOOS
// themselves.
//
// This is deliberately narrow for milestone 1 of issue #105: only fields
// this package can verify the true/false answer for on both platforms today
// are included. In particular there is no HasCasks field -- cask support is
// per-artifact-type, not a single platform on/off switch (see the
// architecture doc's corrected Casks row), and deciding that shape is out of
// scope here.
package platform

// Capabilities describes which OS-level features the current platform
// genuinely supports. The frontend reads this once at startup (via
// App.Capabilities) to decide what UI to show, instead of assuming macOS.
type Capabilities struct {
	// HasGatekeeper is true when the OS has Apple's Gatekeeper/code-signing
	// stack (codesign, spctl, xattr quarantine flags). See
	// internal/security/security.go.
	HasGatekeeper bool `json:"hasGatekeeper"`

	// HasAppStore is true when the OS has a Mac App Store the `mas` CLI can
	// drive. See internal/brew/mas.go.
	HasAppStore bool `json:"hasAppStore"`

	// HasTimeMachine is true when the OS has Time Machine / tmutil local
	// snapshots. See internal/security/security.go's snapshot helpers.
	HasTimeMachine bool `json:"hasTimeMachine"`

	// HasTouchID is true when the OS can prompt for Touch ID as a sudo
	// authentication factor. See internal/touchid.
	HasTouchID bool `json:"hasTouchID"`

	// HasAppAdoption is true when the OS has a known system-level
	// Applications directory mead can scan to match already-installed GUI
	// apps against Homebrew casks (the Adopt view). This is a real gap on
	// Linux, not a subset of HasAppStore: it's about the existence of a
	// single, conventional install location to scan (macOS's
	// /Applications), which Linux has no equivalent of -- GUI apps there
	// come from many places (a distro's package manager, Flatpak,
	// AppImages dropped anywhere) with no one directory to scan. See
	// internal/brew/adopt.go and issue #105.
	HasAppAdoption bool `json:"hasAppAdoption"`

	// HasFloatingTitleBar is true when the native title bar floats over the
	// window's own content (macOS's hidden-inset title bar, see main.go's
	// mac.Options.TitleBar) rather than the window manager drawing its own
	// title bar above the content. Wails' Linux (GTK/webkit2gtk) backend has
	// no equivalent option at all -- it always uses the window manager's
	// native decorations, drawn above the content, not floating over it --
	// so the frontend's drag-region strip (reserved so macOS's floating
	// traffic-light buttons have somewhere to sit that isn't real content)
	// is dead space on Linux, not a smaller version of the same problem.
	HasFloatingTitleBar bool `json:"hasFloatingTitleBar"`
}
