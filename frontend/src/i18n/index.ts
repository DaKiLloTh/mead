import i18n, { type i18n as I18nInstance } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en/translation.json'
import de from './locales/de/translation.json'
import { fetchSystemLocale } from './systemLocale'

/**
 * Every locale that actually has a translation resource. Adding a new
 * language is: drop `locales/<code>/translation.json` (copy en's, translate
 * the values, keep every key) next to this one, add it to this map, and it
 * shows up everywhere automatically -- no component changes required, since
 * every user-visible string in the app is already routed through `t()`.
 */
export const resources = {
  en: { translation: en },
  de: { translation: de },
} as const

export const supportedLngs = Object.keys(resources)

/**
 * Locales that read right-to-left (Arabic, Yiddish, ...). Kept as its own
 * set rather than inferred from the language tag, since a handful of
 * locales genuinely need this and a hardcoded list is unambiguous --
 * `applyDocumentDirection` below is the only thing that reads it.
 */
const rtlLngs = new Set<string>([])

/**
 * Sets `<html lang dir>` to match the active language, including the
 * text-flow direction for right-to-left locales. i18next doesn't touch the
 * DOM itself, so this has to be wired up explicitly; called once after init
 * and again on every `languageChanged` event so switching languages (e.g.
 * from Settings) flips direction immediately without a reload.
 */
function applyDocumentDirection(lng: string): void {
  document.documentElement.lang = lng
  document.documentElement.dir = rtlLngs.has(lng) ? 'rtl' : 'ltr'
}

let initPromise: Promise<I18nInstance> | null = null

/**
 * Initializes i18next exactly once (subsequent calls return the same
 * promise) and resolves once it's ready to render.
 *
 * Initial language, most to least trusted:
 *   1. A language the user explicitly picked in a previous session --
 *      cached to localStorage by i18next-browser-languagedetector.
 *   2. The real macOS system locale, read via the Go backend
 *      (`fetchSystemLocale`) -- wired in below as a custom
 *      language-detector plugin so it takes part in the same detection
 *      pipeline as the built-in ones.
 *   3. Browser-based detection (`navigator.language`), for when the Go
 *      call isn't available (e.g. the frontend running outside the Wails
 *      shell, such as a plain `vite dev`).
 *   4. English -- the only locale guaranteed to exist.
 * `supportedLngs` + `nonExplicitSupportedLngs` mean a detected tag that
 * isn't an exact match (e.g. system locale "fr-CA" once only "fr" exists)
 * still resolves to its base language instead of falling through to
 * English unnecessarily.
 */
export function initI18n(): Promise<I18nInstance> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    const systemLocale = await fetchSystemLocale()

    const languageDetector = new LanguageDetector()
    languageDetector.addDetector({
      name: 'wailsSystemLocale',
      lookup() {
        return systemLocale ?? undefined
      },
    })

    await i18n
      .use(languageDetector)
      .use(initReactI18next)
      .init({
        resources,
        fallbackLng: 'en',
        supportedLngs,
        nonExplicitSupportedLngs: true,
        detection: {
          order: ['localStorage', 'wailsSystemLocale', 'navigator'],
          caches: ['localStorage'],
        },
        interpolation: {
          // React already escapes interpolated values when rendering.
          escapeValue: false,
        },
        returnEmptyString: false,
      })

    applyDocumentDirection(i18n.language)
    i18n.on('languageChanged', applyDocumentDirection)

    return i18n
  })()

  return initPromise
}

export default i18n
