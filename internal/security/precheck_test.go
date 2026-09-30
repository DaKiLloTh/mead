package security

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// ---- pure logic: containerKindForPath ----

func TestContainerKindForPath(t *testing.T) {
	tests := []struct {
		name string
		path string
		want ContainerKind
	}{
		{"dmg", "/tmp/downloads/abc--Keka-1.6.7.dmg", ContainerDMG},
		{"pkg", "/tmp/downloads/abc--zoomusInstallerFull.pkg", ContainerPKG},
		{"mpkg", "/tmp/downloads/abc--Thing.mpkg", ContainerPKG},
		{"zip", "/tmp/downloads/abc--logioptionsplus_installer.zip", ContainerZIP},
		{"uppercase extension", "/tmp/downloads/abc--Thing.DMG", ContainerDMG},
		{"tarball is unknown", "/tmp/downloads/abc--thing.tar.gz", ContainerUnknown},
		{"no extension", "/tmp/downloads/abc--thing", ContainerUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := containerKindForPath(tt.path); got != tt.want {
				t.Errorf("containerKindForPath(%q) = %q, want %q", tt.path, got, tt.want)
			}
		})
	}
}

// ---- pure logic: pickInspectableEntry ----

func TestPickInspectableEntry(t *testing.T) {
	tests := []struct {
		name    string
		entries []string
		wantApp string
		wantPkg string
	}{
		{"app present", []string{"Applications", "Keka.app"}, "Keka.app", ""},
		{
			"pkg only, mirrors wireshark-chmodbpf's nested_container",
			[]string{"Install ChmodBPF.pkg", "Read Me.rtf"},
			"", "Install ChmodBPF.pkg",
		},
		{"app wins over pkg when both present", []string{"Installer.pkg", "Thing.app"}, "Thing.app", ""},
		{"neither", []string{"ReadMe.txt", "License.rtf"}, "", ""},
		{"empty", nil, "", ""},
		{"pkg match is case-insensitive", []string{"Installer.PKG"}, "", "Installer.PKG"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotApp, gotPkg := pickInspectableEntry(tt.entries)
			if gotApp != tt.wantApp || gotPkg != tt.wantPkg {
				t.Errorf("pickInspectableEntry(%v) = (%q, %q), want (%q, %q)", tt.entries, gotApp, gotPkg, tt.wantApp, tt.wantPkg)
			}
		})
	}
}

// ---- findInspectable: real directory listing, no shelling out ----

func TestFindInspectableApp(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "Keka.app", "Contents"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "Applications"), 0o755); err != nil {
		t.Fatal(err)
	}

	appPath, pkgPath := findInspectable(dir)
	if appPath != filepath.Join(dir, "Keka.app") {
		t.Errorf("appPath = %q, want %q", appPath, filepath.Join(dir, "Keka.app"))
	}
	if pkgPath != "" {
		t.Errorf("pkgPath = %q, want empty", pkgPath)
	}
}

func TestFindInspectablePkgOnly(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "Install ChmodBPF.pkg"), []byte("not a real pkg"), 0o644); err != nil {
		t.Fatal(err)
	}

	appPath, pkgPath := findInspectable(dir)
	if appPath != "" {
		t.Errorf("appPath = %q, want empty", appPath)
	}
	want := filepath.Join(dir, "Install ChmodBPF.pkg")
	if pkgPath != want {
		t.Errorf("pkgPath = %q, want %q", pkgPath, want)
	}
}

func TestFindInspectableNothing(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "ReadMe.txt"), []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}

	appPath, pkgPath := findInspectable(dir)
	if appPath != "" || pkgPath != "" {
		t.Errorf("findInspectable() = (%q, %q), want (\"\", \"\")", appPath, pkgPath)
	}
}

func TestFindInspectableMissingDir(t *testing.T) {
	appPath, pkgPath := findInspectable(filepath.Join(t.TempDir(), "does-not-exist"))
	if appPath != "" || pkgPath != "" {
		t.Errorf("findInspectable() on a missing dir = (%q, %q), want (\"\", \"\")", appPath, pkgPath)
	}
}

// ---- pure logic: notarizedFromAssessment, against real spctl transcripts
// captured while researching issue #50 ----

func TestNotarizedFromAssessment(t *testing.T) {
	// Real `spctl --assess --type execute -vv` output for keka.app, mounted
	// from a real `brew fetch --cask keka` download.
	const notarizedTranscript = `/Volumes/FakeVol/Keka.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: Jorge Garcia Armero (4FG648TM2A)`

	// Real output for an unsigned app built for this test (no code
	// signature at all).
	const rejectedTranscript = `/Volumes/FakeVol/Fake.app: rejected
source=no usable signature`

	tests := []struct {
		name       string
		assessment string
		want       bool
	}{
		{"notarized", notarizedTranscript, true},
		{"rejected, unsigned", rejectedTranscript, false},
		{"empty", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := notarizedFromAssessment(tt.assessment); got != tt.want {
				t.Errorf("notarizedFromAssessment(%q) = %v, want %v", tt.assessment, got, tt.want)
			}
		})
	}
}

// ---- pure logic: pkgutil --check-signature parsing, against real
// transcripts captured while researching issue #50 ----

// realSignedPkgutilOutput is the actual `pkgutil --check-signature` output
// for a real `brew fetch --cask xquartz` download (XQuartz-2.8.6.pkg),
// which ships as a direct .pkg -- no nested dmg.
const realSignedPkgutilOutput = `Package "2ec16f17dc4d2f55500b326d44b6ccb8a4dc343b61262fc7a3ea8677524c791b--XQuartz-2.8.6.pkg":
   Status: signed by a developer certificate issued by Apple for distribution
   Notarization: trusted by the Apple notary service
   Signed with a trusted timestamp on: 2026-07-13 23:06:08 +0000
   Certificate Chain:
    1. Developer ID Installer: Apple Inc. - XQuartz (NA574AWV7E)
       Expires: 2027-02-01 22:12:15 +0000
       SHA256 Fingerprint:
           8F 0E 65 96 A5 E8 97 9F ED FA 7C 58 8A 69 6E 76 95 90 7E DC 22 EE
           94 BD B4 6F 74 7E 36 F7 C0 85
       ------------------------------------------------------------------------
    2. Developer ID Certification Authority
       Expires: 2027-02-01 22:12:15 +0000
       SHA256 Fingerprint:
           7A FC 9D 01 A6 2F 03 A2 DE 96 37 93 6D 4A FE 68 09 0D 2D E1 8D 03
           F2 9C 88 CF B0 B1 BA 63 58 7F
       ------------------------------------------------------------------------
    3. Apple Root CA
       Expires: 2035-02-09 21:40:36 +0000
       SHA256 Fingerprint:
           B0 B1 73 0E CB C7 FF 45 05 14 2C 49 F1 29 5E 6E DA 6B CA ED 7E 2C
           68 C5 BE 91 B5 A1 10 01 F0 24
`

// realUnsignedPkgutilOutput is the actual output for a locally built,
// deliberately unsigned pkg (via `pkgbuild`, no code signing identity).
const realUnsignedPkgutilOutput = `Package "unsigned-test.pkg":
   Status: no signature
`

func TestParsePkgutilCheckSignature(t *testing.T) {
	tests := []struct {
		name          string
		output        string
		wantStatus    string
		wantSigned    bool
		wantNotarized bool
	}{
		{
			name:          "real signed, notarized pkg (xquartz)",
			output:        realSignedPkgutilOutput,
			wantStatus:    "signed by a developer certificate issued by Apple for distribution",
			wantSigned:    true,
			wantNotarized: true,
		},
		{
			name:          "real unsigned pkg",
			output:        realUnsignedPkgutilOutput,
			wantStatus:    "no signature",
			wantSigned:    false,
			wantNotarized: false,
		},
		{
			name:          "empty output",
			output:        "",
			wantStatus:    "",
			wantSigned:    false,
			wantNotarized: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, signed, notarized := parsePkgutilCheckSignature(tt.output)
			if status != tt.wantStatus {
				t.Errorf("status = %q, want %q", status, tt.wantStatus)
			}
			if signed != tt.wantSigned {
				t.Errorf("signed = %v, want %v", signed, tt.wantSigned)
			}
			if notarized != tt.wantNotarized {
				t.Errorf("notarized = %v, want %v", notarized, tt.wantNotarized)
			}
		})
	}
}

func TestParsePkgutilCertificate(t *testing.T) {
	tests := []struct {
		name          string
		output        string
		wantAuthority string
		wantTeamID    string
	}{
		{
			name:          "real signed pkg (xquartz)",
			output:        realSignedPkgutilOutput,
			wantAuthority: "Developer ID Installer: Apple Inc. - XQuartz (NA574AWV7E)",
			wantTeamID:    "NA574AWV7E",
		},
		{
			name:          "unsigned pkg has no certificate chain",
			output:        realUnsignedPkgutilOutput,
			wantAuthority: "",
			wantTeamID:    "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			authority, teamID := parsePkgutilCertificate(tt.output)
			if authority != tt.wantAuthority {
				t.Errorf("authority = %q, want %q", authority, tt.wantAuthority)
			}
			if teamID != tt.wantTeamID {
				t.Errorf("teamID = %q, want %q", teamID, tt.wantTeamID)
			}
		})
	}
}

// ---- integration: real shell-outs against fixtures built at test time
// (pkgbuild/ditto/hdiutil), no network involved ----

// requireTool skips the test if name isn't on PATH, so these integration
// tests degrade gracefully outside the macOS CI environment they're written
// for rather than failing outright.
func requireTool(t *testing.T, name string) {
	t.Helper()
	if _, err := exec.LookPath(name); err != nil {
		t.Skipf("%s not found on this system", name)
	}
}

// buildFakeUnsignedApp creates a minimal, deliberately unsigned .app bundle
// under dir/appName -- enough structure for codesign/spctl to give a real
// (negative) verdict, without needing an actual code-signing identity.
func buildFakeUnsignedApp(t *testing.T, dir, appName string) string {
	t.Helper()
	appPath := filepath.Join(dir, appName)
	if err := os.MkdirAll(filepath.Join(appPath, "Contents", "MacOS"), 0o755); err != nil {
		t.Fatal(err)
	}
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Fake</string></dict></plist>`
	if err := os.WriteFile(filepath.Join(appPath, "Contents", "Info.plist"), []byte(plist), 0o644); err != nil {
		t.Fatal(err)
	}
	exePath := filepath.Join(appPath, "Contents", "MacOS", "Fake")
	if err := os.WriteFile(exePath, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	return appPath
}

func TestInspectDownloadedPkgUnsigned(t *testing.T) {
	requireTool(t, "pkgbuild")
	requireTool(t, "pkgutil")

	dir := t.TempDir()
	root := filepath.Join(dir, "root")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	pkgPath := filepath.Join(dir, "unsigned-test.pkg")
	cmd := exec.Command("pkgbuild", "--root", root, "--identifier", "com.example.mead-test", "--version", "1.0", pkgPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("pkgbuild failed: %v\n%s", err, out)
	}

	info := &PreInstallSecurityInfo{}
	inspectDownloadedPkg(context.Background(), pkgPath, info)

	if info.Signed {
		t.Errorf("Signed = true, want false for an unsigned pkg")
	}
	if info.GatekeeperOK {
		t.Errorf("GatekeeperOK = true, want false for an unsigned pkg")
	}
	if info.Notarized {
		t.Errorf("Notarized = true, want false for an unsigned pkg")
	}
	if !strings.Contains(info.Assessment, "no signature") {
		t.Errorf("Assessment = %q, want it to mention \"no signature\"", info.Assessment)
	}
}

func TestInspectDownloadedZipUnsignedApp(t *testing.T) {
	requireTool(t, "ditto")
	requireTool(t, "codesign")
	requireTool(t, "spctl")

	dir := t.TempDir()
	srcDir := filepath.Join(dir, "src")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	appPath := buildFakeUnsignedApp(t, srcDir, "Fake.app")

	zipPath := filepath.Join(dir, "fake.zip")
	cmd := exec.Command("ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", appPath, zipPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("ditto -c failed: %v\n%s", err, out)
	}

	info := &PreInstallSecurityInfo{Container: ContainerZIP}
	inspectDownloadedZip(context.Background(), zipPath, info)

	if info.Unsupported {
		t.Fatalf("Unsupported = true (%q), want a real (negative) inspection result", info.Note)
	}
	if info.Signed {
		t.Errorf("Signed = true, want false for an unsigned app")
	}
	if info.GatekeeperOK {
		t.Errorf("GatekeeperOK = true, want false for an unsigned app")
	}
	if !strings.Contains(info.Assessment, "rejected") {
		t.Errorf("Assessment = %q, want it to mention \"rejected\"", info.Assessment)
	}
}

func TestInspectDownloadedDMGUnsignedApp(t *testing.T) {
	requireTool(t, "hdiutil")
	requireTool(t, "codesign")
	requireTool(t, "spctl")

	dir := t.TempDir()
	srcDir := filepath.Join(dir, "src")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	buildFakeUnsignedApp(t, srcDir, "Fake.app")

	dmgPath := filepath.Join(dir, "fake.dmg")
	cmd := exec.Command("hdiutil", "create", "-size", "10m", "-fs", "HFS+", "-volname", "FakeVol", "-srcfolder", srcDir, dmgPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("hdiutil create failed: %v\n%s", err, out)
	}

	info := &PreInstallSecurityInfo{Container: ContainerDMG}
	inspectDownloadedDMG(context.Background(), dmgPath, info)

	if info.Unsupported {
		t.Fatalf("Unsupported = true (%q), want a real (negative) inspection result", info.Note)
	}
	if info.Signed {
		t.Errorf("Signed = true, want false for an unsigned app")
	}
	if info.GatekeeperOK {
		t.Errorf("GatekeeperOK = true, want false for an unsigned app")
	}
	if !strings.Contains(info.Assessment, "rejected") {
		t.Errorf("Assessment = %q, want it to mention \"rejected\"", info.Assessment)
	}
}

// TestInspectDownloadedDMGMountFailureCleansUp is the "mount-failure cleanup
// handling" case flagged in issue #50: a file with a .dmg extension that
// isn't actually a disk image (so hdiutil attach fails) must still leave no
// temp directory behind, and must report Unsupported rather than crashing
// or silently returning an empty (looks-signed) result.
func TestInspectDownloadedDMGMountFailureCleansUp(t *testing.T) {
	requireTool(t, "hdiutil")

	dir := t.TempDir()
	bogusPath := filepath.Join(dir, "bogus.dmg")
	if err := os.WriteFile(bogusPath, []byte("not actually a disk image"), 0o644); err != nil {
		t.Fatal(err)
	}

	before, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	info := &PreInstallSecurityInfo{Container: ContainerDMG}
	inspectDownloadedDMG(context.Background(), bogusPath, info)

	if !info.Unsupported {
		t.Errorf("Unsupported = false, want true for a mount failure")
	}
	if info.Note == "" {
		t.Errorf("Note is empty, want an explanation of the mount failure")
	}
	if info.Signed || info.GatekeeperOK {
		t.Errorf("Signed/GatekeeperOK should stay false on a mount failure, got Signed=%v GatekeeperOK=%v", info.Signed, info.GatekeeperOK)
	}

	after, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(after) > len(before) {
		t.Errorf("os.TempDir() grew from %d entries to %d after a failed mount; a temp dir was left behind", len(before), len(after))
	}
}

// TestInspectDownloadedCaskUnsupportedContainer exercises
// inspectDownloadedCask's dispatch switch directly against a real local
// file with an unrecognized extension -- it should report Unsupported with
// an explanatory note, not attempt to shell out to anything.
func TestInspectDownloadedCaskUnsupportedContainer(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "mystery-installer.run")
	if err := os.WriteFile(path, []byte("data"), 0o644); err != nil {
		t.Fatal(err)
	}

	info := inspectDownloadedCask(context.Background(), "mystery-cask", path)

	if info.CaskToken != "mystery-cask" {
		t.Errorf("CaskToken = %q, want %q", info.CaskToken, "mystery-cask")
	}
	if info.Container != ContainerUnknown {
		t.Errorf("Container = %q, want %q", info.Container, ContainerUnknown)
	}
	if !info.Unsupported {
		t.Errorf("Unsupported = false, want true for an unrecognized container type")
	}
	if info.Note == "" {
		t.Errorf("Note is empty, want an explanation")
	}
	if info.DownloadSizeBytes != int64(len("data")) {
		t.Errorf("DownloadSizeBytes = %d, want %d", info.DownloadSizeBytes, len("data"))
	}
	if info.DownloadSizeHuman == "" {
		t.Errorf("DownloadSizeHuman is empty, want a formatted size")
	}
}

// TestInspectDownloadedCaskPkgDispatch exercises inspectDownloadedCask end
// to end for the .pkg branch, verifying the CaskToken/DownloadPath/size
// bookkeeping around inspectDownloadedPkg (already covered on its own by
// TestInspectDownloadedPkgUnsigned above).
func TestInspectDownloadedCaskPkgDispatch(t *testing.T) {
	requireTool(t, "pkgbuild")
	requireTool(t, "pkgutil")

	dir := t.TempDir()
	root := filepath.Join(dir, "root")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	pkgPath := filepath.Join(dir, "unsigned-test.pkg")
	cmd := exec.Command("pkgbuild", "--root", root, "--identifier", "com.example.mead-test", "--version", "1.0", pkgPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("pkgbuild failed: %v\n%s", err, out)
	}

	info := inspectDownloadedCask(context.Background(), "some-cask", pkgPath)

	if info.CaskToken != "some-cask" {
		t.Errorf("CaskToken = %q, want %q", info.CaskToken, "some-cask")
	}
	if info.DownloadPath != pkgPath {
		t.Errorf("DownloadPath = %q, want %q", info.DownloadPath, pkgPath)
	}
	if info.Container != ContainerPKG {
		t.Errorf("Container = %q, want %q", info.Container, ContainerPKG)
	}
	if info.DownloadSizeBytes <= 0 {
		t.Errorf("DownloadSizeBytes = %d, want > 0", info.DownloadSizeBytes)
	}
	if info.Signed {
		t.Errorf("Signed = true, want false for an unsigned pkg")
	}
}

// TestInspectDownloadedZipExtractFailure covers the "couldn't extract"
// branch: a file with a .zip extension that ditto can't actually open.
func TestInspectDownloadedZipExtractFailure(t *testing.T) {
	requireTool(t, "ditto")

	dir := t.TempDir()
	bogusPath := filepath.Join(dir, "bogus.zip")
	if err := os.WriteFile(bogusPath, []byte("not actually a zip"), 0o644); err != nil {
		t.Fatal(err)
	}

	before, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	info := &PreInstallSecurityInfo{Container: ContainerZIP}
	inspectDownloadedZip(context.Background(), bogusPath, info)

	if !info.Unsupported {
		t.Errorf("Unsupported = false, want true for an unextractable archive")
	}
	if info.Note == "" {
		t.Errorf("Note is empty, want an explanation of the extraction failure")
	}

	after, err := os.ReadDir(os.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if len(after) > len(before) {
		t.Errorf("os.TempDir() grew from %d entries to %d after a failed extraction; a temp dir was left behind", len(before), len(after))
	}
}

// TestInspectDownloadedZipNothingInside covers the "couldn't find an app or
// installer package" branch: a real, successfully-extracted archive that
// just doesn't contain anything inspectable.
func TestInspectDownloadedZipNothingInside(t *testing.T) {
	requireTool(t, "ditto")

	dir := t.TempDir()
	srcDir := filepath.Join(dir, "src")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(srcDir, "ReadMe.txt"), []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}

	zipPath := filepath.Join(dir, "readme-only.zip")
	cmd := exec.Command("ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", srcDir, zipPath)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("ditto -c failed: %v\n%s", err, out)
	}

	info := &PreInstallSecurityInfo{Container: ContainerZIP}
	inspectDownloadedZip(context.Background(), zipPath, info)

	if !info.Unsupported {
		t.Errorf("Unsupported = false, want true when nothing inspectable is inside")
	}
	if info.Note == "" {
		t.Errorf("Note is empty, want an explanation")
	}
}

// TestInspectDownloadedDMGNestedPkg covers the DMG-with-a-nested-pkg branch
// -- Homebrew's nested_container pattern (real example: wireshark-chmodbpf
// ships "Install ChmodBPF.pkg" inside a downloaded .dmg) -- by building a
// disk image whose only payload is an unsigned .pkg rather than a .app.
func TestInspectDownloadedDMGNestedPkg(t *testing.T) {
	requireTool(t, "hdiutil")
	requireTool(t, "pkgbuild")
	requireTool(t, "pkgutil")

	dir := t.TempDir()
	pkgRoot := filepath.Join(dir, "pkgroot")
	if err := os.MkdirAll(pkgRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	srcDir := filepath.Join(dir, "src")
	if err := os.MkdirAll(srcDir, 0o755); err != nil {
		t.Fatal(err)
	}
	nestedPkgPath := filepath.Join(srcDir, "Install ChmodBPF.pkg")
	buildCmd := exec.Command("pkgbuild", "--root", pkgRoot, "--identifier", "com.example.mead-test.nested", "--version", "1.0", nestedPkgPath)
	if out, err := buildCmd.CombinedOutput(); err != nil {
		t.Fatalf("pkgbuild failed: %v\n%s", err, out)
	}

	dmgPath := filepath.Join(dir, "nested.dmg")
	createCmd := exec.Command("hdiutil", "create", "-size", "10m", "-fs", "HFS+", "-volname", "NestedVol", "-srcfolder", srcDir, dmgPath)
	if out, err := createCmd.CombinedOutput(); err != nil {
		t.Fatalf("hdiutil create failed: %v\n%s", err, out)
	}

	info := &PreInstallSecurityInfo{Container: ContainerDMG}
	inspectDownloadedDMG(context.Background(), dmgPath, info)

	if info.Unsupported {
		t.Fatalf("Unsupported = true (%q), want a real inspection result via the nested pkg", info.Note)
	}
	if info.Signed {
		t.Errorf("Signed = true, want false for an unsigned nested pkg")
	}
	if !strings.Contains(info.Assessment, "no signature") {
		t.Errorf("Assessment = %q, want it to mention \"no signature\" (pkgutil, not spctl, should have run)", info.Assessment)
	}
}

// TestApplyAppInspectionMissingApp covers applyAppInspection's error branch
// -- InspectAppSecurity failing because the path it's given doesn't
// actually exist.
func TestApplyAppInspectionMissingApp(t *testing.T) {
	info := &PreInstallSecurityInfo{}
	applyAppInspection(context.Background(), filepath.Join(t.TempDir(), "DoesNotExist.app"), info)

	if !info.Unsupported {
		t.Errorf("Unsupported = false, want true when the app path doesn't exist")
	}
	if info.Note == "" {
		t.Errorf("Note is empty, want InspectAppSecurity's error message")
	}
}
