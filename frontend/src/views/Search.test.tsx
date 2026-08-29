// @vitest-environment happy-dom
//
// Component-rendering test using @testing-library/preact, exercising the
// actual async/timing behavior of Search's debounce + out-of-order-response
// guard -- not just the pure logic, but the real effect/render cycle.
//
// The scenario this proves (confirmed against the exact case discussed):
// three searches are issued in order 1, 2, 3, but their responses arrive
// out of order -- 1, then 3, then 2. Response 2 must be dropped (it's
// older than the already-applied response 3), leaving response 3's
// results on screen.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/preact'
import type { SearchResult } from '../lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts && 'count' in opts ? `${key}:${opts.count}` : key),
  }),
}))

vi.mock('../context/JobsContext', () => ({
  useJobs: () => ({ runAction: vi.fn(), notify: vi.fn() }),
}))

vi.mock('../context/ConfirmContext', () => ({
  useConfirm: () => vi.fn(async () => ({ ok: false, checked: [] })),
}))

vi.mock('../context/UserDataContext', () => ({
  useUserData: () => ({
    data: null,
    refresh: vi.fn(),
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
    tagsFor: () => [],
    setTags: vi.fn(),
    noteFor: () => '',
    setNote: vi.fn(),
    snoozedUntil: () => null,
    snooze: vi.fn(),
    unsnooze: vi.fn(),
    allTags: [],
  }),
}))

const searchMock = vi.fn()
const listInstalledMock = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    search: (...args: unknown[]) => searchMock(...args),
    listInstalled: (...args: unknown[]) => listInstalledMock(...args),
  },
}))

/** A promise plus its own resolve function, so a test can control exactly when and in what order each search "arrives". */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function result(name: string): SearchResult {
  return {
    name,
    isCask: false,
    desc: '',
    homepage: '',
    version: '',
    tap: 'homebrew/core',
    deprecated: false,
    disabled: false,
    autoUpdates: false,
  } as SearchResult
}

async function typeQuery(input: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.input(input, { target: { value } })
  })
}

describe('Search: out-of-order response guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchMock.mockReset()
    listInstalledMock.mockReset()
    listInstalledMock.mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('drops a stale response that arrives after a newer one was already applied (issued 1,2,3 -- arrives 1,3,2)', async () => {
    const Search = (await import('./Search')).default

    const d1 = deferred<SearchResult[]>()
    const d2 = deferred<SearchResult[]>()
    const d3 = deferred<SearchResult[]>()
    searchMock.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise).mockReturnValueOnce(d3.promise)

    render(<Search refreshToken={0} bump={vi.fn()} />)
    const input = screen.getByPlaceholderText('search.placeholder') as HTMLInputElement

    // Issue query 1, let its debounce elapse so the request actually fires.
    await typeQuery(input, '1')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(searchMock).toHaveBeenCalledTimes(1)

    // Issue query 2 before query 1's response has arrived.
    await typeQuery(input, '2')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(searchMock).toHaveBeenCalledTimes(2)

    // Issue query 3 before query 2's response has arrived either.
    await typeQuery(input, '3')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(searchMock).toHaveBeenCalledTimes(3)

    // Resolve out of issue order: 1, then 3, then 2.
    await act(async () => {
      d1.resolve([result('result-for-1')])
    })
    expect(screen.getByText('result-for-1')).toBeTruthy()

    await act(async () => {
      d3.resolve([result('result-for-3')])
    })
    expect(screen.getByText('result-for-3')).toBeTruthy()
    expect(screen.queryByText('result-for-1')).toBeNull()

    // Response 2 arrives last, after response 3 already applied -- it must
    // be dropped, leaving response 3's result on screen.
    await act(async () => {
      d2.resolve([result('result-for-2')])
    })
    expect(screen.queryByText('result-for-2')).toBeNull()
    expect(screen.getByText('result-for-3')).toBeTruthy()
  })

  it('applies each response as it arrives when nothing newer has resolved yet (progressive, not hard-cancelled)', async () => {
    const Search = (await import('./Search')).default

    const d1 = deferred<SearchResult[]>()
    searchMock.mockReturnValueOnce(d1.promise)

    render(<Search refreshToken={0} bump={vi.fn()} />)
    const input = screen.getByPlaceholderText('search.placeholder') as HTMLInputElement

    await typeQuery(input, 'arduino')
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(searchMock).toHaveBeenCalledTimes(1)

    // The single in-flight request's own response renders as soon as it
    // resolves -- nothing about issuing it should have blocked that.
    await act(async () => {
      d1.resolve([result('arduino-cli'), result('arduino-ide')])
    })
    expect(screen.getByText('arduino-cli')).toBeTruthy()
    expect(screen.getByText('arduino-ide')).toBeTruthy()
  })
})
