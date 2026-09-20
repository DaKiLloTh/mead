import { api } from './api'
import { useJobs } from '../context/JobsContext'
import { useConfirm } from '../context/ConfirmContext'
import { uninstallWithElevationRetry, type ElevationPrompt, type UninstallTarget } from './uninstallElevation'

/**
 * Binds uninstallWithElevationRetry to the app's job runner, confirm dialog
 * and API. The pure flow lives in uninstallElevation.ts where it is tested.
 */
export function useUninstall() {
  const { runAction } = useJobs()
  const confirm = useConfirm()
  return (target: UninstallTarget, prompt: ElevationPrompt) =>
    uninstallWithElevationRetry(
      { runAction, confirm, uninstall: api.uninstall, uninstallElevated: api.uninstallElevated },
      target,
      prompt
    )
}
