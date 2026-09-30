//go:build linux

package platform

import "testing"

func TestCurrent_Linux(t *testing.T) {
	got := Current()
	want := Capabilities{
		HasGatekeeper:       false,
		HasAppStore:         false,
		HasTimeMachine:      false,
		HasTouchID:          false,
		HasAppAdoption:      false,
		HasFloatingTitleBar: false,
	}
	if got != want {
		t.Errorf("Current() = %+v, want %+v", got, want)
	}
}
