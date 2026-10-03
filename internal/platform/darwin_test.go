//go:build darwin

package platform

import "testing"

func TestCurrent_Darwin(t *testing.T) {
	got := Current()
	want := Capabilities{
		HasGatekeeper:       true,
		HasAppStore:         true,
		HasTimeMachine:      true,
		HasTouchID:          true,
		HasAppAdoption:      true,
		HasFloatingTitleBar: true,
		HasCmdModifierKey:   true,
	}
	if got != want {
		t.Errorf("Current() = %+v, want %+v", got, want)
	}
}
