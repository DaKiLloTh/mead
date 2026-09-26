package security

// VulnSeverity is a normalized (lowercase) severity level for a
// Vulnerability. `brew vulns` reports critical/high/medium/low (upper-cased
// in its own text/JSON output, e.g. "MEDIUM") or "UNKNOWN" when it can't
// determine one; normalizeSeverity lower-cases and validates against this
// set so the frontend has one small, stable enum to badge against instead
// of whatever casing/spelling a given advisory source happens to use.
type VulnSeverity string

const (
	VulnSeverityCritical VulnSeverity = "critical"
	VulnSeverityHigh     VulnSeverity = "high"
	VulnSeverityMedium   VulnSeverity = "medium"
	VulnSeverityLow      VulnSeverity = "low"
	VulnSeverityUnknown  VulnSeverity = "unknown"
)

// Vulnerability is one advisory affecting a package. When scanned via
// `brew vulns` (see security.ScanVulnerabilities), every field is
// populated from its JSON output. On the OSV.dev direct-API fallback used
// when `brew vulns` isn't available (Homebrew < 7), only ID is known --
// OSV.dev's querybatch endpoint returns bare vulnerability IDs with no
// severity/summary/fixed-version detail, so the rest are left at their
// zero value rather than fabricated.
type Vulnerability struct {
	ID       string       `json:"id"`
	Severity VulnSeverity `json:"severity"`
	Summary  string       `json:"summary,omitempty"`
	// Aliases are other identifiers for the same advisory (e.g. a CVE ID
	// alongside the primary OSV/GHSA one).
	Aliases []string `json:"aliases"`
	// FixedVersions are upstream versions/commits that resolve this
	// vulnerability, if any are known.
	FixedVersions []string `json:"fixedVersions"`
}

// VulnResult is one package's outcome from a vulnerability scan --
// `brew vulns` when available, OSV.dev's direct API otherwise. See
// security.ScanVulnerabilities.
type VulnResult struct {
	Name    string `json:"name"`
	IsCask  bool   `json:"isCask"`
	Version string `json:"version"`
	// Open are vulnerabilities not resolved by anything -- what
	// "vulnerable" means for this package. Always a non-nil (possibly
	// empty) slice.
	Open []Vulnerability `json:"open"`
	// Patched are vulnerabilities the formula's own patch already
	// resolves. `brew vulns` calls these out separately instead of
	// silently dropping them or counting them as still-open (its own CLI
	// text output likewise reports them as "resolved by formula patches
	// (not counted)"); surfaced here so the UI can show an "already
	// patched" note rather than either treating them as open or hiding
	// them entirely. Always empty on the OSV.dev fallback, which has no
	// concept of this distinction. Always a non-nil (possibly empty)
	// slice.
	Patched []Vulnerability `json:"patched"`
	// Skipped is true when `brew vulns` itself excluded this package
	// (its own `skipped_formulae` list) rather than checking it -- in
	// practice a missing or unsupported source URL. Distinct from Error:
	// this isn't a failure, brew vulns just doesn't have enough
	// information to check this particular formula.
	Skipped bool `json:"skipped"`
	// Error is set when the scan itself couldn't be completed for this
	// package (network failure, unexpected command output, etc) -- an
	// operational failure, not "no vulnerabilities found".
	Error string `json:"error,omitempty"`
}

// SecurityInfo is a Gatekeeper / code-signing snapshot for an installed app.
type SecurityInfo struct {
	AppPath      string `json:"appPath"`
	Signed       bool   `json:"signed"`
	Authority    string `json:"authority"`
	TeamID       string `json:"teamId"`
	GatekeeperOK bool   `json:"gatekeeperOk"`
	Assessment   string `json:"assessment"`
	Quarantined  bool   `json:"quarantined"`
}

// ContainerKind identifies the kind of file Homebrew downloads for a cask's
// artifact -- the extension of whatever `brew fetch --cask` puts in its
// cache -- which determines how InspectCaskBeforeInstall extracts something
// codesign/spctl/pkgutil can actually assess. This is deliberately keyed
// off the downloaded file itself, not the cask's `artifact` stanza: some
// casks (e.g. homebrew/cask's wireshark-chmodbpf) declare a `pkg` artifact
// that actually ships nested inside a downloaded `.dmg`, so the artifact
// type alone would misroute the dispatch.
type ContainerKind string

const (
	ContainerDMG     ContainerKind = "dmg"
	ContainerPKG     ContainerKind = "pkg"
	ContainerZIP     ContainerKind = "zip"
	ContainerUnknown ContainerKind = "unknown"
)

// PreInstallSecurityInfo is a Gatekeeper / code-signing snapshot for a
// cask's downloaded-but-not-yet-installed artifact -- the pre-install
// counterpart to SecurityInfo, gathered by fetching the cask into
// Homebrew's own cache (nothing is installed, nothing touches
// /Applications) and inspecting that file directly, the same
// spctl/codesign/pkgutil checks SecurityInfo runs against an
// already-installed .app, just run one step earlier, before the user has
// committed to installing.
type PreInstallSecurityInfo struct {
	CaskToken         string        `json:"caskToken"`
	Container         ContainerKind `json:"container"`
	DownloadPath      string        `json:"downloadPath"`
	DownloadSizeBytes int64         `json:"downloadSizeBytes"`
	DownloadSizeHuman string        `json:"downloadSizeHuman"`
	Signed            bool          `json:"signed"`
	Authority         string        `json:"authority"`
	TeamID            string        `json:"teamId"`
	Notarized         bool          `json:"notarized"`
	GatekeeperOK      bool          `json:"gatekeeperOk"`
	Assessment        string        `json:"assessment"`
	// Unsupported is true when mead couldn't actually run an inspection --
	// an unrecognized container format, a mount/extraction failure, or
	// nothing inspectable found inside the container. When true, Note
	// explains why and Signed/Authority/TeamID/Notarized/GatekeeperOK are
	// just zero values, not a real "unsigned" finding.
	Unsupported bool   `json:"unsupported"`
	Note        string `json:"note,omitempty"`
}

// LeftoverKind categorizes which well-known ~/Library location a
// LeftoverItem was found in -- see leftovers.go for the exact paths.
type LeftoverKind string

const (
	LeftoverApplicationSupport LeftoverKind = "applicationSupport"
	LeftoverCaches             LeftoverKind = "caches"
	LeftoverPreferences        LeftoverKind = "preferences"
	LeftoverLogs               LeftoverKind = "logs"
	LeftoverSavedState         LeftoverKind = "savedState"
)

// LeftoverItem is one entry found under a well-known leftover location
// (Application Support, Caches, Preferences, Logs, or Saved Application
// State) that doesn't correspond to anything currently installed via
// Homebrew. It's a best-effort guess, shown to the user as a preview to
// manually review and select from -- never auto-deleted.
type LeftoverItem struct {
	Path      string       `json:"path"`
	Name      string       `json:"name"`
	Kind      LeftoverKind `json:"kind"`
	SizeBytes int64        `json:"sizeBytes"`
	SizeHuman string       `json:"sizeHuman"`
}
