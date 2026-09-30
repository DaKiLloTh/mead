package security

// ---- Pre-install cask inspection (issue #50) ----
//
// InspectAppSecurity above answers "is this already-installed app signed
// and notarized?" by looking at the .app on disk. This file answers the
// same question one step earlier, before the user has committed to
// installing: it fetches the cask's artifact into Homebrew's own cache via
// brew.FetchCask -- nothing is installed, nothing touches /Applications --
// and runs the same codesign/spctl checks (or pkgutil, for a .pkg
// installer) directly against the downloaded file.
//
// This is deliberately not wired up to run automatically (e.g. on Security
// tab open, the way InspectCaskSecurity is for an installed cask):
// brew.FetchCask downloads exactly what `brew install --cask` would -- for
// some casks, hundreds of megabytes -- so App.InspectCaskBeforeInstall
// should only ever be invoked from an explicit user action with an upfront
// size warning. See internal/brew/fetch.go's doc comment and issue #50's
// research comment for why there's no cheaper pre-download probe in
// Homebrew's model.

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"mead/internal/brew"
	"mead/internal/system"
)

// InspectCaskBeforeInstall fetches pkg's artifact (pkg is assumed to
// already be a cask -- isCask semantics live in the caller, same as
// InspectCaskSecurity) and inspects it for Gatekeeper/code-signing status.
func InspectCaskBeforeInstall(ctx context.Context, pkg *brew.BrewPackage) (*PreInstallSecurityInfo, error) {
	path, err := brew.FetchCask(ctx, pkg.FullName)
	if err != nil {
		return nil, err
	}
	return inspectDownloadedCask(ctx, pkg.FullName, path), nil
}

// inspectDownloadedCask is InspectCaskBeforeInstall's testable core: given a
// cask token and a path to its already-downloaded artifact (network I/O
// already done by the caller), it classifies the container and dispatches
// to the matching inspector. Split out so the dispatch logic itself --
// including its default "unsupported" branch -- can be exercised against a
// real local file in tests without needing brew.FetchCask's network access.
func inspectDownloadedCask(ctx context.Context, caskToken, path string) *PreInstallSecurityInfo {
	info := &PreInstallSecurityInfo{
		CaskToken:    caskToken,
		DownloadPath: path,
		Container:    containerKindForPath(path),
	}
	if st, statErr := os.Stat(path); statErr == nil {
		info.DownloadSizeBytes = st.Size()
		info.DownloadSizeHuman = humanBytes(st.Size())
	}

	switch info.Container {
	case ContainerPKG:
		inspectDownloadedPkg(ctx, path, info)
	case ContainerDMG:
		inspectDownloadedDMG(ctx, path, info)
	case ContainerZIP:
		inspectDownloadedZip(ctx, path, info)
	default:
		info.Unsupported = true
		info.Note = "mead doesn't know how to inspect this download's file type yet"
	}
	return info
}

// containerKindForPath classifies a downloaded cask artifact by its file
// extension -- the small set of container formats Homebrew cask downloads
// actually come in. Anything else (a raw binary, a tar.xz/tbz2 source
// archive, ...) is ContainerUnknown so the caller can say "not supported
// yet" rather than guessing at how to open it.
func containerKindForPath(path string) ContainerKind {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".dmg":
		return ContainerDMG
	case ".pkg", ".mpkg":
		return ContainerPKG
	case ".zip":
		return ContainerZIP
	default:
		return ContainerUnknown
	}
}

// pickInspectableEntry chooses which top-level entry of a mounted disk
// image or extracted archive to inspect: the first .app if there is one --
// that's what Gatekeeper actually assesses at launch -- otherwise the first
// .pkg (Homebrew's nested_container pattern: some casks declare a `pkg`
// artifact that's actually shipped inside a downloaded .dmg, e.g.
// wireshark-chmodbpf, confirmed against its real `brew info --json=v2`
// output while researching issue #50), otherwise neither. Pure and
// separately testable from the directory listing below.
func pickInspectableEntry(names []string) (appName, pkgName string) {
	for _, n := range names {
		if strings.HasSuffix(n, ".app") {
			return n, ""
		}
	}
	for _, n := range names {
		if strings.HasSuffix(strings.ToLower(n), ".pkg") {
			return "", n
		}
	}
	return "", ""
}

// findInspectable lists dir's top-level entries and applies
// pickInspectableEntry, returning an absolute path to whichever it found.
func findInspectable(dir string) (appPath, pkgPath string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return "", ""
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	appName, pkgName := pickInspectableEntry(names)
	if appName != "" {
		return filepath.Join(dir, appName), ""
	}
	if pkgName != "" {
		return "", filepath.Join(dir, pkgName)
	}
	return "", ""
}

// applyAppInspection runs InspectAppSecurity against an .app found inside a
// mounted dmg or extracted zip and copies its findings into info.
func applyAppInspection(ctx context.Context, appPath string, info *PreInstallSecurityInfo) {
	appInfo, err := InspectAppSecurity(ctx, appPath)
	if err != nil {
		info.Unsupported = true
		info.Note = err.Error()
		return
	}
	info.Signed = appInfo.Signed
	info.Authority = appInfo.Authority
	info.TeamID = appInfo.TeamID
	info.GatekeeperOK = appInfo.GatekeeperOK
	info.Assessment = appInfo.Assessment
	info.Notarized = notarizedFromAssessment(appInfo.Assessment)
}

// notarizedFromAssessment reports whether a `spctl --assess` transcript
// (SecurityInfo.Assessment / PreInstallSecurityInfo.Assessment) shows
// Apple's notary service vouching for the app -- the "source=Notarized
// Developer ID" line spctl prints for a stapled, notarized app. Verified
// against real spctl output for a notarized cask (keka) while researching
// issue #50.
func notarizedFromAssessment(assessment string) bool {
	return strings.Contains(assessment, "source=Notarized Developer ID")
}

// inspectDownloadedDMG mounts a downloaded disk image read-only into a
// throwaway temp directory, finds something inspectable inside it, and
// always unmounts and removes the temp directory afterward -- including
// when the mount itself fails, so a failed attempt never leaves a mounted
// volume or an empty temp dir behind.
func inspectDownloadedDMG(ctx context.Context, path string, info *PreInstallSecurityInfo) {
	mountDir, err := os.MkdirTemp("", "mead-cask-verify-")
	if err != nil {
		info.Unsupported = true
		info.Note = "couldn't create a temporary mount point: " + err.Error()
		return
	}
	defer func() { _ = os.RemoveAll(mountDir) }()

	if out, err := system.RunCmd(ctx, "hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mountDir, path); err != nil {
		info.Unsupported = true
		info.Note = "couldn't mount the downloaded disk image: " + strings.TrimSpace(out)
		return
	}
	defer func() { _, _ = system.RunCmd(ctx, "hdiutil", "detach", mountDir) }()

	appPath, pkgPath := findInspectable(mountDir)
	switch {
	case appPath != "":
		applyAppInspection(ctx, appPath, info)
	case pkgPath != "":
		inspectDownloadedPkg(ctx, pkgPath, info)
	default:
		info.Unsupported = true
		info.Note = "couldn't find an app or installer package inside the disk image"
	}
}

// inspectDownloadedZip extracts a downloaded archive into a throwaway temp
// directory (via `ditto`, which preserves the code signature -- unlike
// `unzip`, whose re-extraction can invalidate it) and finds something
// inspectable inside it, always removing the temp directory afterward.
func inspectDownloadedZip(ctx context.Context, path string, info *PreInstallSecurityInfo) {
	extractDir, err := os.MkdirTemp("", "mead-cask-verify-")
	if err != nil {
		info.Unsupported = true
		info.Note = "couldn't create a temporary extraction directory: " + err.Error()
		return
	}
	defer func() { _ = os.RemoveAll(extractDir) }()

	if out, err := system.RunCmd(ctx, "ditto", "-x", "-k", path, extractDir); err != nil {
		info.Unsupported = true
		info.Note = "couldn't extract the downloaded archive: " + strings.TrimSpace(out)
		return
	}

	appPath, pkgPath := findInspectable(extractDir)
	switch {
	case appPath != "":
		applyAppInspection(ctx, appPath, info)
	case pkgPath != "":
		inspectDownloadedPkg(ctx, pkgPath, info)
	default:
		info.Unsupported = true
		info.Note = "couldn't find an app or installer package inside the archive"
	}
}

var pkgutilStatusRe = regexp.MustCompile(`(?m)^\s*Status:\s*(.+)$`)
var pkgutilNotarizationRe = regexp.MustCompile(`(?m)^\s*Notarization:\s*(.+)$`)
var pkgutilFirstCertRe = regexp.MustCompile(`(?m)^\s*1\.\s+(.+)$`)
var pkgutilTeamIDRe = regexp.MustCompile(`\(([A-Z0-9]{10})\)\s*$`)

// parsePkgutilCheckSignature extracts the human-readable status and
// notarization lines from `pkgutil --check-signature`'s output, plus
// whether the package is signed at all -- its Status line reads "no
// signature" verbatim when it isn't (verified against a real unsigned pkg
// built locally with pkgbuild while researching issue #50; see
// precheck_test.go for both real captured transcripts).
func parsePkgutilCheckSignature(output string) (status string, signed bool, notarized bool) {
	status = strings.TrimSpace(output)
	if m := pkgutilStatusRe.FindStringSubmatch(output); m != nil {
		status = strings.TrimSpace(m[1])
	}
	signed = status != "" && !strings.EqualFold(status, "no signature")
	if m := pkgutilNotarizationRe.FindStringSubmatch(output); m != nil {
		notarized = strings.Contains(strings.ToLower(m[1]), "trusted")
	}
	return status, signed, notarized
}

// parsePkgutilCertificate extracts the first (leaf) certificate in
// `pkgutil --check-signature`'s printed chain and the team identifier
// embedded in its name, mirroring the Authority/TeamID fields
// InspectAppSecurity extracts from codesign's output for an installed app.
func parsePkgutilCertificate(output string) (authority, teamID string) {
	m := pkgutilFirstCertRe.FindStringSubmatch(output)
	if m == nil {
		return "", ""
	}
	authority = strings.TrimSpace(m[1])
	if tm := pkgutilTeamIDRe.FindStringSubmatch(authority); tm != nil {
		teamID = tm[1]
	}
	return authority, teamID
}

// inspectDownloadedPkg runs `pkgutil --check-signature` directly against a
// downloaded .pkg installer -- no mount/extraction needed, unlike a .dmg or
// .zip.
func inspectDownloadedPkg(ctx context.Context, path string, info *PreInstallSecurityInfo) {
	out, err := system.RunCmd(ctx, "pkgutil", "--check-signature", path)
	info.Assessment = strings.TrimSpace(out)
	info.GatekeeperOK = err == nil
	_, signed, notarized := parsePkgutilCheckSignature(out)
	info.Signed = signed
	info.Notarized = notarized
	info.Authority, info.TeamID = parsePkgutilCertificate(out)
}
