package brew

// BrewPackage represents a Homebrew formula or cask, normalized for the frontend.
type BrewPackage struct {
	Name                  string   `json:"name"`
	FullName              string   `json:"fullName"`
	IsCask                bool     `json:"isCask"`
	Tap                   string   `json:"tap"`
	Desc                  string   `json:"desc"`
	Homepage              string   `json:"homepage"`
	License               string   `json:"license"`
	Version               string   `json:"version"`
	InstalledVersion      string   `json:"installedVersion"`
	Installed             bool     `json:"installed"`
	Outdated              bool     `json:"outdated"`
	Pinned                bool     `json:"pinned"`
	Deprecated            bool     `json:"deprecated"`
	Disabled              bool     `json:"disabled"`
	KegOnly               bool     `json:"kegOnly"`
	Caveats               string   `json:"caveats"`
	Dependencies          []string `json:"dependencies"`
	InstalledOnRequest    bool     `json:"installedOnRequest"`
	InstalledAsDependency bool     `json:"installedAsDependency"`
	AutoUpdates           bool     `json:"autoUpdates"`
	Artifacts             []string `json:"artifacts"`
	AppPaths              []string `json:"appPaths"`
	Linked                bool     `json:"linked"`
	ConflictsWith         []string `json:"conflictsWith"`
	ZapTrashPaths         []string `json:"zapTrashPaths"`
}

// SearchResult is a lightweight entry returned by `brew search`.
type SearchResult struct {
	Name   string `json:"name"`
	IsCask bool   `json:"isCask"`
}

// OutdatedPackage represents an entry from `brew outdated --json=v2`.
type OutdatedPackage struct {
	Name              string   `json:"name"`
	IsCask            bool     `json:"isCask"`
	InstalledVersions []string `json:"installedVersions"`
	CurrentVersion    string   `json:"currentVersion"`
	Pinned            bool     `json:"pinned"`
}

// Service represents an entry from `brew services list --json`.
type Service struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	User    string `json:"user"`
	File    string `json:"file"`
	Running bool   `json:"running"`
	PID     int    `json:"pid"`
}

// Tap represents an installed tap.
type Tap struct {
	Name string `json:"name"`
}

// TapDetail is the result of `brew tap-info --json`.
type TapDetail struct {
	Name         string `json:"name"`
	Installed    bool   `json:"installed"`
	Official     bool   `json:"official"`
	Remote       string `json:"remote"`
	FormulaCount int    `json:"formulaCount"`
	CaskCount    int    `json:"caskCount"`
	LastCommit   string `json:"lastCommit"`
}

// CacheInfo describes brew's download cache.
type CacheInfo struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"sizeBytes"`
	SizeHuman string `json:"sizeHuman"`
}

// SystemInfo is a snapshot of the local brew environment.
type SystemInfo struct {
	BrewPath        string `json:"brewPath"`
	BrewVersion     string `json:"brewVersion"`
	Prefix          string `json:"prefix"`
	Cellar          string `json:"cellar"`
	Caskroom        string `json:"caskroom"`
	InstalledForm   int    `json:"installedFormulaCount"`
	InstalledCask   int    `json:"installedCaskCount"`
	OutdatedCount   int    `json:"outdatedCount"`
	DeprecatedCount int    `json:"deprecatedCount"`
	DisabledCount   int    `json:"disabledCount"`
	PinnedCount     int    `json:"pinnedCount"`
}

// AdoptCandidate is an app in /Applications that looks like it matches an
// installable cask but isn't currently tracked by Homebrew.
type AdoptCandidate struct {
	AppName     string `json:"appName"`
	AppPath     string `json:"appPath"`
	CaskToken   string `json:"caskToken"`
	CaskDesc    string `json:"caskDesc"`
	CaskVersion string `json:"caskVersion"`
}

// DuplicateApp flags a name that shows up as both an installed formula and
// an installed cask, which usually means the same tool got installed twice.
type DuplicateApp struct {
	Name       string `json:"name"`
	FormulaVer string `json:"formulaVersion"`
	CaskVer    string `json:"caskVersion"`
}

// MasApp represents one row from `mas list` / `mas outdated`.
type MasApp struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	InstalledVersion string `json:"installedVersion"`
	LatestVersion    string `json:"latestVersion,omitempty"`
	Outdated         bool   `json:"outdated"`
}

// Collection is a curated bundle of packages a user can install together.
type Collection struct {
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Packages    []CollectionPackage `json:"packages"`
}

type CollectionPackage struct {
	Name   string `json:"name"`
	IsCask bool   `json:"isCask"`
}

// BundleCleanupItem is one entry from a `brew bundle cleanup` dry-run
// preview -- something installed that isn't listed in the Brewfile.
type BundleCleanupItem struct {
	Name   string `json:"name"`
	IsCask bool   `json:"isCask"`
}
