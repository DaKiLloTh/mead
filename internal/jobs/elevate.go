package jobs

import "strings"

// BuildElevatedShellScript returns the AppleScript source to hand to
// `osascript -e` so that argv runs with administrator privileges -- i.e.
// via macOS's native Touch-ID-or-password authorization prompt (`do shell
// script "..." with administrator privileges` respects Touch ID for sudo
// when the user has it configured via pam_tid, falling back to a password
// prompt otherwise, without mead needing to implement anything
// Touch-ID-specific itself).
//
// This is the whole point of wrapping the entire `brew uninstall ...`
// invocation rather than trying to isolate just the final privileged step:
// Homebrew's own cask uninstall shells out to a plain `sudo -E -- rm ...`
// (see Homebrew/Library/Homebrew/cask/{utils,artifact/moved}.rb) when a
// Generic Artifact -- e.g. a JDK under /Library/Java/JavaVirtualMachines --
// lives outside a location the current user can write to. sudo does not
// require a password to re-authenticate when the process invoking it is
// already root, which is exactly the situation here once `do shell script
// ... with administrator privileges` has elevated the whole `brew`
// invocation: brew's own internal `sudo rm` call is satisfied by that
// existing root context and returns immediately, without brew itself
// needing to run privileged for any of its normal (non-removal) work. So one
// prompt at the top covers the one privileged step Homebrew needs, and brew
// is never told to run as root for anything else.
//
// envPairs are literal "KEY=value" shell-command words, embedded verbatim
// and unquoted immediately before argv -- this only ever carries mead's own
// fixed, hardcoded environment overrides (see brew.FixedEnvVars), never
// caller-supplied data, because quoting a "KEY=value" token as a whole would
// stop a POSIX shell from recognizing it as an assignment rather than a
// command name.
//
// argv is the command and its arguments (e.g. the resolved brew path
// followed by ["uninstall", "--cask", name]). Each element is shell-quoted
// individually -- via shellQuoteArg -- so it can safely contain arbitrary
// characters (quotes, spaces, shell metacharacters) without being
// interpreted by the /bin/sh that `do shell script` re-enters, and the
// resulting shell command is then escaped a second time -- via
// appleScriptQuote -- so it can be embedded as a double-quoted AppleScript
// string literal. Both layers matter: skip the shell layer and a value like
// `a; rm -rf /` becomes a second command; skip the AppleScript layer and a
// literal `"` in the (already shell-quoted) command breaks out of the
// AppleScript string early.
//
// The command's stderr is redirected into stdout (`2>&1`) so that whichever
// half of `do shell script`'s output osascript hands back -- the return
// value on success, or the error message on failure -- carries the combined
// output, not just one stream.
func BuildElevatedShellScript(envPairs []string, argv []string) string {
	words := make([]string, 0, len(envPairs)+len(argv))
	words = append(words, envPairs...)
	for _, a := range argv {
		words = append(words, shellQuoteArg(a))
	}
	shellCmd := strings.Join(words, " ") + " 2>&1"
	return "do shell script " + appleScriptQuote(shellCmd) + " with administrator privileges"
}

// shellQuoteArg wraps s in single quotes so a POSIX shell treats it as one
// literal word regardless of its contents, escaping any single quote it
// contains as: close the quoted string, an escaped literal quote, then
// reopen the quoted string -- the standard technique, since a single quote
// can't be escaped from inside a single-quoted string.
func shellQuoteArg(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// appleScriptQuote wraps s in double quotes as an AppleScript string
// literal, escaping backslashes and double quotes -- the only two escape
// sequences AppleScript string literals support. Backslashes must be
// escaped first, otherwise the backslashes introduced while escaping quotes
// would themselves get escaped on a second pass.
func appleScriptQuote(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, `"`, `\"`)
	return `"` + s + `"`
}
