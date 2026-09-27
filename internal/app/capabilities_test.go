package app

import (
	"encoding/json"
	"testing"

	"mead/internal/platform"
)

// TestCapabilitiesMatchesPlatform checks the bound method returns exactly
// what internal/platform reports for the OS the tests run on, so the
// frontend never sees a value that differs from the platform layer's.
func TestCapabilitiesMatchesPlatform(t *testing.T) {
	a := &App{}
	if got, want := a.Capabilities(), platform.Current(); got != want {
		t.Errorf("Capabilities() = %+v, want %+v", got, want)
	}
}

// TestCapabilitiesJSONKeys guards the field names the frontend's generated
// binding and navCapabilities.ts depend on.
func TestCapabilitiesJSONKeys(t *testing.T) {
	b, err := json.Marshal((&App{}).Capabilities())
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]bool
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	keys := []string{"hasGatekeeper", "hasAppStore", "hasTimeMachine", "hasTouchID", "hasAppAdoption", "hasFloatingTitleBar"}
	for _, k := range keys {
		if _, ok := m[k]; !ok {
			t.Errorf("Capabilities JSON is missing key %q", k)
		}
	}
}
