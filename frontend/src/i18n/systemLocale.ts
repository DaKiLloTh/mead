import { api } from '../lib/api'

/**
 * Best-effort fetch of the user's real macOS system locale (e.g. "en-US"),
 * via the Go backend's `SystemLocale` method (`internal/system.SystemLocale`
 * on the Go side).
 *
 * Why not just use the browser's `navigator.language`? This app's frontend
 * runs inside a Wails-managed WKWebView, not a real browser. WKWebView
 * doesn't reliably surface the user's actual System Settings > General >
 * Language & Region preference through `navigator.language` the way Safari
 * or Chrome do -- depending on how the webview was initialized it can lag
 * behind the system setting, or simply report "en-US" regardless of it. The
 * Go backend can read the same `AppleLocale` preference macOS itself uses,
 * so it's the more trustworthy source here. `i18n/index.ts` still falls
 * back to `i18next-browser-languagedetector`'s browser-based detection if
 * this call fails or comes back empty -- e.g. when running the frontend
 * standalone (`vite dev`) with no Wails/Go backend attached at all.
 *
 * Never throws.
 */
export async function fetchSystemLocale(): Promise<string | null> {
  try {
    const locale = await api.systemLocale()
    const trimmed = locale?.trim()
    return trimmed ? trimmed : null
  } catch {
    return null
  }
}
