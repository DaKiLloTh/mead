package jobs

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

// The real failure from issue #79: graalvm-jdk@21 installs its JDK under
// /Library/Java/JavaVirtualMachines, and Homebrew's removal needs sudo.
const graalvmFailure = `==> Backing up Generic Artifact 'graalvm-21.jdk' to '/opt/homebrew/Caskroom/graalvm-jdk@21/21.0.12,7/graalvm-jdk-21.0.12+7.1'
==> Removing Generic Artifact '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'
==> Using sudo to gain ownership of path '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'
sudo: a terminal is required to read the password; either use the -S option to read from standard input or configure an askpass helper
sudo: a password is required
Error: Failure while executing; ` + "`/usr/bin/sudo -E -- /bin/rm -R -f -- /Library/Java/JavaVirtualMachines/graalvm-21.jdk`" + ` exited with 1.`

func TestSudoOwnershipPaths(t *testing.T) {
	tests := []struct {
		name   string
		output string
		want   []string
	}{
		{"the real graalvm-jdk@21 failure", graalvmFailure, []string{"/Library/Java/JavaVirtualMachines/graalvm-21.jdk"}},
		{"unrelated output", "==> Uninstalling Cask wget\n==> Purging files", nil},
		{"empty output", "", nil},
		{
			"several distinct paths, in order",
			"==> Using sudo to gain ownership of path '/Library/Java/JavaVirtualMachines/a.jdk'\n==> Using sudo to gain ownership of path '/Library/Application Support/SomeApp'",
			[]string{"/Library/Java/JavaVirtualMachines/a.jdk", "/Library/Application Support/SomeApp"},
		},
		{
			"the same path repeated across retries appears once",
			"==> Using sudo to gain ownership of path '/opt/x'\n==> Using sudo to gain ownership of path '/opt/x'",
			[]string{"/opt/x"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sudoOwnershipPaths(tt.output)
			if strings.Join(got, "|") != strings.Join(tt.want, "|") {
				t.Errorf("sudoOwnershipPaths() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestElevatedRemoveAllowed(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		// What casks really install outside Homebrew's prefix.
		{"/Library/Java/JavaVirtualMachines/graalvm-21.jdk", true},
		{"/Applications/Some App.app", true},
		{"/Library/Application Support/SomeApp", true},
		{"/Library/PrivilegedHelperTools/com.example.helper", true},
		{"/Library/LaunchDaemons/com.example.plist", true},
		{"/usr/local/bin/tool", true},
		{"/opt/tool", true},
		// Roots, top-level folders and shared containers are never removed.
		{"/", false},
		{"/Library", false},
		{"/Library/Java", false},
		{"/Library/Java/JavaVirtualMachines", false},
		{"/Library/Application Support", false},
		{"/Library/LaunchDaemons", false},
		{"/Applications", false},
		{"/usr/local", false},
		{"/usr/local/bin", false},
		{"/opt", false},
		// Outside the allowed system locations.
		{"/System/Library/Extensions/x.kext", false},
		{"/usr/bin/ssh", false},
		{"/private/etc/hosts", false},
		{"/Users/me/Documents", false},
		{"/opt2/x", false},
		// Not a clean absolute path.
		{"", false},
		{"relative/path", false},
		{"/Library/Java/../../System/x", false},
		{"/Applications/App.app/", false},
		{"/Applications//App.app", false},
		{"/Applications/./App.app", false},
		{"/Applications/App\x00.app", false},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := elevatedRemoveAllowed(tt.path); got != tt.want {
				t.Errorf("elevatedRemoveAllowed(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestElevationDeclined(t *testing.T) {
	tests := []struct {
		out  string
		want bool
	}{
		{"execution error: User canceled. (-128)", true},
		{"0:73: execution error: User cancelled? user canceled", true},
		{"execution error: Something else failed. (1)", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := elevationDeclined(tt.out); got != tt.want {
			t.Errorf("elevationDeclined(%q) = %v, want %v", tt.out, got, tt.want)
		}
	}
}

// removeCommand is the text handed to root, so run it for real (as the
// current user, on temp files) rather than only comparing strings: paths with
// spaces and quotes must be removed exactly, and nothing else touched.
func TestRemoveCommandRemovesExactlyThosePaths(t *testing.T) {
	root := t.TempDir()
	mk := func(rel string) string {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		return p
	}
	spaced := mk("Some App/it's here/file.txt")
	dir := filepath.Join(root, "Some App")
	other := filepath.Join(root, "other", "keep.txt")
	if err := os.MkdirAll(filepath.Dir(other), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(other, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(root, "does not exist")

	cmd := removeCommand([]string{dir, missing})
	if out, err := exec.Command("/bin/sh", "-c", cmd).CombinedOutput(); err != nil {
		t.Fatalf("removeCommand failed: %v\n%s", err, out)
	}
	if _, err := os.Stat(spaced); !os.IsNotExist(err) {
		t.Errorf("%q still exists after removeCommand", spaced)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Errorf("%q still exists after removeCommand", dir)
	}
	if _, err := os.Stat(other); err != nil {
		t.Errorf("removeCommand removed an unrelated file: %v", err)
	}
}

func TestRemoveCommandQuotesHostilePaths(t *testing.T) {
	got := removeCommand([]string{`/opt/a'; touch /tmp/pwned; '`})
	want := `/bin/rm -Rf -- '/opt/a'\''; touch /tmp/pwned; '\'''`
	if got != want {
		t.Errorf("removeCommand() = %q, want %q", got, want)
	}
}

// The generated AppleScript has to be valid syntax, including with a path
// that needs both quoting layers. osacompile checks syntax without running
// anything or showing a dialog.
func TestBuildElevatedRemoveScriptCompiles(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("osacompile is macOS only")
	}
	osacompile, err := exec.LookPath("osacompile")
	if err != nil {
		t.Skip("osacompile not found")
	}
	script := buildElevatedRemoveScript([]string{
		"/Library/Java/JavaVirtualMachines/graalvm-21.jdk",
		`/Library/Application Support/It's "quoted" \ odd`,
	})
	out, err := exec.Command(osacompile, "-e", script, "-o", filepath.Join(t.TempDir(), "x.scpt")).CombinedOutput()
	if err != nil {
		t.Fatalf("osacompile rejected the script: %v\n%s\n%s", err, out, script)
	}
	for _, want := range []string{"with prompt", "mead needs administrator permission to remove", "with administrator privileges"} {
		if !strings.Contains(script, want) {
			t.Errorf("script is missing %q: %s", want, script)
		}
	}
}

// ---- orchestration, against fake brew and osascript scripts ----

type fakeEnv struct {
	state   string
	brew    string
	osa     string
	rec     *recorder
	mgr     *Manager
	onDone  []bool
	doneCh  chan bool // receives each onDone(success) call
	removed string    // marker the fake osascript creates when "authorized"
}

// newFakeEnv builds a Manager whose brew fails with the given output until
// the fake osascript has run, and whose osascript either "authorizes" (creates
// the marker) or behaves as if the user cancelled.
func newFakeEnv(t *testing.T, brewFailure string, osaCancels bool) *fakeEnv {
	t.Helper()
	dir := t.TempDir()
	e := &fakeEnv{state: dir, rec: &recorder{}, doneCh: make(chan bool, 4), removed: filepath.Join(dir, "removed")}

	e.brew = filepath.Join(dir, "brew")
	brewScript := "#!/bin/sh\n" +
		"echo \"$@\" >> " + shellQuoteArg(filepath.Join(dir, "brew-calls")) + "\n" +
		"if [ -e " + shellQuoteArg(e.removed) + " ]; then echo 'Uninstalled'; exit 0; fi\n" +
		"cat <<'EOF'\n" + brewFailure + "\nEOF\n" +
		"exit 1\n"
	writeExecutable(t, e.brew, brewScript)

	e.osa = filepath.Join(dir, "osascript")
	osaScript := "#!/bin/sh\n" +
		"printf '%s\\n' \"$2\" > " + shellQuoteArg(filepath.Join(dir, "osascript-script")) + "\n"
	if osaCancels {
		osaScript += "echo 'execution error: User canceled. (-128)' >&2\nexit 1\n"
	} else {
		osaScript += "touch " + shellQuoteArg(e.removed) + "\nexit 0\n"
	}
	writeExecutable(t, e.osa, osaScript)

	e.mgr = NewManager()
	e.mgr.emit = e.rec.emit
	e.mgr.brewPath = func() (string, error) { return e.brew, nil }
	e.mgr.osascriptPath = func() (string, error) { return e.osa, nil }
	return e
}

func writeExecutable(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
}

func (e *fakeEnv) run(t *testing.T) DoneEvent {
	t.Helper()
	e.mgr.StartElevatedUninstall("Uninstall graalvm-jdk@21", func(ok bool) { e.doneCh <- ok },
		[]string{"uninstall", "--cask", "graalvm-jdk@21"})
	waitFor(t, "the job to finish", func() bool { _, ok := e.rec.done(); return ok })
	// The done event is emitted before onDone runs, so wait for the callback
	// rather than reading what it records while it may still be running.
	select {
	case ok := <-e.doneCh:
		e.onDone = append(e.onDone, ok)
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for onDone")
	}
	d, _ := e.rec.done()
	return d
}

func (e *fakeEnv) brewCalls(t *testing.T) []string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(e.state, "brew-calls"))
	if err != nil {
		return nil
	}
	return strings.Split(strings.TrimSpace(string(b)), "\n")
}

func (e *fakeEnv) osascriptScript() string {
	b, _ := os.ReadFile(filepath.Join(e.state, "osascript-script"))
	return string(b)
}

func TestElevatedUninstallRemovesTheBlockingPathThenRetriesAsTheUser(t *testing.T) {
	e := newFakeEnv(t, graalvmFailure, false)
	d := e.run(t)

	if !d.Success {
		t.Fatalf("job failed: %+v", d)
	}
	calls := e.brewCalls(t)
	if len(calls) != 2 || calls[0] != "uninstall --cask graalvm-jdk@21" || calls[1] != calls[0] {
		t.Errorf("brew was run %v, want the same uninstall twice", calls)
	}
	script := e.osascriptScript()
	for _, want := range []string{
		"with administrator privileges",
		"/Library/Java/JavaVirtualMachines/graalvm-21.jdk",
		"/bin/rm -Rf --",
		"mead needs administrator permission to remove",
	} {
		if !strings.Contains(script, want) {
			t.Errorf("osascript script missing %q:\n%s", want, script)
		}
	}
	// Brew is never handed to osascript: it must not run as root.
	if strings.Contains(script, e.brew) || strings.Contains(script, "uninstall --cask") {
		t.Errorf("brew was wrapped in the elevated script:\n%s", script)
	}
	if len(e.onDone) != 1 || !e.onDone[0] {
		t.Errorf("onDone = %v, want [true]", e.onDone)
	}
	if !e.rec.hasLine("Uninstalled") {
		t.Error("the retry's output was not streamed")
	}
	if len(e.rec.starts) != 1 || e.rec.starts[0].Title != "Uninstall graalvm-jdk@21" {
		t.Errorf("start events = %+v", e.rec.starts)
	}
}

func TestElevatedUninstallThatNeedsNothingNeverPrompts(t *testing.T) {
	e := newFakeEnv(t, "unused", false)
	writeExecutable(t, e.brew, "#!/bin/sh\necho ok\nexit 0\n")
	d := e.run(t)
	if !d.Success {
		t.Fatalf("job failed: %+v", d)
	}
	if e.osascriptScript() != "" {
		t.Error("osascript was run although the first uninstall succeeded")
	}
}

func TestElevatedUninstallWithAnUnrelatedFailureReportsItAndDoesNotPrompt(t *testing.T) {
	e := newFakeEnv(t, "Error: package is in use", false)
	d := e.run(t)
	if d.Success || d.Error == "" {
		t.Fatalf("want a failure with the real error, got %+v", d)
	}
	if e.osascriptScript() != "" {
		t.Error("osascript was run for a failure that has no path to elevate")
	}
	if len(e.brewCalls(t)) != 1 {
		t.Errorf("brew ran %d times, want 1", len(e.brewCalls(t)))
	}
	if len(e.onDone) != 1 || e.onDone[0] {
		t.Errorf("onDone = %v, want [false]", e.onDone)
	}
}

func TestElevatedUninstallRefusesToRemoveAPathOutsideTheSystemLocations(t *testing.T) {
	e := newFakeEnv(t, "==> Using sudo to gain ownership of path '/System/Library/Important'\nsudo: a password is required", false)
	d := e.run(t)
	if d.Success {
		t.Fatalf("job succeeded: %+v", d)
	}
	if e.osascriptScript() != "" {
		t.Error("osascript was asked to remove a path outside the allowed locations")
	}
	if !e.rec.hasLine("mead will not remove /System/Library/Important as administrator: it is outside the system locations casks install to.") {
		t.Errorf("the refusal was not explained in the output: %+v", e.rec.outputs)
	}
}

func TestElevatedUninstallStopsWhenAnyBlockingPathIsNotAllowed(t *testing.T) {
	e := newFakeEnv(t, "==> Using sudo to gain ownership of path '/Library/Java/JavaVirtualMachines/a.jdk'\n==> Using sudo to gain ownership of path '/usr/bin/ssh'", false)
	if d := e.run(t); d.Success {
		t.Fatalf("job succeeded: %+v", d)
	}
	if e.osascriptScript() != "" {
		t.Error("the allowed path was removed even though another was refused")
	}
}

func TestElevatedUninstallWhenTheUserCancelsThePrompt(t *testing.T) {
	e := newFakeEnv(t, graalvmFailure, true)
	d := e.run(t)
	if d.Success || d.Error != "administrator permission was not granted" {
		t.Fatalf("want the permission-not-granted failure, got %+v", d)
	}
	if len(e.brewCalls(t)) != 1 {
		t.Errorf("brew ran %d times, want 1: nothing to retry after a cancel", len(e.brewCalls(t)))
	}
}

func TestElevatedUninstallWhenTheRetryStillFails(t *testing.T) {
	e := newFakeEnv(t, graalvmFailure, false)
	// Even after the removal, brew keeps failing.
	writeExecutable(t, e.brew, "#!/bin/sh\necho \"$@\" >> "+shellQuoteArg(filepath.Join(e.state, "brew-calls"))+"\ncat <<'EOF'\n"+graalvmFailure+"\nEOF\nexit 1\n")
	d := e.run(t)
	if d.Success {
		t.Fatalf("job succeeded: %+v", d)
	}
	if len(e.brewCalls(t)) != 2 {
		t.Errorf("brew ran %d times, want exactly 2 (no retry loop)", len(e.brewCalls(t)))
	}
}

func TestElevatedUninstallWhenBrewCannotBeFound(t *testing.T) {
	e := newFakeEnv(t, graalvmFailure, false)
	e.mgr.brewPath = func() (string, error) { return "", errors.New("brew not found") }
	d := e.run(t)
	if d.Success || d.Error != "brew not found" {
		t.Fatalf("got %+v", d)
	}
}

func TestElevatedUninstallWhenOsascriptCannotBeFound(t *testing.T) {
	e := newFakeEnv(t, graalvmFailure, false)
	e.mgr.osascriptPath = func() (string, error) { return "", errors.New("no osascript") }
	d := e.run(t)
	if d.Success || d.Error != "no osascript" {
		t.Fatalf("got %+v", d)
	}
}

func TestElevatedUninstallWhenTheCommandCannotStart(t *testing.T) {
	e := newFakeEnv(t, graalvmFailure, false)
	e.mgr.brewPath = func() (string, error) { return filepath.Join(e.state, "no-such-brew"), nil }
	d := e.run(t)
	if d.Success || d.Error == "" {
		t.Fatalf("got %+v", d)
	}
}

func TestResolveOsascript(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("osascript is macOS only")
	}
	p, err := resolveOsascript()
	if err != nil || filepath.Base(p) != "osascript" {
		t.Errorf("resolveOsascript() = %q, %v", p, err)
	}
	t.Setenv("PATH", t.TempDir())
	if _, err := resolveOsascript(); err == nil {
		t.Error("resolveOsascript() succeeded with osascript off the PATH")
	}
}
