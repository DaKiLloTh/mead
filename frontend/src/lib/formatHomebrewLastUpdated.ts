import type { TFunction } from 'i18next'
import { relativeTimeFrom } from './relativeTime'

// Maps the pure relativeTimeFrom bucket to a translated string. Not itself
// pure (reads the current time and an i18n TFunction), so it isn't unit
// tested directly -- the bucketing logic it delegates to (relativeTimeFrom)
// is, in lib/relativeTime.test.ts. See issue #77.
//
// Shared between Dashboard's own indicator and the global top-bar refresh
// icon's tooltip (see issue #89), so it lives here instead of in either
// call site.
export function formatHomebrewLastUpdated(t: TFunction, homebrewLastUpdated: string): string {
  const rel = relativeTimeFrom(homebrewLastUpdated, new Date())
  switch (rel.unit) {
    case 'unknown':
      return t('common.lastUpdatedUnknown')
    case 'justNow':
      return t('common.lastUpdatedJustNow')
    case 'minutes':
      return t('common.lastUpdatedMinutesAgo', { count: rel.count })
    case 'hours':
      return t('common.lastUpdatedHoursAgo', { count: rel.count })
    case 'days':
      return t('common.lastUpdatedDaysAgo', { count: rel.count })
  }
}
