import { signal } from '@preact/signals'
import { api, pkgKey, UserData } from '../lib/api'

// Module-level signal store for favorites, tags, notes and snoozes. The
// read helpers below all read `userDataSignal.value`, so calling one inside
// a useComputed or useSignalEffect subscribes to user data changes. That's
// what lets Updates' snoozed split and Installed's favorites filter be
// computeds instead of memos with hand-kept dependency lists.
//
// The file keeps its old name so .storybook/main.ts can keep aliasing it to
// the inert mock in .storybook/mocks/UserDataContext.tsx.
export const userDataSignal = signal<UserData | null>(null)

export function refreshUserData() {
  api
    .getUserData()
    .then((v) => (userDataSignal.value = v))
    .catch(() => {})
}

let loadStarted = false

/** Loads user data once, for the life of the app. Called from App on mount. */
export function startUserDataLoad() {
  if (loadStarted) return
  loadStarted = true
  refreshUserData()
}

export function isFavorite(name: string, isCask: boolean) {
  return !!userDataSignal.value?.favorites?.[pkgKey(name, isCask)]
}

async function toggleFavorite(name: string, isCask: boolean) {
  await api.toggleFavorite(name, isCask)
  refreshUserData()
}

function tagsFor(name: string, isCask: boolean) {
  return userDataSignal.value?.tags?.[pkgKey(name, isCask)] ?? []
}

async function setTags(name: string, isCask: boolean, tags: string[]) {
  await api.setTags(name, isCask, tags)
  refreshUserData()
}

function noteFor(name: string, isCask: boolean) {
  return userDataSignal.value?.notes?.[pkgKey(name, isCask)] ?? ''
}

async function setNote(name: string, isCask: boolean, note: string) {
  await api.setNote(name, isCask, note)
  refreshUserData()
}

export function snoozedUntil(name: string, isCask: boolean) {
  const iso = userDataSignal.value?.snoozed?.[pkgKey(name, isCask)]
  if (!iso) return null
  const d = new Date(iso)
  return d.getTime() > Date.now() ? d : null
}

async function snooze(name: string, isCask: boolean, days: number) {
  await api.snoozePackage(name, isCask, days)
  refreshUserData()
}

async function unsnooze(name: string, isCask: boolean) {
  await api.unsnoozePackage(name, isCask)
  refreshUserData()
}

export function useUserData() {
  const data = userDataSignal.value
  return {
    data,
    refresh: refreshUserData,
    isFavorite,
    toggleFavorite,
    tagsFor,
    setTags,
    noteFor,
    setNote,
    snoozedUntil,
    snooze,
    unsnooze,
    allTags: Array.from(new Set(Object.values(data?.tags ?? {}).flat())).sort(),
  }
}
