package security

import (
	"testing"

	"mead/internal/brew"
)

// realBrewVulnsFixture is real, unmodified stdout from
//
//	brew vulns --json libheif miniupnpc augeas jq lame
//
// captured against Homebrew 7.0.6 on macOS/arm64. It was chosen to exercise
// every shape brew vulns' JSON output actually produces on a real machine
// in one fixture:
//   - libheif and miniupnpc: open-only findings (miniupnpc's entry also has
//     real fixed_versions, libheif's don't)
//   - augeas: both an open vulnerability *and* one already resolved by the
//     formula's own patch (its "patched" array) -- the exact shape mead's
//     old OSV.dev-only code had no concept of at all
//   - jq: queried but absent from "findings" entirely, because brew vulns
//     only lists formulae that have *something* to report -- a formula
//     with a clean scan simply doesn't appear, it isn't returned as a
//     finding with empty vulnerabilities/patched arrays
//   - lame: present in "skipped_formulae" (missing/unsupported source URL)
//     rather than "findings", real for this exact installed lame version
const realBrewVulnsFixture = `{
  "findings": [
    {
      "formula": "libheif",
      "version": "1.23.5",
      "tag": "v1.23.5",
      "repo_url": "https://github.com/strukturag/libheif",
      "vulnerabilities": [
        {
          "id": "OSV-2020-2308",
          "severity": "MEDIUM",
          "summary": "Heap-buffer-overflow in derive_collocated_motion_vectors",
          "aliases": [],
          "fixed_versions": []
        },
        {
          "id": "OSV-2023-1129",
          "severity": "MEDIUM",
          "summary": "UNKNOWN READ in HeifPixelImage::overlay",
          "aliases": [],
          "fixed_versions": []
        }
      ],
      "patched": []
    },
    {
      "formula": "miniupnpc",
      "version": "2.3.3",
      "tag": "2.3.3",
      "repo_url": "https://github.com/miniupnp/miniupnp",
      "vulnerabilities": [
        {
          "id": "CVE-2026-5720",
          "severity": "UNKNOWN",
          "summary": "miniupnpd Integer Underflow SOAPAction Header Parsing",
          "aliases": [],
          "fixed_versions": [
            "b5e5d2eb069822b7f00d56c8e61033b9d500e60c",
            "f56bd09b2f2650126b832c5f30a65a09e28167fa"
          ]
        }
      ],
      "patched": []
    },
    {
      "formula": "augeas",
      "version": "1.14.1",
      "tag": "release-1.14.1",
      "repo_url": "https://github.com/hercules-team/augeas",
      "vulnerabilities": [
        {
          "id": "OSV-2020-1540",
          "severity": "MEDIUM",
          "summary": "UNKNOWN READ in eval_expr",
          "aliases": [],
          "fixed_versions": []
        }
      ],
      "patched": [
        {
          "id": "CVE-2025-2588",
          "severity": "UNKNOWN",
          "summary": "Hercules Augeas fa.c re_case_expand null pointer dereference",
          "aliases": [],
          "fixed_versions": []
        }
      ]
    }
  ],
  "skipped_formulae": [
    "lame"
  ]
}`

// realBrewVulnsCleanFixture is real, unmodified stdout from
// `brew vulns --json jq` on the same machine: a formula with nothing to
// report produces an empty "findings" array, not an entry for jq with
// empty sub-arrays.
const realBrewVulnsCleanFixture = `{
  "findings": [],
  "skipped_formulae": []
}`

func TestParseBrewVulnsJSONRealFixture(t *testing.T) {
	out, err := parseBrewVulnsJSON([]byte(realBrewVulnsFixture))
	if err != nil {
		t.Fatalf("parseBrewVulnsJSON() error = %v", err)
	}
	if len(out.Findings) != 3 {
		t.Fatalf("len(Findings) = %d, want 3", len(out.Findings))
	}
	if got, want := out.SkippedFormulae, []string{"lame"}; len(got) != 1 || got[0] != want[0] {
		t.Fatalf("SkippedFormulae = %v, want %v", got, want)
	}

	augeas := out.Findings[2]
	if augeas.Formula != "augeas" || augeas.Version != "1.14.1" {
		t.Fatalf("augeas finding = %+v", augeas)
	}
	if len(augeas.Vulnerabilities) != 1 || augeas.Vulnerabilities[0].ID != "OSV-2020-1540" {
		t.Fatalf("augeas.Vulnerabilities = %+v", augeas.Vulnerabilities)
	}
	if len(augeas.Patched) != 1 || augeas.Patched[0].ID != "CVE-2025-2588" {
		t.Fatalf("augeas.Patched = %+v", augeas.Patched)
	}

	miniupnpc := out.Findings[1]
	if want := []string{
		"b5e5d2eb069822b7f00d56c8e61033b9d500e60c",
		"f56bd09b2f2650126b832c5f30a65a09e28167fa",
	}; len(miniupnpc.Vulnerabilities) != 1 || len(miniupnpc.Vulnerabilities[0].FixedVersions) != 2 ||
		miniupnpc.Vulnerabilities[0].FixedVersions[0] != want[0] {
		t.Fatalf("miniupnpc fixed_versions = %+v", miniupnpc.Vulnerabilities[0].FixedVersions)
	}
}

func TestParseBrewVulnsJSONCleanFixture(t *testing.T) {
	out, err := parseBrewVulnsJSON([]byte(realBrewVulnsCleanFixture))
	if err != nil {
		t.Fatalf("parseBrewVulnsJSON() error = %v", err)
	}
	if len(out.Findings) != 0 || len(out.SkippedFormulae) != 0 {
		t.Fatalf("got %+v, want an entirely empty (but valid) result", out)
	}
}

func TestParseBrewVulnsJSONInvalid(t *testing.T) {
	for _, in := range []string{"", "not json at all", "Error: No available formula with the name \"x\".\n"} {
		if _, err := parseBrewVulnsJSON([]byte(in)); err == nil {
			t.Errorf("parseBrewVulnsJSON(%q) error = nil, want an error", in)
		}
	}
}

func TestBuildVulnResults(t *testing.T) {
	parsed, err := parseBrewVulnsJSON([]byte(realBrewVulnsFixture))
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	targets := []brew.BrewPackage{
		{Name: "libheif", InstalledVersion: "1.23.5"},
		{Name: "miniupnpc", InstalledVersion: "2.3.3"},
		{Name: "augeas", InstalledVersion: "1.14.1"},
		{Name: "jq", InstalledVersion: "1.7.1"},
		{Name: "lame", InstalledVersion: "3.100"},
	}

	results := buildVulnResults(targets, parsed)
	if len(results) != len(targets) {
		t.Fatalf("len(results) = %d, want %d (one per target, regardless of finding/skip/clean)", len(results), len(targets))
	}

	byName := make(map[string]VulnResult, len(results))
	for _, r := range results {
		byName[r.Name] = r
	}

	libheif := byName["libheif"]
	if len(libheif.Open) != 2 || len(libheif.Patched) != 0 || libheif.Skipped {
		t.Fatalf("libheif = %+v", libheif)
	}
	if libheif.Open[0].Severity != VulnSeverityMedium {
		t.Fatalf("libheif.Open[0].Severity = %q, want medium", libheif.Open[0].Severity)
	}

	augeas := byName["augeas"]
	if len(augeas.Open) != 1 || len(augeas.Patched) != 1 {
		t.Fatalf("augeas = %+v, want one open and one patched", augeas)
	}
	if augeas.Patched[0].ID != "CVE-2025-2588" {
		t.Fatalf("augeas.Patched[0].ID = %q", augeas.Patched[0].ID)
	}

	jqResult := byName["jq"]
	if len(jqResult.Open) != 0 || len(jqResult.Patched) != 0 || jqResult.Skipped || jqResult.Error != "" {
		t.Fatalf("jq (absent from findings/skipped, i.e. clean) = %+v", jqResult)
	}
	if jqResult.Open == nil || jqResult.Patched == nil {
		t.Fatalf("jq Open/Patched must be non-nil empty slices for a clean JSON marshal, got %+v", jqResult)
	}

	lame := byName["lame"]
	if !lame.Skipped {
		t.Fatalf("lame.Skipped = false, want true (it's in skipped_formulae)")
	}
	if len(lame.Open) != 0 || len(lame.Patched) != 0 {
		t.Fatalf("lame should have no findings of its own: %+v", lame)
	}

	for _, r := range results {
		if r.Name == "" {
			continue
		}
		if r.IsCask {
			t.Errorf("%s: IsCask = true, VulnResult from brew vulns should never mark a formula as a cask", r.Name)
		}
	}
}

func TestNormalizeSeverity(t *testing.T) {
	tests := []struct {
		in   string
		want VulnSeverity
	}{
		{"CRITICAL", VulnSeverityCritical},
		{"HIGH", VulnSeverityHigh},
		{"MEDIUM", VulnSeverityMedium},
		{"LOW", VulnSeverityLow},
		{"UNKNOWN", VulnSeverityUnknown},
		{"critical", VulnSeverityCritical},
		{"", VulnSeverityUnknown},
		{"totally-not-a-severity", VulnSeverityUnknown},
		{"  Medium  ", VulnSeverityMedium},
	}
	for _, tt := range tests {
		if got := normalizeSeverity(tt.in); got != tt.want {
			t.Errorf("normalizeSeverity(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestToVulnerabilitiesNonNilSlices(t *testing.T) {
	entries := []brewVulnEntry{{ID: "X-1", Severity: "high"}}
	got := toVulnerabilities(entries)
	if len(got) != 1 {
		t.Fatalf("len = %d, want 1", len(got))
	}
	if got[0].Aliases == nil || got[0].FixedVersions == nil {
		t.Fatalf("Aliases/FixedVersions must never be nil (would marshal as JSON null), got %+v", got[0])
	}
	if got[0].Severity != VulnSeverityHigh {
		t.Fatalf("Severity = %q, want high", got[0].Severity)
	}
}

func TestToVulnerabilitiesEmptyInputStaysNonNil(t *testing.T) {
	got := toVulnerabilities(nil)
	if got == nil {
		t.Fatal("toVulnerabilities(nil) = nil, want a non-nil empty slice")
	}
	if len(got) != 0 {
		t.Fatalf("len = %d, want 0", len(got))
	}
}

func TestVulnScanTargets(t *testing.T) {
	pkgs := []brew.BrewPackage{
		{Name: "formula-a", IsCask: false, Installed: true, InstalledVersion: "1.0"},
		{Name: "some-cask", IsCask: true, Installed: true, InstalledVersion: "2.0"},
		{Name: "not-installed", IsCask: false, Installed: false, InstalledVersion: ""},
		{Name: "no-version-somehow", IsCask: false, Installed: true, InstalledVersion: ""},
		{Name: "formula-b", IsCask: false, Installed: true, InstalledVersion: "3.0"},
	}

	got := vulnScanTargets(pkgs)
	if len(got) != 2 {
		t.Fatalf("len(vulnScanTargets()) = %d, want 2 (only formula-a and formula-b qualify)", len(got))
	}
	for _, p := range got {
		if p.IsCask {
			t.Errorf("vulnScanTargets() included a cask: %s", p.Name)
		}
		if p.Name != "formula-a" && p.Name != "formula-b" {
			t.Errorf("vulnScanTargets() included unexpected package %q", p.Name)
		}
	}
}

func TestHasCommand(t *testing.T) {
	names := []string{"install", "vulns", "uninstall", "bundle"}
	if !hasCommand(names, "vulns") {
		t.Error("hasCommand(names, \"vulns\") = false, want true")
	}
	if hasCommand(names, "nonexistent-command") {
		t.Error("hasCommand(names, \"nonexistent-command\") = true, want false")
	}
	if hasCommand(nil, "vulns") {
		t.Error("hasCommand(nil, ...) = true, want false")
	}
}

func TestBuildOSVResults(t *testing.T) {
	targets := []brew.BrewPackage{
		{Name: "vulnerable-one", InstalledVersion: "1.0"},
		{Name: "clean-one", InstalledVersion: "2.0"},
	}
	batch := osvBatchResponse{
		Results: []osvResult{
			{Vulns: []osvVulnRef{{ID: "OSV-1"}, {ID: "OSV-2"}}},
			{Vulns: []osvVulnRef{}},
		},
	}

	results := buildOSVResults(targets, batch)
	if len(results) != 2 {
		t.Fatalf("len(results) = %d, want 2", len(results))
	}
	if len(results[0].Open) != 2 || results[0].Open[0].ID != "OSV-1" {
		t.Fatalf("results[0] = %+v", results[0])
	}
	if results[0].Open[0].Severity != VulnSeverityUnknown {
		t.Fatalf("OSV.dev fallback should never claim a real severity, got %q", results[0].Open[0].Severity)
	}
	if len(results[1].Open) != 0 {
		t.Fatalf("results[1] = %+v, want no open vulns", results[1])
	}
	if results[0].Patched == nil || len(results[0].Patched) != 0 {
		t.Fatalf("OSV.dev fallback has no concept of patched-vs-open; Patched should be a non-nil empty slice, got %+v", results[0].Patched)
	}
}

// TestBuildOSVResultsShorterBatchThanTargets guards the same
// index-alignment assumption the original OSV.dev code depended on: if
// OSV.dev's response array is ever shorter than the request's query
// array (which shouldn't happen per its API contract, but this is an
// external service mead doesn't control), targets past the end of the
// batch response get "no open vulnerabilities" rather than a panic or a
// silently misaligned result.
func TestBuildOSVResultsShorterBatchThanTargets(t *testing.T) {
	targets := []brew.BrewPackage{
		{Name: "a", InstalledVersion: "1.0"},
		{Name: "b", InstalledVersion: "2.0"},
	}
	batch := osvBatchResponse{Results: []osvResult{{Vulns: []osvVulnRef{{ID: "OSV-1"}}}}}

	results := buildOSVResults(targets, batch)
	if len(results) != 2 {
		t.Fatalf("len(results) = %d, want 2", len(results))
	}
	if len(results[1].Open) != 0 {
		t.Fatalf("results[1].Open = %+v, want empty (no corresponding batch entry)", results[1].Open)
	}
}

// TestBuildVulnResultsMatchesTapFormulaeByFullName covers a real quirk seen
// on Homebrew 7.0.6: brew vulns lists a tap formula in skipped_formulae (and
// would in findings) by its full name, "hashicorp/tap/terraform", while
// brew info's short name for it is "terraform".
func TestBuildVulnResultsMatchesTapFormulaeByFullName(t *testing.T) {
	parsed, err := parseBrewVulnsJSON([]byte(`{
  "findings": [
    {"formula": "hashicorp/tap/vault", "version": "1.0", "tag": "v1.0", "repo_url": "",
     "vulnerabilities": [{"id": "CVE-1", "severity": "HIGH", "summary": "s", "aliases": [], "fixed_versions": []}],
     "patched": []}
  ],
  "skipped_formulae": ["hashicorp/tap/terraform"]
}`))
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	targets := []brew.BrewPackage{
		{Name: "terraform", FullName: "hashicorp/tap/terraform", InstalledVersion: "1.5"},
		{Name: "vault", FullName: "hashicorp/tap/vault", InstalledVersion: "1.0"},
	}
	results := buildVulnResults(targets, parsed)
	if !results[0].Skipped {
		t.Errorf("terraform should be marked skipped via its full name: %+v", results[0])
	}
	if len(results[1].Open) != 1 || results[1].Open[0].Severity != VulnSeverityHigh {
		t.Errorf("vault should match its finding via its full name: %+v", results[1])
	}
}
