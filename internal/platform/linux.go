//go:build linux

package platform

// Current returns this platform's capabilities. None of the capabilities
// covered by this milestone exist on Linux: no Gatekeeper-equivalent
// code-signing stack, no Mac App Store, no Time Machine, and no Touch ID
// sudo prompt. See docs/cross-platform-architecture.md for why each of
// these has no Linux equivalent to port to, rather than being a gap to
// fill in later.
func Current() Capabilities {
	return Capabilities{
		HasGatekeeper:       false,
		HasAppStore:         false,
		HasTimeMachine:      false,
		HasTouchID:          false,
		HasAppAdoption:      false,
		HasFloatingTitleBar: false,
	}
}
