package jobs

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeMasScript imitates the part of mas that matters here: it writes normal
// output to stdout, then (like sudo) prompts on /dev/tty -- not stdout or
// stdin -- and reads the answer back from /dev/tty with echo off. That only
// works if the process really has a controlling terminal, which is exactly
// what StartMas must provide and what a plain-pipe subprocess lacks.
const fakeMasScript = `#!/bin/sh
echo "Downloading fake app"
stty -echo < /dev/tty
printf 'Password:' > /dev/tty
IFS= read -r pw < /dev/tty
if [ "$pw" = "hunter2" ]; then
  echo "installed"
  exit 0
fi
echo "bad password" >&2
exit 1
`

type recorder struct {
	mu      sync.Mutex
	starts  []StartEvent
	outputs []OutputEvent
	dones   []DoneEvent
}

func (r *recorder) emit(name string, data ...any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	switch v := data[0].(type) {
	case StartEvent:
		r.starts = append(r.starts, v)
	case OutputEvent:
		r.outputs = append(r.outputs, v)
	case DoneEvent:
		r.dones = append(r.dones, v)
	}
}

func (r *recorder) hasLine(line string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, o := range r.outputs {
		if o.Line == line {
			return true
		}
	}
	return false
}

func (r *recorder) done() (DoneEvent, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.dones) == 0 {
		return DoneEvent{}, false
	}
	return r.dones[0], true
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func newFakeMasManager(t *testing.T) (*Manager, *recorder) {
	t.Helper()
	script := filepath.Join(t.TempDir(), "mas")
	if err := os.WriteFile(script, []byte(fakeMasScript), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := &recorder{}
	jm := NewManager()
	jm.emit = rec.emit
	jm.masPath = func() (string, error) { return script, nil }
	return jm, rec
}

func TestStartMasPromptIsVisibleAndAnswerable(t *testing.T) {
	jm, rec := newFakeMasManager(t)

	id := jm.StartMas("Upgrade fake", "upgrade", "123")

	// The prompt has no trailing newline and goes to /dev/tty; it must still
	// reach the frontend so the user knows to respond.
	waitFor(t, "the Password: prompt", func() bool { return rec.hasLine("Password:") })

	if !jm.SendInput(id, "hunter2") {
		t.Fatal("SendInput reported the job as not interactive/running")
	}
	waitFor(t, "job completion", func() bool { _, ok := rec.done(); return ok })

	done, _ := rec.done()
	if !done.Success || done.ExitCode != 0 {
		t.Errorf("done = %+v, want success with exit 0", done)
	}
	if !rec.hasLine("Downloading fake app") || !rec.hasLine("installed") {
		t.Errorf("missing normal stdout lines; outputs = %+v", rec.outputs)
	}
	for _, o := range rec.outputs {
		if strings.Contains(o.Line, "hunter2") {
			t.Errorf("typed password was echoed into job output: %q", o.Line)
		}
	}
	if len(rec.starts) != 1 || !rec.starts[0].Interactive {
		t.Errorf("starts = %+v, want one interactive start event", rec.starts)
	}
	if jm.SendInput(id, "again") {
		t.Error("SendInput succeeded after the job finished, want false")
	}
}

func TestStartMasWrongPasswordFailsTheJob(t *testing.T) {
	jm, rec := newFakeMasManager(t)

	id := jm.StartMas("Upgrade fake", "upgrade", "123")
	waitFor(t, "the Password: prompt", func() bool { return rec.hasLine("Password:") })
	jm.SendInput(id, "nope")
	waitFor(t, "job completion", func() bool { _, ok := rec.done(); return ok })

	done, _ := rec.done()
	if done.Success || done.ExitCode != 1 {
		t.Errorf("done = %+v, want failure with exit 1", done)
	}
	if !rec.hasLine("bad password") {
		t.Errorf("stderr line missing; outputs = %+v", rec.outputs)
	}
}

func TestStartMasReportsMissingBinary(t *testing.T) {
	rec := &recorder{}
	jm := NewManager()
	jm.emit = rec.emit
	jm.masPath = func() (string, error) { return "", os.ErrNotExist }

	jm.StartMas("Upgrade fake", "upgrade")

	done, ok := rec.done()
	if !ok || done.Success {
		t.Errorf("done = %+v (ok=%v), want a failed done event", done, ok)
	}
}
