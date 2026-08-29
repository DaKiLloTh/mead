package brew

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// Regression test for the bug that shipped in v0.10.2's own "fix": that
// release fixed MasAvailable() (via ResolveMasPath) but MasList/MasOutdated
// still called system.RunCmd(ctx, "mas", ...) with the bare literal name
// "mas" -- completely bypassing ResolveMasPath and hitting the exact same
// restricted-PATH problem via RunCmd's own separate, unrelated LookPath
// call. The result: MasAvailable() correctly reported mas as installed
// (so the "install mas" prompt didn't show), but the very next call --
// fetching the actual apps list -- failed with "mas not found on this
// system" and surfaced as a hard error, since this was the first load in
// a fresh process. Caught live, not by any of this file's original tests,
// none of which actually called MasList/MasOutdated at all.
//
// Uses a real temp script and a real subprocess exec (via the actual
// system.RunCmd, not a mock of it) rather than just checking that
// ResolveMasPath gets called: the previous, insufficient regression test
// (TestMasTargetResolvesViaMasNotBrew in internal/jobs) checked function
// wiring by pointer identity, which would NOT have caught this bug --
// MasList never called ResolveMasPath in the first place, so there was no
// wiring to check. This test would fail exactly the way the live bug did:
// it only passes if MasList/MasOutdated actually run the binary
// ResolveMasPath resolved, not some bare "mas" PATH lookup done
// independently inside RunCmd.
func TestMasListRunsTheBinaryResolveMasPathResolves(t *testing.T) {
	dir := t.TempDir()
	fakeMas := filepath.Join(dir, "mas")
	script := "#!/bin/sh\necho '999999999  Totally Fake Test App  (1.2.3)'\n"
	if err := os.WriteFile(fakeMas, []byte(script), 0o755); err != nil {
		t.Fatalf("writing fake mas script: %v", err)
	}

	orig := lookPath
	lookPath = func(name string) (string, error) {
		if name == "/opt/homebrew/bin/mas" {
			return fakeMas, nil
		}
		return "", errors.New("not found")
	}
	defer func() { lookPath = orig }()

	apps, err := MasList(context.Background())
	if err != nil {
		t.Fatalf("MasList() error = %v, want nil", err)
	}
	if len(apps) != 1 || apps[0].Name != "Totally Fake Test App" {
		t.Errorf("MasList() = %+v, want a single \"Totally Fake Test App\" entry from our fake script -- "+
			"if this is empty or shows real installed apps instead, MasList is not actually running the "+
			"binary ResolveMasPath resolved", apps)
	}
}

func TestMasOutdatedRunsTheBinaryResolveMasPathResolves(t *testing.T) {
	dir := t.TempDir()
	fakeMas := filepath.Join(dir, "mas")
	script := "#!/bin/sh\necho '999999999  Totally Fake Test App  (1.2.3 -> 1.2.4)'\n"
	if err := os.WriteFile(fakeMas, []byte(script), 0o755); err != nil {
		t.Fatalf("writing fake mas script: %v", err)
	}

	orig := lookPath
	lookPath = func(name string) (string, error) {
		if name == "/opt/homebrew/bin/mas" {
			return fakeMas, nil
		}
		return "", errors.New("not found")
	}
	defer func() { lookPath = orig }()

	apps, err := MasOutdated(context.Background())
	if err != nil {
		t.Fatalf("MasOutdated() error = %v, want nil", err)
	}
	if len(apps) != 1 || apps[0].Name != "Totally Fake Test App" || apps[0].LatestVersion != "1.2.4" {
		t.Errorf("MasOutdated() = %+v, want a single \"Totally Fake Test App\" entry from our fake script -- "+
			"if this is empty or shows real installed apps instead, MasOutdated is not actually running the "+
			"binary ResolveMasPath resolved", apps)
	}
}

// TestMasListErrorsWhenMasIsNotFoundAnywhere confirms MasList surfaces
// ResolveMasPath's own error (and never attempts to run anything) when mas
// genuinely can't be found -- rather than silently falling through to some
// other bare lookup that might succeed by accident.
func TestMasListErrorsWhenMasIsNotFoundAnywhere(t *testing.T) {
	orig := lookPath
	lookPath = func(name string) (string, error) { return "", errors.New("not found") }
	defer func() { lookPath = orig }()

	_, err := MasList(context.Background())
	if err == nil {
		t.Fatal("MasList() error = nil, want an error since mas isn't found anywhere")
	}
}

func TestMasOutdatedErrorsWhenMasIsNotFoundAnywhere(t *testing.T) {
	orig := lookPath
	lookPath = func(name string) (string, error) { return "", errors.New("not found") }
	defer func() { lookPath = orig }()

	_, err := MasOutdated(context.Background())
	if err == nil {
		t.Fatal("MasOutdated() error = nil, want an error since mas isn't found anywhere")
	}
}
