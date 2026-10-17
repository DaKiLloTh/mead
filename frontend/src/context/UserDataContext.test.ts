import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed } from '@preact/signals'
import type { UserData } from '../lib/api'

const getUserData = vi.fn()
const toggleFavorite = vi.fn(async () => {})
vi.mock('../lib/api', () => ({
  pkgKey: (name: string, isCask: boolean) => `${isCask ? 'cask' : 'formula'}:${name}`,
  api: {
    getUserData: () => getUserData(),
    toggleFavorite: (...a: unknown[]) => (toggleFavorite as (...x: unknown[]) => Promise<void>)(...a),
  },
}))

import { isFavorite, snoozedUntil, startUserDataLoad, userDataSignal, useUserData } from './UserDataContext'

function data(overrides: Partial<UserData>): UserData {
  return { favorites: {}, tags: {}, notes: {}, snoozed: {}, ...overrides } as UserData
}

afterEach(() => {
  userDataSignal.value = null
  getUserData.mockReset()
})

describe('UserDataContext store', () => {
  it('loads once, however many times start is called', async () => {
    getUserData.mockResolvedValue(data({ favorites: { 'formula:wget': true } }))
    startUserDataLoad()
    startUserDataLoad()
    await vi.waitFor(() => expect(userDataSignal.value).not.toBeNull())
    expect(getUserData).toHaveBeenCalledTimes(1)
    expect(isFavorite('wget', false)).toBe(true)
  })

  it('makes a computed that calls its helpers recompute when user data changes', () => {
    const favourite = computed(() => isFavorite('wget', false))
    expect(favourite.value).toBe(false)

    userDataSignal.value = data({ favorites: { 'formula:wget': true } })

    expect(favourite.value).toBe(true)
  })

  it('only reports a snooze that has not expired', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const past = new Date(Date.now() - 86_400_000).toISOString()
    userDataSignal.value = data({ snoozed: { 'formula:a': future, 'formula:b': past } })

    expect(snoozedUntil('a', false)?.toISOString()).toBe(future)
    expect(snoozedUntil('b', false)).toBeNull()
    expect(snoozedUntil('c', false)).toBeNull()
  })

  it('refetches after a write so the change shows up', async () => {
    getUserData.mockResolvedValue(data({ favorites: { 'cask:iterm2': true } }))
    await useUserData().toggleFavorite('iterm2', true)

    expect(toggleFavorite).toHaveBeenCalledWith('iterm2', true)
    await vi.waitFor(() => expect(isFavorite('iterm2', true)).toBe(true))
  })

  it('collects every tag once, sorted', () => {
    userDataSignal.value = data({ tags: { 'formula:a': ['web', 'cli'], 'formula:b': ['cli'] } })
    expect(useUserData().allTags).toEqual(['cli', 'web'])
  })
})
