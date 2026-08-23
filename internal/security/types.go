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
