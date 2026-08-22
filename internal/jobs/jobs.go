// Package jobs runs brew commands in the background and streams their
// output to the frontend over the Wails event bus.
package jobs

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"os/exec"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mead/internal/brew"
)

const (
	eventJobStart  = "job:start"
	eventJobOutput = "job:output"
	eventJobDone   = "job:done"
)

// Manager launches and tracks background brew commands.
type Manager struct {
	ctx context.Context
	mu  sync.Mutex
	cmd map[string]*exec.Cmd
}

// NewManager creates an empty job Manager. Call setContext once the Wails
// runtime context is available (see the app package's Startup hook).
func NewManager() *Manager {
	return &Manager{cmd: make(map[string]*exec.Cmd)}
}

func (jm *Manager) SetContext(ctx context.Context) {
	jm.ctx = ctx
}

func newJobID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// binaryTarget describes which local executable a job should run and what
// environment it should default to. Threading this through start() lets
// brew jobs and mas (Mac App Store CLI) jobs share the same launch/tracking
// machinery instead of start() hardcoding brew as it used to.
type binaryTarget struct {
	// resolve locates the binary's absolute path, or returns an error
	// explaining why it couldn't be found.
	resolve func() (string, error)
	// defaultEnv, if non-nil, supplies cmd.Env when the caller didn't pass
	// an explicit env. A nil defaultEnv leaves cmd.Env nil, i.e. the
	// subprocess simply inherits this process's environment.
	defaultEnv func() []string
}

var brewTarget = binaryTarget{resolve: brew.ResolveBrewPath, defaultEnv: brew.Env}

// masTarget runs the `mas` CLI (Mac App Store bridge) instead of brew. mas
// has no use for brew's HOMEBREW_* environment overrides, so it just
// inherits the parent process's environment, same as brew.RunCmd does for
// mas elsewhere.
var masTarget = binaryTarget{resolve: brew.ResolveMasPath, defaultEnv: nil}

// Fail immediately reports a job that never started (e.g. failed input
// validation) so the frontend's job-tracking UI behaves consistently.
func (jm *Manager) Fail(title, errMsg string) string {
	id := newJobID()
	runtime.EventsEmit(jm.ctx, eventJobStart, StartEvent{ID: id, Title: title})
	jm.failDone(id, nil, errMsg)
	return id
}

// failDone emits the job:done failure event for id and invokes onDone(false)
// if provided. It's the shared tail end of every path that reports a job as
// failed without it ever producing real subprocess output -- both Fail()
// above and every early-exit branch in start() below.
func (jm *Manager) failDone(id string, onDone func(success bool), errMsg string) {
	runtime.EventsEmit(jm.ctx, eventJobDone, DoneEvent{ID: id, Success: false, ExitCode: -1, Error: errMsg})
	if onDone != nil {
		onDone(false)
	}
}

// Start launches `brew <args...>` in the background, streaming its combined
// output to the frontend as job:output events, and returns the job id
// immediately so the caller (App method) can hand it back to JS.
func (jm *Manager) Start(title string, args ...string) string {
	return jm.start(brewTarget, title, false, nil, nil, args...)
}

// StartLenient behaves like Start, but a non-zero exit code is still
// reported as Success so the UI doesn't flag it as a failure (e.g. `brew
// doctor` exits 1 merely to signal it found something worth mentioning).
func (jm *Manager) StartLenient(title string, args ...string) string {
	return jm.start(brewTarget, title, true, nil, nil, args...)
}

// StartTracked behaves like Start, but additionally invokes onDone with the
// final success flag once the job finishes — used to record history entries
// without threading that concern through every call site.
func (jm *Manager) StartTracked(title string, onDone func(success bool), args ...string) string {
	return jm.start(brewTarget, title, false, nil, onDone, args...)
}

// StartWithEnv behaves like Start, but replaces the default brew.Env() with
// env -- used only by the explicit "Update Homebrew" action, which is the
// one place we actually want brew's auto-update behavior to run.
func (jm *Manager) StartWithEnv(title string, env []string, args ...string) string {
	return jm.start(brewTarget, title, false, env, nil, args...)
}

// StartMas behaves like Start, but launches the `mas` CLI (Mac App Store
// bridge) instead of brew -- used for App Store app upgrades, which brew
// itself has no knowledge of.
func (jm *Manager) StartMas(title string, args ...string) string {
	return jm.start(masTarget, title, false, nil, nil, args...)
}

func (jm *Manager) start(target binaryTarget, title string, lenient bool, env []string, onDone func(success bool), args ...string) string {
	id := newJobID()
	runtime.EventsEmit(jm.ctx, eventJobStart, StartEvent{ID: id, Title: title})

	path, err := target.resolve()
	if err != nil {
		jm.failDone(id, onDone, err.Error())
		return id
	}

	cmd := exec.Command(path, args...)
	if env != nil {
		cmd.Env = env
	} else if target.defaultEnv != nil {
		cmd.Env = target.defaultEnv()
	}
	cmd.Stdin = nil

	stdout, err1 := cmd.StdoutPipe()
	stderr, err2 := cmd.StderrPipe()

	if err1 != nil || err2 != nil {
		jm.failDone(id, onDone, "failed to create output pipes")
		return id
	}

	if err := cmd.Start(); err != nil {
		jm.failDone(id, onDone, err.Error())
		return id
	}

	jm.mu.Lock()
	jm.cmd[id] = cmd
	jm.mu.Unlock()

	var wg sync.WaitGroup
	wg.Add(2)
	go jm.pipe(&wg, id, "stdout", stdout)
	go jm.pipe(&wg, id, "stderr", stderr)

	go func() {
		wg.Wait()
		err := cmd.Wait()

		jm.mu.Lock()
		delete(jm.cmd, id)
		jm.mu.Unlock()

		done := DoneEvent{ID: id, Success: err == nil || lenient, ExitCode: cmd.ProcessState.ExitCode()}
		if err != nil && !lenient {
			done.Error = err.Error()
		}
		runtime.EventsEmit(jm.ctx, eventJobDone, done)
		if onDone != nil {
			onDone(done.Success)
		}
	}()

	return id
}

// scanLines splits on '\n' or '\r' so carriage-return-driven progress
// meters (brew's download progress, curl-style) render as successive
// lines instead of one huge buffered line.
func scanLines(data []byte, atEOF bool) (advance int, token []byte, err error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}
	for i, b := range data {
		if b == '\n' || b == '\r' {
			return i + 1, data[:i], nil
		}
	}
	if atEOF {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func (jm *Manager) pipe(wg *sync.WaitGroup, id, stream string, r io.Reader) {
	defer wg.Done()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	scanner.Split(scanLines)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		runtime.EventsEmit(jm.ctx, eventJobOutput, OutputEvent{ID: id, Line: line, Stream: stream})
	}
}

// Cancel terminates a running job, if any.
func (jm *Manager) Cancel(id string) bool {
	jm.mu.Lock()
	defer jm.mu.Unlock()
	cmd, ok := jm.cmd[id]
	if !ok || cmd.Process == nil {
		return false
	}
	_ = cmd.Process.Kill()
	return true
}
