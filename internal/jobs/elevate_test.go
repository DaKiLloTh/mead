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
	script := BuildElevatedShellScript(
		[]string{"HOMEBREW_NO_AUTO_UPDATE=1", "NONINTERACTIVE=1"},
		[]string{"/opt/homebrew/bin/brew", "uninstall", "--cask", "temurin"},
	)

	want := `do shell script "HOMEBREW_NO_AUTO_UPDATE=1 NONINTERACTIVE=1 '/opt/homebrew/bin/brew' 'uninstall' '--cask' 'temurin' 2>&1" with administrator privileges`
	if script != want {
		t.Errorf("BuildElevatedShellScript() = %q, want %q", script, want)
	}
}

// TestBuildElevatedShellScriptEnvPairsAreNotShellQuoted guards the reason
// envPairs and argv are handled by two different code paths: quoting a
// "KEY=value" token as a single quoted word (as argv elements are) would
// stop a POSIX shell from parsing it as a variable assignment.
func TestBuildElevatedShellScriptEnvPairsAreNotShellQuoted(t *testing.T) {
	script := BuildElevatedShellScript([]string{"FOO=1"}, []string{"true"})
	if strings.Contains(script, `'FOO=1'`) {
		t.Errorf("BuildElevatedShellScript() quoted an env pair, want it embedded literally: %q", script)
	}
	if !strings.Contains(script, "FOO=1 'true'") {
		t.Errorf("BuildElevatedShellScript() = %q, want it to contain %q", script, "FOO=1 'true'")
	}
}

// TestBuildElevatedShellScriptEscapesAdversarialArgv is the security-focused
// case from the issue: a value that would break out of the single-quoted
// shell word (and, after that, out of the AppleScript string literal it's
// embedded in) must come through as one inert, literal shell argument, not
// as injected shell syntax or extra AppleScript.
func TestBuildElevatedShellScriptEscapesAdversarialArgv(t *testing.T) {
	adversarial := `foo'; rm -rf ~; echo '"pwned`
	script := BuildElevatedShellScript(nil, []string{"echo", adversarial})

	want := `do shell script "'echo' 'foo'\\''; rm -rf ~; echo '\\''\"pwned' 2>&1" with administrator privileges`
	if script != want {
		t.Errorf("BuildElevatedShellScript() = %q, want %q", script, want)
	}
}

// TestBuildElevatedShellScriptRedirectsStderr checks the merge that lets a
// failed job's job:output still surface stderr text even though `do shell
// script` only hands osascript back one string (its normal return value on
// success, or an error message on failure) rather than separate streams.
func TestBuildElevatedShellScriptRedirectsStderr(t *testing.T) {
	script := BuildElevatedShellScript(nil, []string{"brew", "uninstall", "temurin"})
	if !strings.HasSuffix(script, `2>&1" with administrator privileges`) {
		t.Errorf("BuildElevatedShellScript() = %q, want it to redirect stderr into stdout before the closing quote", script)
	}
}
