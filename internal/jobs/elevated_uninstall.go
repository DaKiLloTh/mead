package jobs

import (
	"errors"
	"os/exec"
	"strings"
	"sync"

	"mead/internal/brew"
)

// lineCapture collects the lines of one job phase. stdout and stderr are read
// by separate goroutines, hence the mutex.
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

// StartElevatedUninstall retries an uninstall that failed because removing
// some path outside Homebrew's own prefix needs root -- for example a JDK
// under /Library/Java/JavaVirtualMachines -- and there is no terminal for
// sudo to prompt on. The frontend offers it only as an explicit retry after a
// plain uninstall has failed with sudo's "a terminal is required" or "a
// password is required" error. mead never elevates on its own.
//
// brew itself always runs as the normal user: Homebrew refuses to run as root
// (see BuildElevatedShellScript). So:
//  1. run the uninstall normally;
//  2. if it fails, read the path(s) Homebrew says it needs sudo for from its
//     output;
//  3. remove just those paths as root, behind one Touch ID or password prompt
//     that names them, refusing anything outside the allowed system locations;
//  4. run the uninstall normally again, which now finds nothing in its way.
//
// If the failure is not that shape there is nothing safe left to try, so the
// real error is reported instead of retrying blindly.
func (jm *Manager) StartElevatedUninstall(title string, onDone func(success bool), uninstallArgs []string) string {
	id := newJobID()
	jm.emit(eventJobStart, StartEvent{ID: id, Title: title})
	go jm.runElevatedUninstall(id, onDone, uninstallArgs)
	return id
}

func (jm *Manager) runElevatedUninstall(id string, onDone func(success bool), uninstallArgs []string) {
	brewPath, err := jm.brewPath()
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
		jm.failDone(id, onDone, runErr.Error())
		return
	}
	for _, p := range paths {
		if !elevatedRemoveAllowed(p) {
			jm.emit(eventJobOutput, OutputEvent{ID: id, Stream: "stderr",
				Line: "mead will not remove " + p + " as administrator: it is outside the system locations casks install to."})
			jm.failDone(id, onDone, runErr.Error())
			return
		}
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

// runElevatedRemove removes every path as root behind a single prompt.
func (jm *Manager) runElevatedRemove(id string, paths []string) error {
	osaPath, err := jm.osascriptPath()
	if err != nil {
		return err
	}
	out, err := jm.runPhase(id, osaPath, nil, "-e", buildElevatedRemoveScript(paths))
	if err != nil && elevationDeclined(out) {
		return errors.New("administrator permission was not granted")
	}
	return err
}

// runPhase runs one command to completion as part of a job already started
// under id, streaming its output as job:output events like start() does, and
// returns the combined output so the caller can read it. It registers the
// command in jm.cmd so Cancel(id) still works during a phase.
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

// succeedDone reports a multi-phase job as finished successfully: the
// counterpart of failDone.
func (jm *Manager) succeedDone(id string, onDone func(success bool)) {
	jm.emit(eventJobDone, DoneEvent{ID: id, Success: true, ExitCode: 0})
	if onDone != nil {
		onDone(true)
	}
}
