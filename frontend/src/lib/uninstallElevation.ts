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

export interface UninstallTarget {
  name: string
  isCask: boolean
  zap: boolean
  force?: boolean
}

export interface ElevationPrompt {
  title: string
  body: string
  confirmLabel: string
}

export interface UninstallDeps {
  runAction: (action: () => Promise<string>) => Promise<{ status: string; lines: { text: string }[] }>
  confirm: (opts: ElevationPrompt) => Promise<{ ok: boolean }>
  uninstall: (name: string, isCask: boolean, zap?: boolean, force?: boolean) => Promise<string>
  uninstallElevated: (name: string, isCask: boolean, zap?: boolean, force?: boolean) => Promise<string>
}

/**
 * Runs the uninstall job and, only when it failed with the sudo-needs-a-
 * terminal error, asks the user whether to retry with administrator
 * privileges and does so on a yes. Shared by the Installed row action and the
 * package detail modal, which each had their own copy of this flow. Returns
 * true when the elevated retry ran.
 */
export async function uninstallWithElevationRetry(
  deps: UninstallDeps,
  target: UninstallTarget,
  prompt: ElevationPrompt
): Promise<boolean> {
  const { name, isCask, zap, force } = target
  const job = await deps.runAction(() => deps.uninstall(name, isCask, zap, force))
  if (job.status !== 'error' || !isSudoTerminalRequiredFailure(job.lines)) return false
  const retry = await deps.confirm(prompt)
  if (!retry.ok) return false
  await deps.runAction(() => deps.uninstallElevated(name, isCask, zap, force))
  return true
}
