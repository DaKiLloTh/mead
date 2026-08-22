package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"os/exec"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	eventJobStart  = "job:start"
	eventJobOutput = "job:output"
	eventJobDone   = "job:done"
)

type JobManager struct {
	ctx context.Context
	mu  sync.Mutex
	cmd map[string]*exec.Cmd
}

func NewJobManager() *JobManager {
	return &JobManager{cmd: make(map[string]*exec.Cmd)}
}

func (jm *JobManager) setContext(ctx context.Context) {
	jm.ctx = ctx
}

func newJobID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Fail immediately reports a job that never started (e.g. failed input
// validation) so the frontend's job-tracking UI behaves consistently.
func (jm *JobManager) Fail(title, errMsg string) string {
	id := newJobID()
	runtime.EventsEmit(jm.ctx, eventJobStart, JobStartEvent{ID: id, Title: title})
	runtime.EventsEmit(jm.ctx, eventJobDone, JobDoneEvent{ID: id, Success: false, ExitCode: -1, Error: errMsg})
	return id
}

// Start launches `brew <args...>` in the background, streaming its combined
// output to the frontend as job:output events, and returns the job id
// immediately so the caller (App method) can hand it back to JS.
func (jm *JobManager) Start(title string, args ...string) string {
	return jm.start(title, false, nil, args...)
}

// StartLenient behaves like Start, but a non-zero exit code is still
// reported as Success so the UI doesn't flag it as a failure (e.g. `brew
// doctor` exits 1 merely to signal it found something worth mentioning).
func (jm *JobManager) StartLenient(title string, args ...string) string {
	return jm.start(title, true, nil, args...)
}

// StartTracked behaves like Start, but additionally invokes onDone with the
// final success flag once the job finishes — used to record history entries
// without threading that concern through every call site.
func (jm *JobManager) StartTracked(title string, onDone func(success bool), args ...string) string {
	return jm.start(title, false, onDone, args...)
}

func (jm *JobManager) start(title string, lenient bool, onDone func(success bool), args ...string) string {
	id := newJobID()

	path, err := resolveBrewPath()
	if err != nil {
		runtime.EventsEmit(jm.ctx, eventJobStart, JobStartEvent{ID: id, Title: title})
		runtime.EventsEmit(jm.ctx, eventJobDone, JobDoneEvent{ID: id, Success: false, ExitCode: -1, Error: err.Error()})
		if onDone != nil {
			onDone(false)
		}
		return id
	}

	cmd := exec.Command(path, args...)
	cmd.Env = brewEnv()
	cmd.Stdin = nil

	stdout, err1 := cmd.StdoutPipe()
	stderr, err2 := cmd.StderrPipe()

	runtime.EventsEmit(jm.ctx, eventJobStart, JobStartEvent{ID: id, Title: title})

	if err1 != nil || err2 != nil {
		errMsg := "failed to create output pipes"
		runtime.EventsEmit(jm.ctx, eventJobDone, JobDoneEvent{ID: id, Success: false, ExitCode: -1, Error: errMsg})
		if onDone != nil {
			onDone(false)
		}
		return id
	}

	if err := cmd.Start(); err != nil {
		runtime.EventsEmit(jm.ctx, eventJobDone, JobDoneEvent{ID: id, Success: false, ExitCode: -1, Error: err.Error()})
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

		done := JobDoneEvent{ID: id, Success: err == nil || lenient, ExitCode: cmd.ProcessState.ExitCode()}
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

func (jm *JobManager) pipe(wg *sync.WaitGroup, id, stream string, r io.Reader) {
	defer wg.Done()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	scanner.Split(scanLines)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		runtime.EventsEmit(jm.ctx, eventJobOutput, JobOutputEvent{ID: id, Line: line, Stream: stream})
	}
}

// Cancel terminates a running job, if any.
func (jm *JobManager) Cancel(id string) bool {
	jm.mu.Lock()
	defer jm.mu.Unlock()
	cmd, ok := jm.cmd[id]
	if !ok || cmd.Process == nil {
		return false
	}
	_ = cmd.Process.Kill()
	return true
}
