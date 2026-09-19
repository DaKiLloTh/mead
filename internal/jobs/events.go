package jobs

// StartEvent is emitted over the Wails event bus when a job begins.
type StartEvent struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	// Quiet marks a job the frontend should not treat as a foreground
	// interruption: it should not auto-open the job console or pop a
	// completion toast for it. The job still appears in the job list like
	// any other job, so it's visible if the user opens the console
	// themselves. Used by the periodic background `brew update` (see
	// jobs.Manager.StartQuietWithEnv and App.UpdateQuiet).
	Quiet bool `json:"quiet,omitempty"`
	// Interactive marks a job that's attached to a real pty and can
	// therefore accept input via App.SendJobInput -- currently only mas
	// upgrade jobs (see jobs.Manager.StartMas), which may need to answer a
	// sudo password prompt partway through. Lets the frontend show an input
	// box for this job without needing to guess from its output text.
	Interactive bool `json:"interactive,omitempty"`
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
