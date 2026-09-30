package jobs

import (
	"path/filepath"
	"regexp"
	"strings"
)

// BuildElevatedShellScript returns the AppleScript source to hand to
// `osascript -e` so that argv runs as root -- via macOS's native
// Touch-ID-or-password authorization prompt (`do shell script "..." with
// administrator privileges`), without mead implementing anything
// Touch-ID-specific itself. prompt is shown in that dialog, so the user sees
// what they are authorizing.
//
// This is only ever used to run small, fixed system tools (rm), never brew.
// Homebrew refuses to run as root: brew.sh's check-run-command-as-root aborts
// every command outside a short allowlist (as-console-user, setup-sandbox,
// services, --prefix) with "Running Homebrew as root is extremely dangerous
// and no longer supported", and `uninstall` is not on it. An earlier version
// wrapped the whole `brew uninstall` in this, so the password prompt
// succeeded and brew then refused to run (issue #101).
//
// argv is the command and its arguments. Each element is shell-quoted
// individually -- via shellQuoteArg -- so it can safely contain arbitrary
// characters (quotes, spaces, shell metacharacters) without being
// interpreted by the /bin/sh that `do shell script` re-enters, and the
// resulting shell command is then escaped a second time -- via
// appleScriptQuote -- so it can be embedded as a double-quoted AppleScript
// string literal. Both layers matter: skip the shell layer and a value like
// `a; rm -rf /` becomes a second command; skip the AppleScript layer and a
// literal `"` in the (already shell-quoted) command breaks out of the
// AppleScript string early. prompt goes through the AppleScript layer only.
//
// The command's stderr is redirected into stdout (`2>&1`) so that whichever
// half of `do shell script`'s output osascript hands back -- the return
// value on success, or the error message on failure -- carries the combined
// output, not just one stream.
func BuildElevatedShellScript(argv []string, prompt string) string {
	words := make([]string, 0, len(argv))
	for _, a := range argv {
		words = append(words, shellQuoteArg(a))
	}
	shellCmd := strings.Join(words, " ") + " 2>&1"
	return "do shell script " + appleScriptQuote(shellCmd) +
		" with prompt " + appleScriptQuote(prompt) + " with administrator privileges"
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

// sudoOwnershipPathRe matches the line Homebrew's cask uninstall prints when
// removing a path needs root: Cask::Utils.gain_permissions in
// Library/Homebrew/cask/utils.rb does `ohai "Using sudo to gain ownership of
// path '#{path}'"` and then tries `sudo chown` with no terminal to ask on.
// This is how mead finds out which specific paths are blocking the uninstall
// instead of guessing.
var sudoOwnershipPathRe = regexp.MustCompile(`Using sudo to gain ownership of path '([^']+)'`)

// sudoOwnershipPaths returns the paths Homebrew said it needed sudo for, in
// the order first mentioned, without duplicates.
func sudoOwnershipPaths(output string) []string {
	seen := map[string]bool{}
	var paths []string
	for _, m := range sudoOwnershipPathRe.FindAllStringSubmatch(output, -1) {
		if p := m[1]; !seen[p] {
			seen[p] = true
			paths = append(paths, p)
		}
	}
	return paths
}

// elevatedRemoveRoots are the only places mead will remove anything as root:
// the system-wide locations casks install outside Homebrew's own prefix.
var elevatedRemoveRoots = []string{"/Library", "/Applications", "/usr/local", "/opt"}

// elevatedRemoveKeep are shared containers directly under those roots that
// hold other software's files. A cask's own files live inside them, never the
// container itself, so removing one as root is never right.
var elevatedRemoveKeep = map[string]bool{
	"/Library/Application Support":      true,
	"/Library/Caches":                   true,
	"/Library/Extensions":               true,
	"/Library/Fonts":                    true,
	"/Library/Frameworks":               true,
	"/Library/Internet Plug-Ins":        true,
	"/Library/Java/JavaVirtualMachines": true,
	"/Library/LaunchAgents":             true,
	"/Library/LaunchDaemons":            true,
	"/Library/Logs":                     true,
	"/Library/Preferences":              true,
	"/Library/PrivilegedHelperTools":    true,
	"/usr/local/Cellar":                 true,
	"/usr/local/bin":                    true,
	"/usr/local/etc":                    true,
	"/usr/local/include":                true,
	"/usr/local/lib":                    true,
	"/usr/local/share":                  true,
	"/usr/local/var":                    true,
}

// elevatedRemoveAllowed reports whether mead may remove p as root. The path
// comes from Homebrew's own output, and Homebrew would `sudo rm` it itself in
// a terminal, but a third-party tap's cask names its own paths, so this only
// lets through an absolute, already-clean path strictly inside one of the
// system-wide roots and never a shared container or a top-level directory.
func elevatedRemoveAllowed(p string) bool {
	if !filepath.IsAbs(p) || filepath.Clean(p) != p || strings.ContainsRune(p, 0) {
		return false
	}
	if elevatedRemoveKeep[p] {
		return false
	}
	for _, root := range elevatedRemoveRoots {
		rel, ok := strings.CutPrefix(p, root+"/")
		if !ok || rel == "" {
			continue
		}
		// Anything directly under /Library is one of macOS's own folders.
		if root == "/Library" && !strings.Contains(rel, "/") {
			return false
		}
		return true
	}
	return false
}

// removeCommand builds the `rm -Rf -- <path>` shell command for each path,
// joined with ";" so one failing removal does not stop the rest, and
// shell-quotes each path so it can contain spaces or other metacharacters
// (a real path like "/Library/Application Support/SomeApp"). -R -f -- is the
// same removal Homebrew itself runs under sudo.
func removeCommand(paths []string) string {
	cmds := make([]string, len(paths))
	for i, p := range paths {
		cmds[i] = "/bin/rm -Rf -- " + shellQuoteArg(p)
	}
	return strings.Join(cmds, " ; ")
}

// buildElevatedRemoveScript is the AppleScript that removes every path as
// root behind a single password prompt that names them.
func buildElevatedRemoveScript(paths []string) string {
	prompt := "mead needs administrator permission to remove: " + strings.Join(paths, ", ")
	return BuildElevatedShellScript([]string{"/bin/sh", "-c", removeCommand(paths)}, prompt)
}

// elevationDeclined reports whether osascript's output says the user
// dismissed the authorization dialog: AppleScript error -128, "User canceled".
func elevationDeclined(output string) bool {
	return strings.Contains(output, "(-128)") || strings.Contains(strings.ToLower(output), "user canceled")
}
