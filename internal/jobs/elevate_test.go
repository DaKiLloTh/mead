package jobs

import (
	"strings"
	"testing"
)

func TestShellQuoteArg(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"plain word", "brew", `'brew'`},
		{"path", "/opt/homebrew/bin/brew", `'/opt/homebrew/bin/brew'`},
		{"empty string", "", `''`},
		{"single quote", "it's", `'it'\''s'`},
		{"double quote passes through untouched", `say "hi"`, `'say "hi"'`},
		{"shell metacharacters are inert inside single quotes", "a; rm -rf / #", `'a; rm -rf / #'`},
		{"command substitution is inert inside single quotes", "$(rm -rf /)", `'$(rm -rf /)'`},
		{"backtick is inert inside single quotes", "`rm -rf /`", "'`rm -rf /`'"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shellQuoteArg(tt.input); got != tt.want {
				t.Errorf("shellQuoteArg(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestAppleScriptQuote(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"plain word", `'brew'`, `"'brew'"`},
		{"double quote", `say "hi"`, `"say \"hi\""`},
		{"backslash", `a\b`, `"a\\b"`},
		{"backslash before quote is escaped in the right order", `\"`, `"\\\""`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := appleScriptQuote(tt.input); got != tt.want {
				t.Errorf("appleScriptQuote(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestBuildElevatedShellScript(t *testing.T) {
	script := BuildElevatedShellScript([]string{"/bin/rm", "-Rf", "--", "/Library/Java/x.jdk"}, "mead needs permission")
	want := `do shell script "'/bin/rm' '-Rf' '--' '/Library/Java/x.jdk' 2>&1" with prompt "mead needs permission" with administrator privileges`
	if script != want {
		t.Errorf("BuildElevatedShellScript() = %q, want %q", script, want)
	}
}

// TestBuildElevatedShellScriptEscapesAdversarialArgv is the security-focused
// case: a value that would break out of the single-quoted shell word (and,
// after that, out of the AppleScript string literal it's embedded in) must
// come through as one inert, literal shell argument, not as injected shell
// syntax or extra AppleScript.
func TestBuildElevatedShellScriptEscapesAdversarialArgv(t *testing.T) {
	adversarial := `foo'; rm -rf ~; echo '"pwned`
	script := BuildElevatedShellScript([]string{"echo", adversarial}, "p")

	want := `do shell script "'echo' 'foo'\\''; rm -rf ~; echo '\\''\"pwned' 2>&1" with prompt "p" with administrator privileges`
	if script != want {
		t.Errorf("BuildElevatedShellScript() = %q, want %q", script, want)
	}
}

// The prompt is text the user reads, and paths in it can contain quotes; it
// must not be able to end the AppleScript string early.
func TestBuildElevatedShellScriptEscapesThePrompt(t *testing.T) {
	script := BuildElevatedShellScript([]string{"true"}, `remove "x" \ y`)
	if !strings.Contains(script, `with prompt "remove \"x\" \\ y" with administrator privileges`) {
		t.Errorf("BuildElevatedShellScript() = %q, prompt not escaped", script)
	}
}

// TestBuildElevatedShellScriptRedirectsStderr checks the merge that lets a
// failed job's job:output still surface stderr text even though `do shell
// script` only hands osascript back one string (its normal return value on
// success, or an error message on failure) rather than separate streams.
func TestBuildElevatedShellScriptRedirectsStderr(t *testing.T) {
	script := BuildElevatedShellScript([]string{"rm", "x"}, "p")
	if !strings.Contains(script, ` 2>&1" with prompt`) {
		t.Errorf("BuildElevatedShellScript() = %q, want stderr redirected into stdout inside the quoted command", script)
	}
}
