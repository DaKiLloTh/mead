// Package jobs runs brew commands in the background and streams their
// output to the frontend over the Wails event bus.
package jobs

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"syscall"

	"github.com/creack/pty"
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
	// ptyIn holds the write side of a running interactive (pty-backed) job's
	// terminal, keyed by job id -- see StartMas/SendInput. Only jobs started
	// with a pty have an entry here; a plain Start/StartTracked job never
	// does, since SendInput on those wouldn't reach anything (no process is
	// reading from a terminal it doesn't have).
	ptyIn map[string]*os.File

	// emit sends an event to the frontend. A field (defaulting to the Wails
	// event bus) so tests can record events without a real Wails runtime.
	emit func(name string, data ...any)
	// masPath locates the mas binary. A field (defaulting to
	// brew.ResolveMasPath) so tests can point it at a fake.
	masPath func() (string, error)
	// brewPath and osascriptPath locate brew and osascript for the
	// elevated-uninstall flow (see StartElevatedUninstall). Fields so tests
	// can point them at fake scripts instead of a real brew and a real
	// authorization dialog.
	brewPath      func() (string, error)
	osascriptPath func() (string, error)
}

// NewManager creates an empty job Manager. Call setContext once the Wails
// runtime context is available (see the app package's Startup hook).
func NewManager() *Manager {
	jm := &Manager{
		cmd:           make(map[string]*exec.Cmd),
		ptyIn:         make(map[string]*os.File),
		masPath:       brew.ResolveMasPath,
		brewPath:      brew.ResolveBrewPath,
		osascriptPath: resolveOsascript,
	}
	jm.emit = func(name string, data ...any) { runtime.EventsEmit(jm.ctx, name, data...) }
	return jm
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

// Fail immediately reports a job that never started (e.g. failed input
// validation) so the frontend's job-tracking UI behaves consistently.
func (jm *Manager) Fail(title, errMsg string) string {
	id := newJobID()
	jm.emit(eventJobStart, StartEvent{ID: id, Title: title})
	jm.failDone(id, nil, errMsg)
	return id
}

// failDone emits the job:done failure event for id and invokes onDone(false)
// if provided. It's the shared tail end of every path that reports a job as
// failed without it ever producing real subprocess output -- both Fail()
// above and every early-exit branch in start() below.
func (jm *Manager) failDone(id string, onDone func(success bool), errMsg string) {
	jm.emit(eventJobDone, DoneEvent{ID: id, Success: false, ExitCode: -1, Error: errMsg})
	if onDone != nil {
		onDone(false)
	}
}

// Start launches `brew <args...>` in the background, streaming its combined
// output to the frontend as job:output events, and returns the job id
// immediately so the caller (App method) can hand it back to JS.
func (jm *Manager) Start(title string, args ...string) string {
	return jm.start(brewTarget, title, false, false, nil, nil, args...)
}

// StartLenient behaves like Start, but a non-zero exit code is still
// reported as Success so the UI doesn't flag it as a failure (e.g. `brew
// doctor` exits 1 merely to signal it found something worth mentioning).
func (jm *Manager) StartLenient(title string, args ...string) string {
	return jm.start(brewTarget, title, true, false, nil, nil, args...)
}

// StartTracked behaves like Start, but additionally invokes onDone with the
// final success flag once the job finishes — used to record history entries
// without threading that concern through every call site.
func (jm *Manager) StartTracked(title string, onDone func(success bool), args ...string) string {
	return jm.start(brewTarget, title, false, false, nil, onDone, args...)
}

// StartWithEnv behaves like Start, but replaces the default brew.Env() with
// env -- used only by the explicit "Update Homebrew" action, which is the
// one place we actually want brew's auto-update behavior to run.
func (jm *Manager) StartWithEnv(title string, env []string, args ...string) string {
	return jm.start(brewTarget, title, false, false, env, nil, args...)
}

// StartQuietWithEnv behaves like StartWithEnv, but marks the job "quiet" in
// its job:start event (see StartEvent.Quiet), telling the frontend not to
// auto-open the job console or pop a completion toast for it -- used by the
// periodic background `brew update` (see App.UpdateQuiet), which should
// stay unobtrusive rather than interrupting the user's session every time it
// fires. It still runs through the normal job machinery, so it's visible in
// job history if the user opens the console themselves.
func (jm *Manager) StartQuietWithEnv(title string, env []string, args ...string) string {
	return jm.start(brewTarget, title, false, true, env, nil, args...)
}

// StartMas behaves like Start, but launches the `mas` CLI (Mac App Store
// bridge) instead of brew, with a pseudo-terminal as its *controlling
// terminal* -- used for App Store app upgrades, which brew itself has no
// knowledge of.
//
// Why: for apps delivered as an installer package (Xcode), mas downloads
// unprivileged and then runs `sudo /usr/sbin/installer ...` and a second
// `sudo /bin/sh -c ...` itself (mas-cli/mas, AppStoreAction.swift install()),
// with no -A/-S flag. sudo reads its password from /dev/tty, so with no
// controlling terminal it fails outright ("a terminal is required to read
// the password"). Earlier attempts that didn't work: wrapping the whole mas
// process in `osascript ... with administrator privileges` (mas then runs as
// root with no SUDO_UID for its own dropRoot(), "Failed to get sudo uid"),
// and setting SUDO_ASKPASS (Apple's sudo ignored it).
//
// The pty is attached to stdin only (Setctty on fd 0). stdout and stderr stay
// plain pipes on purpose: mas draws a `#####---- 12%` progress bar with
// cursor-clearing escape codes whenever its stdout is a terminal, which would
// flood the job console. sudo's prompt still reaches us because it's written
// to /dev/tty, i.e. the pty. That means a password can be typed back (see
// SendInput), and if sudo is configured for Touch ID (pam_tid, see
// internal/system/touchid.go) the fingerprint sheet appears with no typing.
func (jm *Manager) StartMas(title string, args ...string) string {
	id := newJobID()
	jm.emit(eventJobStart, StartEvent{ID: id, Title: title, Interactive: true})

	masPath, err := jm.masPath()
	if err != nil {
		jm.failDone(id, nil, err.Error())
		return id
	}

	ptmx, tty, err := pty.Open()
	if err != nil {
		jm.failDone(id, nil, err.Error())
		return id
	}

	cmd := exec.Command(masPath, args...)
	cmd.Stdin = tty
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true, Setctty: true, Ctty: 0}
	stdout, err1 := cmd.StdoutPipe()
	stderr, err2 := cmd.StderrPipe()
	if err1 != nil || err2 != nil {
		_ = ptmx.Close()
		_ = tty.Close()
		jm.failDone(id, nil, "failed to create output pipes")
		return id
	}

	if err := cmd.Start(); err != nil {
		_ = ptmx.Close()
		_ = tty.Close()
		jm.failDone(id, nil, err.Error())
		return id
	}
	// The child has its own copy of the slave side now; keeping ours open
	// would stop the master from ever seeing EOF when the child exits.
	_ = tty.Close()

	jm.mu.Lock()
	jm.cmd[id] = cmd
	jm.ptyIn[id] = ptmx
	jm.mu.Unlock()

	var pipes sync.WaitGroup
	pipes.Add(2)
	go jm.pipe(&pipes, id, "stdout", stdout)
	go jm.pipe(&pipes, id, "stderr", stderr)

	var ptyDone sync.WaitGroup
	ptyDone.Add(1)
	go jm.pipePTY(&ptyDone, id, ptmx)

	go func() {
		pipes.Wait()
		err := cmd.Wait()
		// Closing the master unblocks pipePTY's Read once the child is gone.
		_ = ptmx.Close()
		ptyDone.Wait()

		jm.mu.Lock()
		delete(jm.cmd, id)
		delete(jm.ptyIn, id)
		jm.mu.Unlock()

		done := DoneEvent{ID: id, Success: err == nil, ExitCode: cmd.ProcessState.ExitCode()}
		if err != nil {
			done.Error = err.Error()
		}
		jm.emit(eventJobDone, done)
	}()

	return id
}

// pipePTY streams a pty-backed job's combined output the same way pipe does
// for a plain job, but reads and emits whatever's available on every Read
// rather than waiting for a newline. This matters specifically for a
// password prompt like sudo's "Password:", which is written with no
// trailing newline at all -- a newline-scanning reader (like pipe/scanLines
// below) would sit there waiting for a delimiter that never arrives until
// after the user has already typed something, so the prompt itself would
// never reach the frontend for the user to see and respond to.
func (jm *Manager) pipePTY(wg *sync.WaitGroup, id string, r io.Reader) {
	defer wg.Done()
	buf := make([]byte, 4096)
	for {
		n, err := r.Read(buf)
		if n > 0 {
			for _, line := range splitPTYChunk(buf[:n]) {
				jm.emit(eventJobOutput, OutputEvent{ID: id, Line: line, Stream: "stdout"})
			}
		}
		if err != nil {
			return
		}
	}
}

// ansiEscapeRe matches CSI escape sequences (colors, cursor movement,
// clear-line) that a program writing to a terminal may emit; they mean
// nothing in the job console's plain-text lines.
var ansiEscapeRe = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)

// splitPTYChunk splits one raw Read() of pty output into the individual
// lines it contains. Unlike scanLines above (used for plain pipe-based
// jobs), a trailing fragment with no newline is still returned as a line of
// its own rather than withheld -- necessary for a prompt like sudo's
// "Password:", which is written with no trailing newline at all. A
// newline-only reader would sit waiting for a delimiter that never arrives
// until after the user has already typed something, so the prompt itself
// would never reach the frontend for them to see and respond to.
func splitPTYChunk(chunk []byte) []string {
	text := strings.TrimRight(ansiEscapeRe.ReplaceAllString(string(chunk), ""), "\r\n")
	if text == "" {
		return nil
	}
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.Trim(line, "\r")
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

// SendInput writes text (plus a trailing newline, as if the user pressed
// Return) to a running interactive (pty-backed) job's terminal -- the only
// way to answer a prompt like sudo's, since that job has no other stdin.
// Returns false if id doesn't name a currently-running interactive job.
func (jm *Manager) SendInput(id string, text string) bool {
	jm.mu.Lock()
	w, ok := jm.ptyIn[id]
	jm.mu.Unlock()
	if !ok {
		return false
	}
	_, err := w.Write([]byte(text + "\n"))
	return err == nil
}

// resolveOsascript finds the osascript binary the elevated-uninstall flow
// hands its authorization script to.
func resolveOsascript() (string, error) {
	p, err := exec.LookPath("osascript")
	if err != nil {
		return "", errors.New("could not find the `osascript` executable on this system")
	}
	return p, nil
}

func (jm *Manager) start(target binaryTarget, title string, lenient bool, quiet bool, env []string, onDone func(success bool), args ...string) string {
	id := newJobID()
	jm.emit(eventJobStart, StartEvent{ID: id, Title: title, Quiet: quiet})

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
		jm.emit(eventJobDone, done)
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
	jm.pipeCapturing(wg, id, stream, r, nil)
}

// pipeCapturing is pipe, plus appending every line to capture when it is not
// nil, for a job phase whose output the caller needs to inspect afterwards
// (see runPhase). The lines are still streamed to the frontend as usual.
func (jm *Manager) pipeCapturing(wg *sync.WaitGroup, id, stream string, r io.Reader, capture *lineCapture) {
	defer wg.Done()
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	scanner.Split(scanLines)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if capture != nil {
			capture.add(line)
		}
		jm.emit(eventJobOutput, OutputEvent{ID: id, Line: line, Stream: stream})
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
