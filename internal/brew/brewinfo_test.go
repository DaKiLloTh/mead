package brew

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestBuildSystemInfo_Success(t *testing.T) {
	base := &SystemInfo{
		BrewPath:    "/opt/homebrew/bin/brew",
		BrewVersion: "Homebrew 4.0.0",
		Prefix:      "/opt/homebrew",
		Cellar:      "/opt/homebrew/Cellar",
		Caskroom:    "/opt/homebrew/Caskroom",
	}
	installed := []BrewPackage{
		{Name: "wget", IsCask: false},
		{Name: "git", IsCask: false, Deprecated: true},
		{Name: "firefox", IsCask: true},
		{Name: "docker", IsCask: true, Disabled: true},
		{Name: "python@3.9", IsCask: false, Pinned: true},
	}
	outdated := []OutdatedPackage{
		{Name: "wget"},
		{Name: "firefox"},
	}

	info, err := buildSystemInfo(base, installed, nil, outdated, nil)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if info == nil {
		t.Fatal("expected non-nil info")
	}

	if info.InstalledForm != 3 {
		t.Errorf("InstalledForm = %d, want 3", info.InstalledForm)
	}
	if info.InstalledCask != 2 {
		t.Errorf("InstalledCask = %d, want 2", info.InstalledCask)
	}
	if info.OutdatedCount != 2 {
		t.Errorf("OutdatedCount = %d, want 2", info.OutdatedCount)
	}
	if info.DeprecatedCount != 1 {
		t.Errorf("DeprecatedCount = %d, want 1", info.DeprecatedCount)
	}
	if info.DisabledCount != 1 {
		t.Errorf("DisabledCount = %d, want 1", info.DisabledCount)
	}
	if info.PinnedCount != 1 {
		t.Errorf("PinnedCount = %d, want 1", info.PinnedCount)
	}

	// Base fields should pass through untouched.
	if info.BrewPath != base.BrewPath || info.BrewVersion != base.BrewVersion || info.Prefix != base.Prefix {
		t.Errorf("base fields not preserved: got %+v", info)
	}
}

func TestBuildSystemInfo_EmptySystem(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}

	info, err := buildSystemInfo(base, []BrewPackage{}, nil, []OutdatedPackage{}, nil)
	if err != nil {
		t.Fatalf("expected no error for a genuinely empty system, got %v", err)
	}
	if info.InstalledForm != 0 || info.InstalledCask != 0 || info.OutdatedCount != 0 {
		t.Errorf("expected all-zero counts for empty system, got %+v", info)
	}
}

func TestBuildSystemInfo_ListInstalledError(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	wantErr := errors.New("brew: command not found")

	info, err := buildSystemInfo(base, nil, wantErr, []OutdatedPackage{}, nil)
	if err == nil {
		t.Fatal("expected an error when ListInstalled fails, got nil")
	}
	if info != nil {
		t.Errorf("expected nil info on error, got %+v", info)
	}
	if !errors.Is(err, wantErr) {
		t.Errorf("expected returned error to wrap %v, got %v", wantErr, err)
	}
}

func TestBuildSystemInfo_OutdatedError(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	wantErr := errors.New("brew: timeout")
	installed := []BrewPackage{{Name: "wget"}}

	info, err := buildSystemInfo(base, installed, nil, nil, wantErr)
	if err == nil {
		t.Fatal("expected an error when Outdated fails, got nil")
	}
	if info != nil {
		t.Errorf("expected nil info on error, got %+v", info)
	}
	if !errors.Is(err, wantErr) {
		t.Errorf("expected returned error to wrap %v, got %v", wantErr, err)
	}
}

func TestBuildSystemInfo_BothFail_ListInstalledErrorTakesPrecedence(t *testing.T) {
	base := &SystemInfo{BrewPath: "/opt/homebrew/bin/brew"}
	listErr := errors.New("list failed")
	outdatedErr := errors.New("outdated failed")

	_, err := buildSystemInfo(base, nil, listErr, nil, outdatedErr)
	if err == nil {
		t.Fatal("expected an error when both sub-calls fail, got nil")
	}
	if !errors.Is(err, listErr) {
		t.Errorf("expected the ListInstalled error to be the one surfaced, got %v", err)
	}
}

func TestHomebrewLastUpdatedString_Success(t *testing.T) {
	mtime := time.Date(2026, 8, 20, 14, 30, 0, 0, time.FixedZone("BST", 3600))

	got := homebrewLastUpdatedString(mtime, nil)

	want := "2026-08-20T13:30:00Z" // normalized to UTC
	if got != want {
		t.Errorf("homebrewLastUpdatedString = %q, want %q", got, want)
	}
}

func TestHomebrewLastUpdatedString_StatError(t *testing.T) {
	// A stat error (non-git install, brew update never run, permissions,
	// ...) must yield "" rather than propagating -- this is a nice-to-have
	// indicator, not something that should fail GetSystemInfo.
	got := homebrewLastUpdatedString(time.Now(), os.ErrNotExist)

	if got != "" {
		t.Errorf("homebrewLastUpdatedString with a stat error = %q, want empty string", got)
	}
}

func TestDirSize_NormalCase(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hello"), 0o644); err != nil { // 5 bytes
		t.Fatalf("writing a.txt: %v", err)
	}
	sub := filepath.Join(dir, "sub")
	if err := os.Mkdir(sub, 0o755); err != nil {
		t.Fatalf("mkdir sub: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sub, "b.txt"), []byte("world!"), 0o644); err != nil { // 6 bytes
		t.Fatalf("writing b.txt: %v", err)
	}

	size, err := dirSize(dir)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if want := int64(5 + 6); size != want {
		t.Errorf("dirSize = %d, want %d", size, want)
	}
}

func TestDirSize_NonexistentPath(t *testing.T) {
	// A missing root (e.g. brew's cache directory before anything has ever
	// been downloaded) is a normal, healthy state -- it must report a clean
	// zero size, not an error, or GetCacheInfo would show an error banner
	// for a perfectly ordinary fresh install.
	missing := filepath.Join(t.TempDir(), "does-not-exist")

	size, err := dirSize(missing)
	if err != nil {
		t.Fatalf("expected no error for a nonexistent path, got %v", err)
	}
	if size != 0 {
		t.Errorf("dirSize = %d, want 0", size)
	}
}

func TestDirSize_PermissionDenied(t *testing.T) {
	// Permission-denied handling is only reliably exercisable on POSIX
	// filesystems, and not at all when running as root (root bypasses the
	// permission bits, so the walk would succeed and this test would
	// spuriously fail) -- e.g. it's common for CI containers to run as
	// root. Skip in those cases rather than forcing something brittle.
	if runtime.GOOS == "windows" {
		t.Skip("permission bits aren't enforced the same way on Windows")
	}
	if os.Geteuid() == 0 {
		t.Skip("running as root bypasses permission checks")
	}

	dir := t.TempDir()
	locked := filepath.Join(dir, "locked")
	if err := os.Mkdir(locked, 0o755); err != nil {
		t.Fatalf("mkdir locked: %v", err)
	}
	if err := os.WriteFile(filepath.Join(locked, "secret.txt"), []byte("x"), 0o644); err != nil {
		t.Fatalf("writing secret.txt: %v", err)
	}
	if err := os.Chmod(locked, 0o000); err != nil {
		t.Fatalf("chmod locked: %v", err)
	}
	t.Cleanup(func() {
		// Restore permissions so t.TempDir()'s own cleanup can remove it.
		_ = os.Chmod(locked, 0o755)
	})

	_, err := dirSize(dir)
	if err == nil {
		t.Fatal("expected an error walking into a permission-denied subdirectory, got nil")
	}
}

func TestCaskToPackage_FullName(t *testing.T) {
	tests := []struct {
		name     string
		cask     map[string]any
		wantFull string
		desc     string
	}{
		{
			name: "normal display name overrides full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
				"name":       []any{"Firefox"},
			},
			wantFull: "Firefox",
			desc:     "a real, non-empty name[0] should be preferred over full_token",
		},
		{
			name: "empty string name falls back to full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
				"name":       []any{""},
			},
			wantFull: "homebrew/cask/firefox",
			desc:     "name[0] == \"\" must not clobber the valid full_token-derived FullName",
		},
		{
			name: "whitespace-only name falls back to full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
				"name":       []any{"   "},
			},
			wantFull: "homebrew/cask/firefox",
			desc:     "a whitespace-only name[0] is effectively empty and must not clobber FullName",
		},
		{
			name: "no name field falls back to full_token",
			cask: map[string]any{
				"token":      "firefox",
				"full_token": "homebrew/cask/firefox",
			},
			wantFull: "homebrew/cask/firefox",
			desc:     "matches current behavior when brew's JSON omits \"name\" entirely",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := caskToPackage(tt.cask)
			if p.FullName != tt.wantFull {
				t.Errorf("%s: FullName = %q, want %q (%s)", tt.name, p.FullName, tt.wantFull, tt.desc)
			}
		})
	}
}

// ---- encoding/json/v2 migration regression coverage ----
//
// These fixtures are trimmed but otherwise verbatim excerpts of real
// `brew info --json=v2 --installed` output (captured against Homebrew
// 6.0.18 on macOS/arm64: one formula, "coreutils", and one cask, "iterm2"),
// deliberately including a long tail of real fields decodeInfoV2/
// formulaToPackage/caskToPackage don't model (oldnames, urls, bottle,
// requirements, ruby_source_path, an unrelated top-level key, etc), several
// real JSON nulls, and nested arrays/objects. The point is to prove the
// encoding/json/v2 migration parses real, unmodeled-field-heavy brew output
// exactly like v1 did: v2 ignores unknown struct/object members by default
// (same as v1) rather than rejecting them, which is what this whole decode
// layer's map[string]interface{}-based approach depends on.
const realBrewInfoV2Fixture = `{
  "unexpected_future_top_level_key": {"brew_might_add_this_someday": true},
  "formulae": [
    {
      "name": "coreutils",
      "full_name": "coreutils",
      "tap": "homebrew/core",
      "oldnames": [],
      "aliases": [],
      "versioned_formulae": [],
      "desc": "GNU File, Shell, and Text utilities",
      "license": "GPL-3.0-or-later",
      "homepage": "https://www.gnu.org/software/coreutils/",
      "versions": {"stable": "9.11", "head": "HEAD", "bottle": true},
      "urls": {
        "stable": {"url": "https://ftpmirror.gnu.org/gnu/coreutils/coreutils-9.11.tar.xz", "tag": null, "revision": null, "using": null, "checksum": "394024eda0a5955217ceda9cd1201e65dc8fa3aa29c2951135a49521d57c3cc3"},
        "head": {"url": "https://git.savannah.gnu.org/git/coreutils.git", "branch": "master", "using": null}
      },
      "patches": [],
      "revision": 0,
      "version_scheme": 0,
      "compatibility_version": null,
      "autobump": true,
      "bottle": {
        "stable": {
          "rebuild": 0,
          "root_url": "https://ghcr.io/v2/homebrew/core",
          "files": {"arm64_tahoe": {"cellar": "/opt/homebrew/Cellar", "url": "https://ghcr.io/v2/homebrew/core/coreutils/blobs/sha256:85beae05ca59ba87d10380b529d6fb3837f3527c79a6045abb52643eb3ff2316", "sha256": "85beae05ca59ba87d10380b529d6fb3837f3527c79a6045abb52643eb3ff2316"}}
        }
      },
      "pour_bottle_only_if": null,
      "keg_only": false,
      "keg_only_reason": null,
      "options": [],
      "build_dependencies": [],
      "dependencies": ["gmp"],
      "test_dependencies": [],
      "recommended_dependencies": [],
      "optional_dependencies": [],
      "uses_from_macos": [{"gperf": "build"}],
      "uses_from_macos_bounds": [{}],
      "requirements": [],
      "conflicts_with": ["b2sum", "gfold", "idutils"],
      "conflicts_with_reasons": ["both install ` + "`b2sum`" + ` binaries", "both install ` + "`gfold`" + ` binaries", "both install ` + "`gid`" + ` and ` + "`gid.1`" + `"],
      "link_overwrite": [],
      "caveats": "Commands also provided by macOS and the commands dir, dircolors, vdir have been installed with the prefix \"g\".\nIf you need to use these commands with their normal names, you can add a \"gnubin\" directory to your PATH with:\n  PATH=\"$HOMEBREW_PREFIX/opt/coreutils/libexec/gnubin:$PATH\"\n",
      "installed": [
        {
          "version": "9.11",
          "used_options": [],
          "built_as_bottle": true,
          "poured_from_bottle": true,
          "time": 1780788852,
          "runtime_dependencies": [
            {"full_name": "gmp", "version": "6.3.0", "revision": 0, "bottle_rebuild": 0, "pkg_version": "6.3.0", "declared_directly": true}
          ],
          "installed_on_request": true,
          "installed_as_dependency": false
        }
      ],
      "linked_keg": "9.11",
      "pinned": false,
      "outdated": false,
      "deprecated": false,
      "deprecation_date": null,
      "deprecation_reason": null,
      "disabled": false,
      "disable_date": null,
      "disable_reason": null,
      "post_install_steps": [],
      "post_install_defined": false,
      "service": null,
      "tap_git_head": "abc123",
      "ruby_source_path": "Formula/c/coreutils.rb",
      "ruby_source_checksum": {"sha256": "deadbeef"},
      "head_dependencies": {}
    }
  ],
  "casks": [
    {
      "token": "iterm2",
      "full_token": "iterm2",
      "old_tokens": [],
      "tap": "homebrew/cask",
      "name": ["iTerm2"],
      "desc": "Terminal emulator as alternative to Apple's Terminal app",
      "homepage": "https://iterm2.com/",
      "url": "https://iterm2.com/downloads/stable/iTerm2-3_6_11.zip",
      "url_specs": {},
      "version": "3.6.11",
      "autobump": true,
      "installed": "3.6.11",
      "installed_time": 1780769226,
      "bundle_version": "3.6.11",
      "bundle_short_version": "3.6.11",
      "pinned": false,
      "pinned_version": null,
      "outdated": false,
      "sha256": "36e78c5049560eaa8e122224f6652eb4b229c61cd5e7332d6d25b5c36f7398e7",
      "artifacts": [
        {"app": ["iTerm.app"], "target": "/Applications/iTerm.app"},
        {"zap": [{"trash": [
          "~/Library/Application Support/iTerm",
          "~/Library/Application Support/iTerm2",
          "~/Library/Caches/com.googlecode.iterm2",
          "~/Library/Preferences/com.googlecode.iterm2.plist"
        ]}]}
      ],
      "caveats": null,
      "caveats_rosetta": null,
      "depends_on": {"macos": {">=": ["12"]}},
      "conflicts_with": {"cask": ["iterm2@beta", "iterm2@nightly"]},
      "container": null,
      "rename": [],
      "auto_updates": true,
      "deprecated": false,
      "deprecation_date": null,
      "disabled": false,
      "disable_date": null,
      "tap_git_head": "4c4eeced68a80edd3d8a7d43287a6618d6ee2679",
      "languages": [],
      "ruby_source_path": "Casks/i/iterm2.rb",
      "ruby_source_checksum": {"sha256": "c5cd110e5dabf28727f1788609d800fb180273c85a5a635ea53f0a9f23b20700"}
    }
  ]
}`

// TestDecodeInfoV2_RealFixture feeds decodeInfoV2 a trimmed real
// `brew info --json=v2` payload (see realBrewInfoV2Fixture) and checks the
// fields mead actually surfaces come out right under encoding/json/v2 --
// including a top-level key ("unexpected_future_top_level_key") that isn't
// part of the {formulae, casks} wrapper struct at all, which must be
// silently ignored rather than rejected (v2's RejectUnknownMembers option
// defaults to off, same as v1's always-ignore behavior).
func TestDecodeInfoV2_RealFixture(t *testing.T) {
	pkgs, err := decodeInfoV2([]byte(realBrewInfoV2Fixture))
	if err != nil {
		t.Fatalf("decodeInfoV2: %v", err)
	}
	if len(pkgs) != 2 {
		t.Fatalf("got %d packages, want 2", len(pkgs))
	}

	var formula, cask *BrewPackage
	for i := range pkgs {
		switch pkgs[i].Name {
		case "coreutils":
			formula = &pkgs[i]
		case "iterm2":
			cask = &pkgs[i]
		}
	}
	if formula == nil {
		t.Fatal("coreutils formula not found in decoded output")
	}
	if cask == nil {
		t.Fatal("iterm2 cask not found in decoded output")
	}

	// Formula assertions.
	if formula.FullName != "coreutils" {
		t.Errorf("formula.FullName = %q, want %q", formula.FullName, "coreutils")
	}
	if formula.IsCask {
		t.Error("formula.IsCask = true, want false")
	}
	if formula.Tap != "homebrew/core" {
		t.Errorf("formula.Tap = %q, want %q", formula.Tap, "homebrew/core")
	}
	if formula.Version != "9.11" {
		t.Errorf("formula.Version = %q, want %q (from versions.stable)", formula.Version, "9.11")
	}
	if !formula.Installed {
		t.Error("formula.Installed = false, want true")
	}
	if formula.InstalledVersion != "9.11" {
		t.Errorf("formula.InstalledVersion = %q, want %q", formula.InstalledVersion, "9.11")
	}
	if !formula.InstalledOnRequest {
		t.Error("formula.InstalledOnRequest = false, want true")
	}
	if formula.InstalledAsDependency {
		t.Error("formula.InstalledAsDependency = true, want false")
	}
	if !formula.Linked {
		t.Error("formula.Linked = false, want true (linked_keg == installed version)")
	}
	if formula.Caveats == "" {
		t.Error("formula.Caveats is empty, want the real multi-line caveats text")
	}
	if len(formula.Dependencies) != 1 || formula.Dependencies[0] != "gmp" {
		t.Errorf("formula.Dependencies = %v, want [gmp]", formula.Dependencies)
	}
	wantConflicts := []string{"b2sum", "gfold", "idutils"}
	if len(formula.ConflictsWith) != len(wantConflicts) {
		t.Errorf("formula.ConflictsWith = %v, want %v", formula.ConflictsWith, wantConflicts)
	} else {
		for i, c := range wantConflicts {
			if formula.ConflictsWith[i] != c {
				t.Errorf("formula.ConflictsWith[%d] = %q, want %q", i, formula.ConflictsWith[i], c)
			}
		}
	}

	// Cask assertions.
	if cask.Name != "iterm2" {
		t.Errorf("cask.Name = %q, want %q", cask.Name, "iterm2")
	}
	if !cask.IsCask {
		t.Error("cask.IsCask = false, want true")
	}
	if cask.FullName != "iTerm2" {
		t.Errorf("cask.FullName = %q, want %q (from name[0])", cask.FullName, "iTerm2")
	}
	if cask.Version != "3.6.11" {
		t.Errorf("cask.Version = %q, want %q", cask.Version, "3.6.11")
	}
	if !cask.Installed || cask.InstalledVersion != "3.6.11" {
		t.Errorf("cask.Installed=%v InstalledVersion=%q, want true/%q", cask.Installed, cask.InstalledVersion, "3.6.11")
	}
	if !cask.AutoUpdates {
		t.Error("cask.AutoUpdates = false, want true")
	}
	wantApp := filepath.Join("/Applications", "iTerm.app")
	found := false
	for _, p := range cask.AppPaths {
		if p == wantApp {
			found = true
		}
	}
	if !found {
		t.Errorf("cask.AppPaths = %v, want it to contain %q", cask.AppPaths, wantApp)
	}
	if len(cask.ZapTrashPaths) != 4 {
		t.Errorf("cask.ZapTrashPaths has %d entries, want 4", len(cask.ZapTrashPaths))
	}
	wantArtifactLabel := "App: iTerm.app"
	if len(cask.Artifacts) == 0 || cask.Artifacts[0] != wantArtifactLabel {
		t.Errorf("cask.Artifacts = %v, want first entry %q", cask.Artifacts, wantArtifactLabel)
	}
}

// TestDecodeInfoV2_DuplicateObjectMemberNames documents a genuine behavioral
// difference between v1 and v2: v1 silently accepts duplicate JSON object
// member names (last one wins), while v2 rejects them by default
// (jsontext.AllowDuplicateNames is off by default). Real `brew info --json`
// output has never been observed to contain duplicate keys within a single
// object -- Ruby's Hash#to_json can't produce them -- so this isn't expected
// to bite in practice, but it's the one case where v2 is measurably stricter
// than v1 for object decoding, so it's worth pinning down explicitly rather
// than discovering it via a cryptic user bug report.
func TestDecodeInfoV2_DuplicateObjectMemberNames(t *testing.T) {
	const dup = `{"formulae":[{"name":"a","name":"b"}],"casks":[]}`
	_, err := decodeInfoV2([]byte(dup))
	if err == nil {
		t.Fatal("expected decodeInfoV2 to reject duplicate object member names under encoding/json/v2, got nil error")
	}
	if !strings.Contains(err.Error(), "duplicate") {
		t.Errorf("expected error to mention duplicate names, got: %v", err)
	}
}

// TestOutdatedDecode_UnknownFieldsIgnored proves Outdated's inline decode
// struct tolerates the long tail of fields real `brew outdated --json=v2`
// entries carry beyond installed_versions/current_version/pinned (mirroring
// the shape brew actually emits, e.g. a "pinned_version" field alongside
// "pinned" for formulae), under encoding/json/v2's default of ignoring
// unknown struct members.
func TestOutdatedDecode_UnknownFieldsIgnored(t *testing.T) {
	const raw = `{
  "formulae": [
    {"name": "wget", "installed_versions": ["1.24.5"], "current_version": "1.25.0", "pinned": false, "pinned_version": null}
  ],
  "casks": [
    {"name": "firefox", "installed_versions": ["139.0"], "current_version": "140.0", "unrelated_future_field": {"nested": true}}
  ]
}`
	results, err := decodeOutdatedV2([]byte(raw))
	if err != nil {
		t.Fatalf("Outdated decode: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("got %d results, want 2", len(results))
	}
	if results[0].Name != "wget" || results[0].CurrentVersion != "1.25.0" {
		t.Errorf("unexpected formula result: %+v", results[0])
	}
	if results[1].Name != "firefox" || !results[1].IsCask {
		t.Errorf("unexpected cask result: %+v", results[1])
	}
}

// ---- parseDepsDot ----
//
// These fixtures are verbatim `brew deps --graph --dot <name>` stdout
// (stderr's env hint/deprecation warnings excluded, exactly as RunBrew
// separates them), captured for real against Homebrew 6.0.18 on
// macOS/arm64:
//   - "bat", a formula with a multi-level nested dependency chain.
//   - "gcloud-cli", a cask whose (formula) dependencies fan out and share a
//     common sub-dependency reached two different ways (openssl@3 via
//     python@3.14, and xz via both python@3.14 and zstd) -- exercising
//     dedup of a node reached by more than one edge.
//   - "cmake", a formula with no dependencies at all -- brew still emits
//     "digraph {\n\n}" with an empty body.
const depsDotFixtureBat = `digraph {
  "bat" -> "libgit2"
  "bat" -> "oniguruma"
  "libgit2" -> "libssh2"
  "libgit2" -> "llhttp"
  "libssh2" -> "openssl@3"
  "openssl@3" -> "ca-certificates"
}
`

const depsDotFixtureGcloudCLI = `digraph {
  "gcloud-cli" -> "python@3.14"
  "python@3.14" -> "mpdecimal"
  "python@3.14" -> "openssl@3"
  "python@3.14" -> "sqlite"
  "python@3.14" -> "xz"
  "python@3.14" -> "zstd"
  "openssl@3" -> "ca-certificates"
  "sqlite" -> "readline"
  "zstd" -> "lz4"
  "zstd" -> "xz"
}
`

const depsDotFixtureCmake = `digraph {

}
`

func TestParseDepsDot_Formula(t *testing.T) {
	g := parseDepsDot(depsDotFixtureBat, "bat", false)

	if g.Root != "bat" {
		t.Errorf("Root = %q, want %q", g.Root, "bat")
	}

	wantNodes := []string{"bat", "libgit2", "oniguruma", "libssh2", "llhttp", "openssl@3", "ca-certificates"}
	if len(g.Nodes) != len(wantNodes) {
		t.Fatalf("got %d nodes, want %d: %+v", len(g.Nodes), len(wantNodes), g.Nodes)
	}
	for i, name := range wantNodes {
		if g.Nodes[i].Name != name {
			t.Errorf("Nodes[%d].Name = %q, want %q (order should follow first appearance in the dot output)", i, g.Nodes[i].Name, name)
		}
		if g.Nodes[i].IsCask {
			t.Errorf("Nodes[%d] (%s) IsCask = true, want false: a formula's dependency graph should contain no casks", i, name)
		}
	}

	wantEdges := []DependencyEdge{
		{From: "bat", To: "libgit2"},
		{From: "bat", To: "oniguruma"},
		{From: "libgit2", To: "libssh2"},
		{From: "libgit2", To: "llhttp"},
		{From: "libssh2", To: "openssl@3"},
		{From: "openssl@3", To: "ca-certificates"},
	}
	if len(g.Edges) != len(wantEdges) {
		t.Fatalf("got %d edges, want %d: %+v", len(g.Edges), len(wantEdges), g.Edges)
	}
	for i, e := range wantEdges {
		if g.Edges[i] != e {
			t.Errorf("Edges[%d] = %+v, want %+v", i, g.Edges[i], e)
		}
	}
}

func TestParseDepsDot_CaskRootWithSharedSubDependency(t *testing.T) {
	g := parseDepsDot(depsDotFixtureGcloudCLI, "gcloud-cli", true)

	if len(g.Nodes) != 10 {
		t.Fatalf("got %d nodes, want 10 (no duplicate for the shared xz/openssl@3 nodes): %+v", len(g.Nodes), g.Nodes)
	}

	xzCount := 0
	for _, n := range g.Nodes {
		if n.Name == "xz" {
			xzCount++
		}
	}
	if xzCount != 1 {
		t.Errorf("xz appears %d times in Nodes, want exactly 1 even though it's reached via two different edges", xzCount)
	}

	if len(g.Edges) != 10 {
		t.Errorf("got %d edges, want 10 (one per dot line, duplicates in the node list are collapsed but edges are not)", len(g.Edges))
	}

	for _, n := range g.Nodes {
		wantCask := n.Name == "gcloud-cli"
		if n.IsCask != wantCask {
			t.Errorf("Nodes[%q].IsCask = %v, want %v (only the cask root should be marked as a cask)", n.Name, n.IsCask, wantCask)
		}
	}
}

func TestParseDepsDot_NoDependencies(t *testing.T) {
	g := parseDepsDot(depsDotFixtureCmake, "cmake", false)

	if len(g.Nodes) != 1 || g.Nodes[0].Name != "cmake" {
		t.Errorf("Nodes = %+v, want just the root node [cmake]", g.Nodes)
	}
	if len(g.Edges) != 0 {
		t.Errorf("Edges = %+v, want none", g.Edges)
	}
}
