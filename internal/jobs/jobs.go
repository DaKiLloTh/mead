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
	"os/exec"
	"regexp"
	"strings"
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
// bridge) instead of brew -- used for App Store app upgrades, which brew
// itself has no knowledge of.
func (jm *Manager) StartMas(title string, args ...string) string {
	return jm.start(masTarget, title, false, false, nil, nil, args...)
}

// osascriptTarget runs `osascript` for runElevatedRemove below. It has no
// use for brew's HOMEBREW_* overrides (those are embedded directly in the
// shell command text BuildElevatedShellScript builds, since the elevated
// shell doesn't inherit this process's environment), so, like masTarget, it
// leaves defaultEnv nil.
var osascriptTarget = binaryTarget{
	resolve: func() (string, error) {
		p, err := exec.LookPath("osascript")
		if err != nil {
			return "", errors.New("could not find the `osascript` executable on this system")
		}
		return p, nil
	},
}

// sudoOwnershipPathRe matches the literal line Homebrew's cask uninstall
// prints when a removal step needs root to take ownership of a path outside
// Homebrew's own prefix -- Cask::Utils.gain_permissions in
// Library/Homebrew/cask/utils.rb: `ohai "Using sudo to gain ownership of
// path '#{path}'"`. This is how runElevatedUninstall finds out which
// specific path(s) to elevate, rather than guessing.
var sudoOwnershipPathRe = regexp.MustCompile(`Using sudo to gain ownership of path '([^']+)'`)

// StartElevatedUninstall runs a cask/formula uninstall that needs root to
// remove one or more paths outside Homebrew's own prefix (e.g. a JDK's
// Generic Artifact under /Library/Java/JavaVirtualMachines) -- offered by
// the frontend only as an explicit retry after a plain uninstall has
// already failed with sudo's "a terminal is required"/"a password is
// required" errors.
//
// This does NOT wrap the whole `brew uninstall` invocation in `do shell
// script ... with administrator privileges` the way this used to (see
// issue #101) -- that runs brew itself as root, and Homebrew's own brew.sh
// unconditionally refuses to run any command outside a small allowlist
// (`as-console-user`, `setup-sandbox`, `services`, `--prefix`) as root:
// "Running Homebrew as root is extremely dangerous and no longer
// supported." `uninstall` isn't on that list, so the old approach failed
// that check immediately after a successful Touch-ID/password prompt --
// exactly the "prompt succeeds, retry still fails" symptom #101 reported.
// Confirmed by reading Homebrew's own brew.sh (check-run-command-as-root)
// and cask/utils.rb (gain_permissions*) rather than guessing.
//
// Instead: run the uninstall normally first (never running brew itself as
// root); if it fails, scan its output for the specific path(s) Homebrew
// says it needs sudo to remove; elevate only removing those paths
// directly, via one `do shell script ... with administrator privileges`
// prompt covering all of them; then re-run the uninstall normally once
// more, which should now succeed since whatever was blocking it is gone.
// If the first failure isn't this specific "needs sudo for an out-of-prefix
// path" shape, there's nothing more this can safely try, so the real error
// is reported rather than looping.
func (jm *Manager) StartElevatedUninstall(title string, onDone func(success bool), uninstallArgs []string) string {
	id := newJobID()
	runtime.EventsEmit(jm.ctx, eventJobStart, StartEvent{ID: id, Title: title})
	go jm.runElevatedUninstall(id, onDone, uninstallArgs)
	return id
}

func (jm *Manager) runElevatedUninstall(id string, onDone func(success bool), uninstallArgs []string) {
	brewPath, err := brew.ResolveBrewPath()
	if err != nil {
		jm.failDone(id, onDone, err.Error())
		return
	}

	out, runErr := jm.runPhase(id, brewPath, brew.Env(), uninstallArgs...)
	if runErr == nil {
		jm.succeedDone(id, onDone)
		return
	}

	paths := sudoOwnershipPaths(out)
	if len(paths) == 0 {
		// Not the failure shape this path exists to handle -- report the
		// real error instead of pretending there's a fix to retry.
		jm.failDone(id, onDone, runErr.Error())
		return
	}

	if err := jm.runElevatedRemove(id, paths); err != nil {
		jm.failDone(id, onDone, err.Error())
		return
	}

	if _, retryErr := jm.runPhase(id, brewPath, brew.Env(), uninstallArgs...); retryErr != nil {
		jm.failDone(id, onDone, retryErr.Error())
		return
	}
	jm.succeedDone(id, onDone)
}

// sudoOwnershipPaths returns the deduplicated, order-preserved set of paths
// sudoOwnershipPathRe finds across every line of a job phase's output.
func sudoOwnershipPaths(output string) []string {
	matches := sudoOwnershipPathRe.FindAllStringSubmatch(output, -1)
	seen := map[string]bool{}
	var paths []string
	for _, m := range matches {
		if p := m[1]; !seen[p] {
			seen[p] = true
			paths = append(paths, p)
		}
	}
	return paths
}

// runElevatedRemove removes every path in paths as root, via a single
// `do shell script ... with administrator privileges` prompt -- one
// Touch-ID/password prompt covering all of them, rather than one per path.
// Each path is `rm -rf`'d independently (joined with ";", not "&&") so one
// failing removal doesn't stop the rest from being attempted; a failure in
// the elevated script itself (e.g. the user cancels the prompt) is what
// runElevatedUninstall treats as fatal, not an individual rm's exit code.
func (jm *Manager) runElevatedRemove(id string, paths []string) error {
	osaPath, err := osascriptTarget.resolve()
	if err != nil {
		return err
	}
	_, err = jm.runPhase(id, osaPath, nil, "-e", buildElevatedRemoveScript(paths))
	return err
}

// buildElevatedRemoveScript is the pure, directly-testable half of
// runElevatedRemove: given the paths Homebrew said it needs sudo to
// remove, builds the `do shell script ... with administrator privileges`
// source that removes all of them under one prompt.
func buildElevatedRemoveScript(paths []string) string {
	return BuildElevatedShellScript(nil, []string{"/bin/sh", "-c", removeCommand(paths)})
}

// removeCommand builds the `rm -rf -- <path>` shell command for each path,
// joined with ";" (not "&&") so one failing removal doesn't stop the rest
// from being attempted, and shell-quotes each path individually so it can
// safely contain spaces or other shell metacharacters (e.g. a real path
// like "/Library/Application Support/SomeApp"). Split out from
// buildElevatedRemoveScript so this half -- the actual command text -- is
// testable without also having to reason about BuildElevatedShellScript's
// own quoting of it as a nested `sh -c` argument.
func removeCommand(paths []string) string {
	rmCmds := make([]string, len(paths))
	for i, p := range paths {
		rmCmds[i] = "rm -rf -- " + shellQuoteArg(p)
	}
	return strings.Join(rmCmds, " ; ")
}

// runPhase runs one command to completion as part of a job already in
// progress (see runElevatedUninstall), streaming its output as job:output
// events under the given (already-started) job id same as start() does,
// and additionally returning the combined captured output so the caller
// can inspect it (see sudoOwnershipPaths). Registers/unregisters in jm.cmd
// around the run so Cancel(id) still works mid-phase.
func (jm *Manager) runPhase(id, path string, env []string, args ...string) (string, error) {
	cmd := exec.Command(path, args...)
	if env != nil {
		cmd.Env = env
	}
	cmd.Stdin = nil

	stdout, err1 := cmd.StdoutPipe()
	stderr, err2 := cmd.StderrPipe()
	if err1 != nil || err2 != nil {
		return "", errors.New("failed to create output pipes")
	}
	if err := cmd.Start(); err != nil {
		return "", err
	}

	jm.mu.Lock()
	jm.cmd[id] = cmd
	jm.mu.Unlock()

	capture := &lineCapture{}
	var wg sync.WaitGroup
	wg.Add(2)
	go jm.pipeCapturing(&wg, id, "stdout", stdout, capture)
	go jm.pipeCapturing(&wg, id, "stderr", stderr, capture)
	wg.Wait()
	err := cmd.Wait()

	jm.mu.Lock()
	delete(jm.cmd, id)
	jm.mu.Unlock()

	return capture.String(), err
}

// succeedDone emits a job's success DoneEvent and invokes onDone(true) --
// the multi-phase counterpart to failDone, used once runElevatedUninstall
// knows the whole sequence finished cleanly.
func (jm *Manager) succeedDone(id string, onDone func(success bool)) {
	runtime.EventsEmit(jm.ctx, eventJobDone, DoneEvent{ID: id, Success: true, ExitCode: 0})
	if onDone != nil {
		onDone(true)
	}
}

func (jm *Manager) start(target binaryTarget, title string, lenient bool, quiet bool, env []string, onDone func(success bool), args ...string) string {
	id := newJobID()
	runtime.EventsEmit(jm.ctx, eventJobStart, StartEvent{ID: id, Title: title, Quiet: quiet})

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
	jm.pipeCapturing(wg, id, stream, r, nil)
}

// lineCapture accumulates every line pipeCapturing sees, guarded by its own
// mutex since stdout and stderr are each read by a separate goroutine.
// Used by runElevatedUninstall (see StartElevatedUninstall) to scan a
// phase's combined output for the specific paths Homebrew says it needs
// root to remove, after that phase's lines have already been streamed to
// the frontend as normal job:output events.
type lineCapture struct {
	mu  sync.Mutex
	buf strings.Builder
}

func (c *lineCapture) add(line string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.buf.WriteString(line)
	c.buf.WriteByte('\n')
}

func (c *lineCapture) String() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buf.String()
}

// pipeCapturing is pipe, plus optionally appending every line to capture
// (nil for the normal single-phase job path, where nothing downstream needs
// to inspect the output afterward).
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
