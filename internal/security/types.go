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
