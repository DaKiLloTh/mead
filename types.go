package main

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

// CacheInfo describes brew's download cache.
type CacheInfo struct {
	Path      string `json:"path"`
	SizeBytes int64  `json:"sizeBytes"`
	SizeHuman string `json:"sizeHuman"`
}

// SystemInfo is a snapshot of the local brew environment.
type SystemInfo struct {
	BrewPath      string `json:"brewPath"`
	BrewVersion   string `json:"brewVersion"`
	Prefix        string `json:"prefix"`
	Cellar        string `json:"cellar"`
	Caskroom      string `json:"caskroom"`
	InstalledForm int    `json:"installedFormulaCount"`
	InstalledCask int    `json:"installedCaskCount"`
	OutdatedCount int    `json:"outdatedCount"`
}

// JobEvent payloads emitted over the Wails event bus.
type JobStartEvent struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type JobOutputEvent struct {
	ID     string `json:"id"`
	Line   string `json:"line"`
	Stream string `json:"stream"` // "stdout" | "stderr"
}

type JobDoneEvent struct {
	ID       string `json:"id"`
	Success  bool   `json:"success"`
	ExitCode int    `json:"exitCode"`
	Error    string `json:"error,omitempty"`
}
