// Package touchid lets mead offer fingerprint authorization for sudo.
//
// Several things mead runs end up calling sudo internally (Xcode's App Store
// upgrade is the known one: mas runs `sudo /usr/sbin/installer ...`). macOS
// only offers Touch ID for sudo when /etc/pam.d/sudo_local contains a
// pam_tid.so line; without it sudo can only ask for a typed password. This
// package detects that state and, on explicit user request, helps add the
// line. mead never changes it silently.
//
// The write itself is done in a Terminal window, not by mead. An earlier
// version wrote it via `osascript ... with administrator privileges` and got
// "Operation not permitted": macOS protects /etc/pam.d from writes by a
// GUI app's helper even when running as root, but allows it from Terminal
// (the app users grant that power to), with the user typing their sudo
// password there.
package touchid

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	sudoLocalPath = "/etc/pam.d/sudo_local"
	pamTIDModule  = "/usr/lib/pam/pam_tid.so.2"
)

// Status describes whether fingerprint-for-sudo can be offered, and whether
// it's already on.
type Status struct {
	Available bool `json:"available"`
	Enabled   bool `json:"enabled"`
}

var enabledLineRe = regexp.MustCompile(`^\s*auth\s+\S+\s+pam_tid\.so\b`)

// EnabledIn reports whether the given sudo_local contents already turn on
// Touch ID: an uncommented `auth ... pam_tid.so` line.
func EnabledIn(content string) bool {
	for _, line := range strings.Split(content, "\n") {
		if enabledLineRe.MatchString(line) {
			return true
		}
	}
	return false
}

// biometricsAvailable parses `bioutil -r` output: the machine has usable
// Touch ID when "Biometrics for unlock" is on.
func biometricsAvailable(bioutilOutput string) bool {
	for _, line := range strings.Split(bioutilOutput, "\n") {
		k, v, ok := strings.Cut(strings.TrimSpace(line), ":")
		if ok && strings.TrimSpace(k) == "Biometrics for unlock" {
			return strings.TrimSpace(v) == "1"
		}
	}
	return false
}

// GetStatus inspects this machine. Errors reading state are treated as "not
// available" rather than surfaced: this only decides whether to show an
// optional offer.
func GetStatus() Status {
	if _, err := os.Stat(pamTIDModule); err != nil {
		return Status{}
	}
	out, err := exec.Command("/usr/bin/bioutil", "-r").Output()
	if err != nil || !biometricsAvailable(string(out)) {
		return Status{}
	}
	content, _ := os.ReadFile(sudoLocalPath)
	return Status{Available: true, Enabled: EnabledIn(string(content))}
}

// terminalScript is what the Terminal window runs. The two MEAD_* variables
// exist only so the tests can run it against a temp file with a stand-in for
// sudo; in real use they're unset and the defaults apply.
//
// It appends rather than overwrites (any other sudo_local settings the user
// has survive), does nothing if an enabling line is already present, and
// leaves the file root-owned and read-only.
const terminalScript = `#!/bin/bash
f="${MEAD_SUDO_LOCAL:-/etc/pam.d/sudo_local}"
run_as_root="${MEAD_SUDO:-sudo}"

echo "mead: enabling Touch ID for sudo"
echo
echo "This adds one line to $f so sudo accepts your fingerprint:"
echo "    auth       sufficient     pam_tid.so"
echo "You'll be asked for your password once, here."
echo

if [ -f "$f" ] && grep -Eq '^[[:space:]]*auth[[:space:]]+[^[:space:]]+[[:space:]]+pam_tid\.so' "$f"; then
  echo "Touch ID is already enabled for sudo. Nothing to do."
  status=0
elif $run_as_root sh -c 'printf "%s\n%s\n" "$2" "$3" >> "$1" && chmod 444 "$1"' sh "$f" "# Added by mead: allow Touch ID for sudo" "auth       sufficient     pam_tid.so"; then
  echo
  echo "Done. Touch ID is now enabled for sudo. Go back to mead."
  echo "To undo this later, delete $f"
  status=0
else
  echo
  echo "That didn't work. Nothing was changed."
  status=1
fi

echo
if [ -t 0 ]; then read -r -p "Press Return to close this window. " _; fi
exit $status
`

// BuildTerminalScript returns the shell script the Terminal window runs.
func BuildTerminalScript() string { return terminalScript }

// OpenSetupInTerminal writes the script to a private temp folder and opens
// it in Terminal, where the user sees exactly what it does and types their
// sudo password. It returns as soon as Terminal is opened; the caller
// watches GetStatus to learn whether the change happened.
func OpenSetupInTerminal() error {
	dir := filepath.Join(os.TempDir(), "mead-touchid")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	path := filepath.Join(dir, "enable-touch-id-for-sudo.command")
	if err := os.WriteFile(path, []byte(terminalScript), 0o700); err != nil {
		return err
	}
	if out, err := exec.Command("/usr/bin/open", "-a", "Terminal", path).CombinedOutput(); err != nil {
		return fmt.Errorf("couldn't open Terminal: %s", strings.TrimSpace(string(out)))
	}
	return nil
}
