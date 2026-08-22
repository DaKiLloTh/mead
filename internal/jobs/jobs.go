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

// Fail immediately reports a job that never started (e.g. failed input
// validation) so the frontend's job-tracking UI behaves consistently.
func (jm *Manager) Fail(title, errMsg string) string {
	id := newJobID()
	runtime.EventsEmit(jm.ctx, eventJobStart, StartEvent{ID: id, Title: title})
	runtime.EventsEmit(jm.ctx, eventJobDone, DoneEvent{ID: id, Success: false, ExitCode: -1, Error: errMsg})
	return id
}

// Start launches `brew <args...>` in the background, streaming its combined
// output to the frontend as job:output events, and returns the job id
// immediately so the caller (App method) can hand it back to JS.
func (jm *Manager) Start(title string, args ...string) string {
	return jm.start(title, false, nil, nil, args...)
}

// StartLenient behaves like Start, but a non-zero exit code is still
// reported as Success so the UI doesn't flag it as a failure (e.g. `brew
// doctor` exits 1 merely to signal it found something worth mentioning).
func (jm *Manager) StartLenient(title string, args ...string) string {
	return jm.start(title, true, nil, nil, args...)
}

// StartTracked behaves like Start, but additionally invokes onDone with the
// final success flag once the job finishes — used to record history entries
// without threading that concern through every call site.
func (jm *Manager) StartTracked(title string, onDone func(success bool), args ...string) string {
	return jm.start(title, false, nil, onDone, args...)
}

// StartWithEnv behaves like Start, but replaces the default brew.Env() with
// env -- used only by the explicit "Update Homebrew" action, which is the
// one place we actually want brew's auto-update behavior to run.
func (jm *Manager) StartWithEnv(title string, env []string, args ...string) string {
	return jm.start(title, false, env, nil, args...)
}

func (jm *Manager) start(title string, lenient bool, env []string, onDone func(success bool), args ...string) string {
	id := newJobID()

	path, err := brew.ResolveBrewPath()
	if err != nil {
		runtime.EventsEmit(jm.ctx, eventJobStart, StartEvent{ID: id, Title: title})
		runtime.EventsEmit(jm.ctx, eventJobDone, DoneEvent{ID: id, Success: false, ExitCode: -1, Error: err.Error()})
		if onDone != nil {
			onDone(false)
		}
		return id
	}

	cmd := exec.Command(path, args...)
	if env != nil {
		cmd.Env = env
	} else {
		cmd.Env = brew.Env()
	}
	cmd.Stdin = nil

	stdout, err1 := cmd.StdoutPipe()
	stderr, err2 := cmd.StderrPipe()

	runtime.EventsEmit(jm.ctx, eventJobStart, StartEvent{ID: id, Title: title})

	if err1 != nil || err2 != nil {
		errMsg := "failed to create output pipes"
		runtime.EventsEmit(jm.ctx, eventJobDone, DoneEvent{ID: id, Success: false, ExitCode: -1, Error: errMsg})
		if onDone != nil {
			onDone(false)
		}
		return id
	}

	if err := cmd.Start(); err != nil {
		runtime.EventsEmit(jm.ctx, eventJobDone, DoneEvent{ID: id, Success: false, ExitCode: -1, Error: err.Error()})
		if onDone != nil {
			onDone(false)
		}
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
