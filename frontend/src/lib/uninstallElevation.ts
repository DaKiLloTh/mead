/**
 * Detects the one specific `brew uninstall` failure this app offers a
 * privileged retry for: sudo refusing to run because mead launches brew as
 * a plain background subprocess with no attached terminal, so sudo has
 * nowhere to prompt for a password. This happens for casks that place files
 * outside Homebrew's own prefix -- e.g. a JDK installed under
 * /Library/Java/JavaVirtualMachines -- where Homebrew's own cask uninstall
 * shells out to `sudo rm ...` to remove them, and that sudo call is what
 * fails (see issue #79).
 *
 * Deliberately narrow: matched only against sudo's own diagnostic text, not
 * "any uninstall failure", so an unrelated failure (package in use, network
 * error, dependency conflict, etc.) never offers an elevation retry that
 * wouldn't help.
 */
const SUDO_TERMINAL_REQUIRED_PATTERNS = [
  'sudo: a terminal is required to read the password',
  'sudo: a password is required',
]

export function isSudoTerminalRequiredFailure(lines: { text: string }[]): boolean {
  return lines.some((line) => SUDO_TERMINAL_REQUIRED_PATTERNS.some((pattern) => line.text.includes(pattern)))
}
