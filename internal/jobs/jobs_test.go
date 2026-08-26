package jobs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestMasTargetResolvesMasBinary guards against the regression where Mac App
// Store upgrade jobs actually ran through brew's binary resolution: start()
// used to unconditionally call brew.ResolveBrewPath() and exec `brew`
// regardless of which job it was launching, so clicking "Upgrade" on an App
// Store app ran `brew upgrade <numeric-id>` (which always fails) and
// "Upgrade all App Store apps" ran bare `brew upgrade` (which silently
// upgraded every outdated Homebrew formula/cask on the system). masTarget
// must resolve strictly by looking up `mas` on PATH, independent of whatever
// brew binary happens to be installed.
func TestMasTargetResolvesMasBinary(t *testing.T) {
	dir := t.TempDir()
	masPath := filepath.Join(dir, "mas")
	if err := os.WriteFile(masPath, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("writing fake mas binary: %v", err)
	}

	t.Setenv("PATH", dir)

	got, err := masTarget.resolve()
	if err != nil {
		t.Fatalf("masTarget.resolve() error = %v, want nil", err)
	}
	if got != masPath {
		t.Errorf("masTarget.resolve() = %q, want %q", got, masPath)
	}
}

// TestMasTargetResolveErrorMentionsMas checks that the "not found" error
// actually names mas, not brew -- exactly the kind of misdirection the
// original bug produced (a `brew upgrade` failure for what's supposed to be
// an App Store action).
func TestMasTargetResolveErrorMentionsMas(t *testing.T) {
	dir := t.TempDir() // empty: nothing on PATH
	t.Setenv("PATH", dir)

	_, err := masTarget.resolve()
	if err == nil {
		t.Fatal("masTarget.resolve() error = nil, want an error since mas isn't on PATH")
	}
	if !strings.Contains(err.Error(), "mas") {
		t.Errorf("masTarget.resolve() error = %q, want it to mention mas", err.Error())
	}
}

// TestMasTargetDoesNotUseBrewEnv guards the other half of the bug fix: mas
// jobs must not inherit brew's HOMEBREW_* environment overrides (brewTarget
// sets a defaultEnv, masTarget deliberately doesn't so the subprocess just
// inherits this process's environment, same as brew.RunCmd does for mas
// elsewhere in this codebase).
func TestMasTargetDoesNotUseBrewEnv(t *testing.T) {
	if masTarget.defaultEnv != nil {
		t.Error("masTarget.defaultEnv is set, want nil (mas should inherit the process environment, not brew's)")
	}
	if brewTarget.defaultEnv == nil {
		t.Error("brewTarget.defaultEnv is nil, want brew.Env (regression in an unrelated target, not just mas)")
	}
}

// TestSudoOwnershipPaths uses the exact literal text Homebrew's cask
// uninstall prints (Cask::Utils.gain_permissions's `ohai "Using sudo to
// gain ownership of path '#{path}'"`) to confirm sudoOwnershipPathRe
// extracts the real path, not just that it matches something.
func TestSudoOwnershipPaths(t *testing.T) {
	tests := []struct {
		name   string
		output string
		want   []string
	}{
		{
			name: "the real graalvm-jdk@21 failure from issue #79",
			output: `==> Backing up Generic Artifact 'graalvm-21.jdk' to '/opt/homebrew/Caskroom/graalvm-jdk@21/21.0.12,7/graalvm-jdk-21.0.12+7.1'
==> Removing Generic Artifact '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'
==> Using sudo to gain ownership of path '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'
sudo: a terminal is required to read the password; either use the -S option to read from standard input or configure an askpass helper
sudo: a password is required
Error: Failure while executing; ` + "`/usr/bin/sudo -E -- /bin/rm -R -f -- /Library/Java/JavaVirtualMachines/graalvm-21.jdk`" + ` exited with 1.`,
			want: []string{"/Library/Java/JavaVirtualMachines/graalvm-21.jdk"},
		},
		{
			name: "no match on unrelated output",
			output: `==> Uninstalling Cask wget
==> Purging files for version 1.2.3 of Cask wget`,
			want: nil,
		},
		{
			name:   "empty output",
			output: "",
			want:   nil,
		},
		{
			name: "multiple distinct paths across separate steps",
			output: `==> Using sudo to gain ownership of path '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'
sudo: a password is required
==> Using sudo to gain ownership of path '/Library/Application Support/SomeApp'
sudo: a password is required`,
			want: []string{
				"/Library/Java/JavaVirtualMachines/graalvm-21.jdk",
				"/Library/Application Support/SomeApp",
			},
		},
		{
			name: "the same path repeated across retries is deduplicated",
			output: `==> Using sudo to gain ownership of path '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'
sudo: a password is required
==> Using sudo to gain ownership of path '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'
sudo: a password is required`,
			want: []string{"/Library/Java/JavaVirtualMachines/graalvm-21.jdk"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sudoOwnershipPaths(tt.output)
			if len(got) != len(tt.want) {
				t.Fatalf("sudoOwnershipPaths() = %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("sudoOwnershipPaths()[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// TestRemoveCommand checks the actual rm chain text: each path
// individually rm -rf'd and shell-quoted (so a real path containing spaces,
// e.g. "/Library/Application Support/SomeApp", stays one argument), joined
// with ";" (not "&&", so one failing removal doesn't stop the rest).
func TestRemoveCommand(t *testing.T) {
	tests := []struct {
		name  string
		paths []string
		want  string
	}{
		{
			name:  "single path",
			paths: []string{"/Library/Java/JavaVirtualMachines/graalvm-21.jdk"},
			want:  `rm -rf -- '/Library/Java/JavaVirtualMachines/graalvm-21.jdk'`,
		},
		{
			name:  "multiple paths joined with a semicolon, not &&",
			paths: []string{"/a/b", "/c/d"},
			want:  `rm -rf -- '/a/b' ; rm -rf -- '/c/d'`,
		},
		{
			name:  "a path containing spaces stays one shell-quoted argument",
			paths: []string{"/Library/Application Support/SomeApp"},
			want:  `rm -rf -- '/Library/Application Support/SomeApp'`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := removeCommand(tt.paths); got != tt.want {
				t.Errorf("removeCommand(%v) = %q, want %q", tt.paths, got, tt.want)
			}
		})
	}
}

// TestBuildElevatedRemoveScript checks the wrapper shape: a
// do-shell-script-with-administrator-privileges AppleScript source that
// never invokes brew itself directly (that's the actual bug this whole
// design exists to avoid -- see issue #101).
func TestBuildElevatedRemoveScript(t *testing.T) {
	script := buildElevatedRemoveScript([]string{"/Library/Java/JavaVirtualMachines/graalvm-21.jdk"})

	if !strings.HasPrefix(script, "do shell script ") || !strings.HasSuffix(script, " with administrator privileges") {
		t.Errorf("buildElevatedRemoveScript() = %q, want a do-shell-script-with-administrator-privileges wrapper", script)
	}
	if strings.Contains(script, "brew") {
		t.Errorf("buildElevatedRemoveScript() = %q, must never invoke brew itself (that's issue #101)", script)
	}
}
