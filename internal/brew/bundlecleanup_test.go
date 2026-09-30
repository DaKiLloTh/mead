package brew

import "testing"

// realBundleCleanupFixture is real, unmodified stdout (stderr, which
// carried an unrelated cask-warning line, was captured separately and
// confirmed not to be part of this) from running
//
//	brew bundle cleanup --file=<a Brewfile containing only "brew jq" and
//	"cask iterm2" plus one entry each of vscode/go/cargo/uv/krew/flatpak/
//	winget/npm>
//
// against a real, heavily-populated Homebrew 7.0.6 installation (203
// installed formulae, 14 casks, 2 taps, 11 VSCode extensions, 6 Go
// packages, 9 Cargo packages, 2 npm packages -- everything not covered by
// that minimal Brewfile is what "would be uninstalled").
//
// It's trimmed here (long install lists cut down to a representative few
// per section, each cut clearly marked) but every remaining line, section
// heading, and the trailing "Would `brew cleanup`:" / "Run `brew bundle
// cleanup --force`..." noise are verbatim -- including the exact bug this
// was captured to catch: brew bundle cleanup always appends its own
// unrelated download-cache cleanup preview after the Brewfile-entry
// sections, with no blank line or Brewfile-specific heading separating it,
// and the old naive line-by-line parser would have silently attributed
// those "Would remove: ..." cache-file lines to whatever entry type's
// section came last (npm, in this exact capture).
//
// uv, krew, flatpak, and winget entries were included in the Brewfile this
// was run against but produced no section here at all -- none of those
// package managers (uv/kubectl-krew/flatpak/winget) are installed on the
// machine this was captured on, and brew bundle cleanup's own
// cleanup_items simply returns nothing for an extension type whose
// package manager isn't present (see Homebrew's
// bundle/extensions/extension.rb: `return [].freeze unless
// package_manager_installed?`). That's real, confirmed behavior, not an
// omission in this fixture -- see realBundleCleanupSyntheticHeadingsFixture
// below for those four sections' exact heading text instead, sourced
// directly from Homebrew's own extension source files since no real
// capture of them exists on this machine.
const realBundleCleanupFixture = `Would uninstall casks:
alfred
bambu-studio
blender
Would uninstall formulae:
act
libvmaf
aom
readline
hashicorp/tap/terraform
Would untap:
hashicorp/tap
dakilloth/mead
Would uninstall VSCode extensions:
anthropic.claude-code
jebbs.plantuml
leathong.openscad-language-support
Would uninstall Go packages:
github.com/air-verse/air
github.com/kisielk/errcheck
github.com/boumenot/gocover-cobertura
Would uninstall Cargo packages:
cargo-audit
cargo-cache
cargo-expand
Would uninstall npm packages:
corepack
firebase-tools
Would ` + "`brew cleanup`" + `:
Would remove: /Users/danthomas/Library/Caches/Homebrew/Cask/keka--1.6.7.dmg (35.9MB)
Would remove: /Users/danthomas/Library/Caches/Homebrew/bootsnap/ec154b602b05b15a0340fbab6a2bafa7e6ccee1172933d21aa963b46340b4302 (1,854 files, 16.3MB)
Would remove: /Users/danthomas/Library/Caches/Homebrew/bootsnap/40320cc6be894e2f938e6d11101b161724eb615a6633777f610bdb31ea07df09 (1,857 files, 16.6MB)
Run ` + "`brew bundle cleanup --force`" + ` to make these changes.
`

// realBundleCleanupCleanFixture is real, unmodified stdout from running
// `brew bundle cleanup` (no --force) against a Brewfile produced by
// `brew bundle dump --force` against the exact same installation (so every
// installed formula/cask/tap is already declared, nothing would be
// uninstalled) -- the only section that ever appears is the unrelated
// download-cache cleanup preview, exercising the "nothing to report, but
// the cache-cleanup noise section still shows up" case on its own.
const realBundleCleanupCleanFixture = "Would `brew cleanup`:\n" +
	"Would remove: /Users/danthomas/Library/Caches/Homebrew/Cask/keka--1.6.7.dmg (35.9MB)\n" +
	"Run `brew bundle cleanup --force` to make these changes.\n"

// syntheticBundleCleanupHeadingsFixture is *not* captured real command
// output -- this machine has no uv/Krew/Flatpak/WinGet/Mac-App-Store
// entries installed via brew bundle to capture a genuine "would uninstall"
// section for. Its section headings are copied verbatim from each
// extension's own cleanup_heading/banner_name in Homebrew 7.0.6's source
// (see bundleCleanupHeadingTypes' doc comment for the exact file each one
// came from); only the item names under each heading are made up.
const syntheticBundleCleanupHeadingsFixture = `Would uninstall Mac App Store apps:
Some App
Would uninstall uv tools:
black
Would uninstall Krew plugins:
ctx
Would uninstall flatpaks:
org.gimp.GIMP
Would uninstall WinGet packages:
Microsoft.VisualStudioCode
`

func TestParseBundleCleanupPreviewRealFixture(t *testing.T) {
	items := parseBundleCleanupPreview(realBundleCleanupFixture)

	byType := map[BundleEntryType][]string{}
	for _, it := range items {
		byType[it.Type] = append(byType[it.Type], it.Name)
	}

	wantCounts := map[BundleEntryType]int{
		BundleEntryCask:    3,
		BundleEntryFormula: 5,
		BundleEntryTap:     2,
		BundleEntryVSCode:  3,
		BundleEntryGo:      3,
		BundleEntryCargo:   3,
		BundleEntryNpm:     2,
	}
	for entryType, want := range wantCounts {
		if got := len(byType[entryType]); got != want {
			t.Errorf("%s: got %d items %v, want %d", entryType, got, byType[entryType], want)
		}
	}

	// Every item claiming to be a cask must actually be one, and nothing
	// else should ever set IsCask.
	for _, it := range items {
		wantIsCask := it.Type == BundleEntryCask
		if it.IsCask != wantIsCask {
			t.Errorf("item %q (type %s): IsCask = %v, want %v", it.Name, it.Type, it.IsCask, wantIsCask)
		}
	}

	// The tap-qualified formula name and the taps themselves parsed as
	// plain names, not mangled by the tap-name's own slashes.
	found := false
	for _, name := range byType[BundleEntryFormula] {
		if name == "hashicorp/tap/terraform" {
			found = true
		}
	}
	if !found {
		t.Errorf("formulae = %v, want to include the tap-qualified name hashicorp/tap/terraform", byType[BundleEntryFormula])
	}

	// The critical regression this fixture exists to catch: the unrelated
	// `brew cleanup` cache-file preview after the last real section must
	// not leak into any entry-type's item list.
	for entryType, names := range byType {
		for _, name := range names {
			if name == "Would remove: /Users/danthomas/Library/Caches/Homebrew/Cask/keka--1.6.7.dmg (35.9MB)" {
				t.Fatalf("cache-cleanup noise line leaked into %s's items: %v", entryType, names)
			}
		}
	}
	total := 0
	for _, names := range byType {
		total += len(names)
	}
	if total != len(items) {
		t.Fatalf("accounted for %d items across types but parseBundleCleanupPreview returned %d -- something wasn't typed as expected", total, len(items))
	}
}

func TestParseBundleCleanupPreviewCleanFixture(t *testing.T) {
	items := parseBundleCleanupPreview(realBundleCleanupCleanFixture)
	if len(items) != 0 {
		t.Fatalf("parseBundleCleanupPreview() = %v, want no items when only the unrelated cache-cleanup section is present", items)
	}
}

func TestParseBundleCleanupPreviewSyntheticHeadings(t *testing.T) {
	items := parseBundleCleanupPreview(syntheticBundleCleanupHeadingsFixture)

	want := map[BundleEntryType]string{
		BundleEntryMas:     "Some App",
		BundleEntryUv:      "black",
		BundleEntryKrew:    "ctx",
		BundleEntryFlatpak: "org.gimp.GIMP",
		BundleEntryWinget:  "Microsoft.VisualStudioCode",
	}
	if len(items) != len(want) {
		t.Fatalf("len(items) = %d, want %d: %+v", len(items), len(want), items)
	}
	for _, it := range items {
		wantName, ok := want[it.Type]
		if !ok {
			t.Errorf("unexpected type %s in items", it.Type)
			continue
		}
		if it.Name != wantName {
			t.Errorf("type %s: name = %q, want %q", it.Type, it.Name, wantName)
		}
		if it.IsCask {
			t.Errorf("type %s: IsCask = true, want false", it.Type)
		}
	}
}

func TestParseBundleCleanupPreviewUnrecognizedHeadingDoesNotLeak(t *testing.T) {
	// A heading this parser has never seen before (simulating a future
	// Homebrew entry type it hasn't been taught about yet) must stop
	// collection rather than silently keep attributing lines to whatever
	// section came before it.
	out := `Would uninstall formulae:
jq
Would uninstall some brand new future type:
some-new-thing
Would uninstall casks:
iterm2
`
	items := parseBundleCleanupPreview(out)

	var formulaNames, caskNames []string
	for _, it := range items {
		switch it.Type {
		case BundleEntryFormula:
			formulaNames = append(formulaNames, it.Name)
		case BundleEntryCask:
			caskNames = append(caskNames, it.Name)
		}
	}
	if len(formulaNames) != 1 || formulaNames[0] != "jq" {
		t.Errorf("formulae = %v, want exactly [jq] (the unrecognized-heading line must not join this section)", formulaNames)
	}
	if len(caskNames) != 1 || caskNames[0] != "iterm2" {
		t.Errorf("casks = %v, want exactly [iterm2]", caskNames)
	}
	for _, it := range items {
		if it.Name == "some-new-thing" {
			t.Fatalf("item from the unrecognized section leaked into results: %+v", it)
		}
	}
}

func TestParseBundleCleanupPreviewEmptyOutput(t *testing.T) {
	if items := parseBundleCleanupPreview(""); len(items) != 0 {
		t.Fatalf("parseBundleCleanupPreview(\"\") = %v, want none", items)
	}
	if items := parseBundleCleanupPreview("   \n\n  \n"); len(items) != 0 {
		t.Fatalf("parseBundleCleanupPreview(whitespace only) = %v, want none", items)
	}
}
