import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, pkgKey, UserData } from '../lib/api'

interface UserDataContextValue {
  data: UserData | null
  refresh: () => void
  isFavorite: (name: string, isCask: boolean) => boolean
  toggleFavorite: (name: string, isCask: boolean) => Promise<void>
  tagsFor: (name: string, isCask: boolean) => string[]
  setTags: (name: string, isCask: boolean, tags: string[]) => Promise<void>
  noteFor: (name: string, isCask: boolean) => string
  setNote: (name: string, isCask: boolean, note: string) => Promise<void>
  snoozedUntil: (name: string, isCask: boolean) => Date | null
  snooze: (name: string, isCask: boolean, days: number) => Promise<void>
  unsnooze: (name: string, isCask: boolean) => Promise<void>
  allTags: string[]
}

const UserDataContext = createContext<UserDataContextValue | null>(null)

export function useUserData(): UserDataContextValue {
  const ctx = useContext(UserDataContext)
  if (!ctx) throw new Error('useUserData must be used within a UserDataProvider')
  return ctx
}

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<UserData | null>(null)

  const refresh = useCallback(() => {
    api.getUserData().then(setData).catch(() => {})
  }, [])

  useEffect(refresh, [refresh])

  const isFavorite = useCallback(
    (name: string, isCask: boolean) => !!data?.favorites?.[pkgKey(name, isCask)],
    [data]
  )

  const toggleFavorite = useCallback(
    async (name: string, isCask: boolean) => {
      await api.toggleFavorite(name, isCask)
      refresh()
    },
    [refresh]
  )

  const tagsFor = useCallback(
    (name: string, isCask: boolean) => data?.tags?.[pkgKey(name, isCask)] ?? [],
    [data]
  )

  const setTags = useCallback(
    async (name: string, isCask: boolean, tags: string[]) => {
      await api.setTags(name, isCask, tags)
      refresh()
    },
    [refresh]
  )

  const noteFor = useCallback(
    (name: string, isCask: boolean) => data?.notes?.[pkgKey(name, isCask)] ?? '',
    [data]
  )

  const setNote = useCallback(
    async (name: string, isCask: boolean, note: string) => {
      await api.setNote(name, isCask, note)
      refresh()
    },
    [refresh]
  )

  const snoozedUntil = useCallback(
    (name: string, isCask: boolean) => {
      const iso = data?.snoozed?.[pkgKey(name, isCask)]
      if (!iso) return null
      const d = new Date(iso)
      return d.getTime() > Date.now() ? d : null
    },
    [data]
  )

  const snooze = useCallback(
    async (name: string, isCask: boolean, days: number) => {
      await api.snoozePackage(name, isCask, days)
      refresh()
    },
    [refresh]
  )

  const unsnooze = useCallback(
    async (name: string, isCask: boolean) => {
      await api.unsnoozePackage(name, isCask)
      refresh()
    },
    [refresh]
  )

  const allTags = Array.from(new Set(Object.values(data?.tags ?? {}).flat())).sort()

  const value: UserDataContextValue = {
    data,
    refresh,
    isFavorite,
    toggleFavorite,
    tagsFor,
    setTags,
    noteFor,
    setNote,
    snoozedUntil,
    snooze,
    unsnooze,
    allTags,
  }

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>
}
