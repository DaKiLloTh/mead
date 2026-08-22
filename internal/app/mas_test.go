package app

import (
	"reflect"
	"testing"
)

// TestBuildMasUpgradeArgs guards against the MasUpgrade/MasUpgradeAll
// regression where the job manager always exec'd `brew` regardless of what
// args it was given: an id-less "upgrade" (meant for MasUpgradeAll) ran bare
// `brew upgrade`, silently upgrading every outdated Homebrew formula/cask on
// the system, and an id-bearing "upgrade <id>" (meant for MasUpgrade) ran
// `brew upgrade <numeric-app-store-id>`, which always fails since no such
// formula exists. buildMasUpgradeArgs is the pure arg-building core of both
// App methods, so this checks the args are correct independent of which
// binary ends up executing them (that's covered separately in the jobs
// package, since mas dispatch lives there).
func TestBuildMasUpgradeArgs(t *testing.T) {
	t.Run("single app id", func(t *testing.T) {
		got := buildMasUpgradeArgs("1451685025")
		want := []string{"upgrade", "1451685025"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("buildMasUpgradeArgs(%q) = %v, want %v", "1451685025", got, want)
		}
	})

	t.Run("empty id upgrades everything mas considers outdated", func(t *testing.T) {
		got := buildMasUpgradeArgs("")
		want := []string{"upgrade"}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("buildMasUpgradeArgs(%q) = %v, want %v", "", got, want)
		}
	})
}
