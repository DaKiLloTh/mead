package jobs

// StartEvent is emitted over the Wails event bus when a job begins.
type StartEvent struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// OutputEvent is emitted for each line of a job's combined stdout/stderr.
type OutputEvent struct {
	ID     string `json:"id"`
	Line   string `json:"line"`
	Stream string `json:"stream"` // "stdout" | "stderr"
}

// DoneEvent is emitted once when a job finishes (successfully or not).
type DoneEvent struct {
	ID       string `json:"id"`
	Success  bool   `json:"success"`
	ExitCode int    `json:"exitCode"`
	Error    string `json:"error,omitempty"`
}
