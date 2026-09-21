/**
 * The deep link that opens a Mac App Store app's own page in the App Store
 * app. `id` is mas's numeric app id (MasApp.ID). Returns null for anything
 * that isn't all digits, so a malformed id can never turn into an arbitrary
 * URL handed to the OS.
 */
export function appStoreUrl(id: string): string | null {
  return /^\d+$/.test(id) ? `macappstore://apps.apple.com/app/id${id}` : null
}
