//go:build darwin

package platform

// Current returns this platform's capabilities. On macOS every capability
// covered by this milestone is real: Gatekeeper, the Mac App Store, Time
// Machine and Touch ID are all genuine macOS features mead already drives
// elsewhere in the codebase (internal/security, internal/brew/mas.go,
// internal/touchid).
func Current() Capabilities {
	return Capabilities{
		HasGatekeeper:       true,
		HasAppStore:         true,
		HasTimeMachine:      true,
		HasTouchID:          true,
		HasAppAdoption:      true,
		HasFloatingTitleBar: true,
		HasCmdModifierKey:   true,
	}
}
