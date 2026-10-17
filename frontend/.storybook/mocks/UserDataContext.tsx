// Storybook stand-in for ../../src/context/UserDataContext.tsx (see
// JobsContext.tsx in this same directory for why these mocks exist).
import { signal } from '@preact/signals'
import type { UserData } from '../../src/lib/api'

export const userDataSignal = signal<UserData | null>(null)
export const isFavorite = () => false
export const snoozedUntil = () => null
export function refreshUserData() {}
export function startUserDataLoad() {}

export function useUserData() {
  return {
    data: null,
    refresh: () => {},
    isFavorite: () => false,
    toggleFavorite: async () => {},
    tagsFor: () => [] as string[],
    setTags: async () => {},
    noteFor: () => '',
    setNote: async () => {},
    snoozedUntil: () => null,
    snooze: async () => {},
    unsnooze: async () => {},
    allTags: [] as string[],
  }
}
