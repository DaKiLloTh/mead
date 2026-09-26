package security

// VulnResult is one package's outcome from a best-effort OSV.dev scan.
type VulnResult struct {
	Name    string   `json:"name"`
	IsCask  bool     `json:"isCask"`
	Version string   `json:"version"`
	VulnIDs []string `json:"vulnIds"`
	Error   string   `json:"error,omitempty"`
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
