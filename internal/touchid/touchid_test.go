package touchid

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestEnabledIn(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    bool
	}{
		{"missing file / empty", "", false},
		{"standard line", "auth       sufficient     pam_tid.so\n", true},
		{"with leading comment header", "# sudo_local\nauth       sufficient     pam_tid.so\n", true},
		{"commented out", "#auth       sufficient     pam_tid.so\n", false},
		{"commented out with space", "  # auth sufficient pam_tid.so\n", false},
		{"unrelated module", "auth       sufficient     pam_smartcard.so\n", false},
		{"pam_tid mentioned only in a comment", "# enable pam_tid.so here\n", false},
		{"among other lines", "auth optional pam_foo.so\nauth sufficient pam_tid.so\n", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := EnabledIn(tt.content); got != tt.want {
				t.Errorf("EnabledIn(%q) = %v, want %v", tt.content, got, tt.want)
			}
		})
	}
}

func TestBiometricsAvailable(t *testing.T) {
	yes := "User Touch ID configuration:\n\tBiometrics for unlock: 1\n\tBiometrics for ApplePay: 1\n"
	no := "User Touch ID configuration:\n\tBiometrics for unlock: 0\n"
	if !biometricsAvailable(yes) {
		t.Error("expected available when Biometrics for unlock is 1")
	}
	if biometricsAvailable(no) {
		t.Error("expected unavailable when Biometrics for unlock is 0")
	}
	if biometricsAvailable("") {
		t.Error("expected unavailable for empty output")
	}
}

// runScript runs the real Terminal script against a temp sudo_local, with
// `env` standing in for sudo so it needs no privileges.
func runScript(t *testing.T, target string) string {
	t.Helper()
	script := filepath.Join(t.TempDir(), "enable.command")
	if err := os.WriteFile(script, []byte(BuildTerminalScript()), 0o700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("/bin/bash", script)
	cmd.Env = append(os.Environ(), "MEAD_SUDO_LOCAL="+target, "MEAD_SUDO=env")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("script failed: %v\n%s", err, out)
	}
	return string(out)
}

func TestTerminalScriptCreatesFile(t *testing.T) {
	target := filepath.Join(t.TempDir(), "sudo_local")
	runScript(t, target)

	got, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if !EnabledIn(string(got)) {
		t.Errorf("file does not enable Touch ID:\n%s", got)
	}
	info, _ := os.Stat(target)
	if info.Mode().Perm() != 0o444 {
		t.Errorf("mode = %v, want 0444", info.Mode().Perm())
	}
}

func TestTerminalScriptPreservesExistingContent(t *testing.T) {
	target := filepath.Join(t.TempDir(), "sudo_local")
	existing := "# my own settings\nauth optional pam_foo.so\n"
	if err := os.WriteFile(target, []byte(existing), 0o644); err != nil {
		t.Fatal(err)
	}
	runScript(t, target)

	got, _ := os.ReadFile(target)
	if !strings.HasPrefix(string(got), existing) {
		t.Errorf("existing content was not preserved:\n%s", got)
	}
	if !EnabledIn(string(got)) {
		t.Errorf("Touch ID line missing:\n%s", got)
	}
}

func TestTerminalScriptIsIdempotent(t *testing.T) {
	target := filepath.Join(t.TempDir(), "sudo_local")
	runScript(t, target)
	first, _ := os.ReadFile(target)
	out := runScript(t, target)
	second, _ := os.ReadFile(target)

	if string(first) != string(second) {
		t.Errorf("second run changed the file:\nbefore:\n%s\nafter:\n%s", first, second)
	}
	if !strings.Contains(out, "already enabled") {
		t.Errorf("second run should say it's already enabled, got:\n%s", out)
	}
	if n := len(regexp.MustCompile(`pam_tid\.so`).FindAllString(string(second), -1)); n != 1 {
		t.Errorf("pam_tid.so appears %d times, want 1", n)
	}
}

func TestTerminalScriptFailureChangesNothing(t *testing.T) {
	target := filepath.Join(t.TempDir(), "sudo_local")
	script := filepath.Join(t.TempDir(), "enable.command")
	if err := os.WriteFile(script, []byte(BuildTerminalScript()), 0o700); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("/bin/bash", script)
	// `false` stands in for a sudo that was denied (wrong password, cancelled).
	cmd.Env = append(os.Environ(), "MEAD_SUDO_LOCAL="+target, "MEAD_SUDO=false")
	out, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("expected a non-zero exit when sudo fails, got success:\n%s", out)
	}
	if _, statErr := os.Stat(target); statErr == nil {
		t.Error("file was created even though the privileged write failed")
	}
	if !strings.Contains(string(out), "Nothing was changed") {
		t.Errorf("expected a clear failure message, got:\n%s", out)
	}
}
