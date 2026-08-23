import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createInstance, type i18n as I18nInstance } from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import en from './locales/en/translation.json'

const enPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'locales/en/translation.json')

/**
 * Minimal duplicate-object-key detector for the resource file's actual
 * shape: a plain nested-object tree of string leaves, no arrays. `JSON.parse`
 * silently keeps only the *last* occurrence of a duplicate key, so it can't
 * catch a copy/paste mistake that redefines a key -- this walks the raw
 * text instead, tracking string/escape state so braces and colons that
 * appear inside string values (e.g. the literal "{{count}}" interpolation
 * markers) aren't mistaken for structural JSON.
 */
function findDuplicateKeys(text: string): string[] {
  const duplicates: string[] = []
  const seenStack: Set<string>[] = []
  let expectingKey = false
  let i = 0
  const n = text.length

  function readString(): string {
    let result = ''
    i++ // opening quote
    while (i < n) {
      const c = text[i]
      if (c === '\\') {
        result += text.slice(i, i + 2)
        i += 2
        continue
      }
      if (c === '"') {
        i++
        return result
      }
      result += c
      i++
    }
    return result
  }

  while (i < n) {
    const c = text[i]
    if (c === '"') {
      const str = readString()
      let j = i
      while (j < n && /\s/.test(text[j])) j++
      const isKey = expectingKey && seenStack.length > 0 && text[j] === ':'
      if (isKey) {
        const seen = seenStack[seenStack.length - 1]
        if (seen.has(str)) duplicates.push(str)
        else seen.add(str)
        expectingKey = false
      }
      continue
    }
    if (c === '{') {
      seenStack.push(new Set())
      expectingKey = true
      i++
      continue
    }
    if (c === '}') {
      seenStack.pop()
      expectingKey = false
      i++
      continue
    }
    if (c === ',') {
      if (seenStack.length > 0) expectingKey = true
      i++
      continue
    }
    if (c === ':') {
      expectingKey = false
      i++
      continue
    }
    i++
  }
  return duplicates
}

/** Recursively collects every leaf value's dotted key path and its value. */
function collectLeaves(obj: unknown, prefix = ''): [string, unknown][] {
  if (obj === null || typeof obj !== 'object') return [[prefix, obj]]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    collectLeaves(v, prefix ? `${prefix}.${k}` : k)
  )
}

describe('duplicate-key detector self-test', () => {
  it('finds a duplicate key at the same nesting level', () => {
    const text = '{"a": {"b": 1, "b": 2}}'
    expect(findDuplicateKeys(text)).toEqual(['b'])
  })

  it('does not flag the same key name reused at different nesting levels', () => {
    const text = '{"a": {"name": 1}, "b": {"name": 2}}'
    expect(findDuplicateKeys(text)).toEqual([])
  })

  it('is not confused by braces/colons embedded inside string values', () => {
    const text = '{"a": "Scanned {{count}} formulae: {{other}}", "a2": "fine"}'
    expect(findDuplicateKeys(text)).toEqual([])
  })
})

describe('en translation resource file', () => {
  const raw = readFileSync(enPath, 'utf-8')

  it('is valid, parseable JSON', () => {
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('has no duplicate keys anywhere in the tree', () => {
    expect(findDuplicateKeys(raw)).toEqual([])
  })

  it('has no empty-string leaf values', () => {
    const empties = collectLeaves(en)
      .filter(([, v]) => typeof v === 'string' && v.trim() === '')
      .map(([k]) => k)
    expect(empties).toEqual([])
  })

  it('has only string leaves (no stray numbers/booleans/nulls/arrays)', () => {
    const nonStrings = collectLeaves(en)
      .filter(([, v]) => typeof v !== 'string')
      .map(([k]) => k)
    expect(nonStrings).toEqual([])
  })

  it('includes every top-level view/component namespace the app uses', () => {
    const expectedNamespaces = [
      'common',
      'nav',
      'app',
      'dashboard',
      'installed',
      'search',
      'collections',
      'updates',
      'applications',
      'taps',
      'services',
      'adopt',
      'appstore',
      'security',
      'maintenance',
      'history',
      'settings',
      'packageDetail',
      'jobConsole',
      'confirmDialog',
      'commandPalette',
    ]
    expect(Object.keys(en).sort()).toEqual(expectedNamespaces.sort())
  })
})

describe('t() resolution against the en resource', () => {
  let instance: I18nInstance

  beforeAll(async () => {
    instance = createInstance()
    await instance.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    })
  })

  it('resolves a plain key', () => {
    expect(instance.t('installed.title')).toBe('Installed')
  })

  it('resolves a nested key', () => {
    expect(instance.t('nav.items.appstore')).toBe('App Store')
  })

  it('interpolates a variable', () => {
    expect(instance.t('packageDetail.removeTagAriaLabel', { tag: 'cli-tools' })).toBe('Remove tag cli-tools')
  })

  it('interpolates multiple variables', () => {
    expect(instance.t('security.scanSummary', { count: 42, affectedCount: 3 })).toBe(
      'Scanned 42 formulae, 3 with known advisories'
    )
  })

  it('pluralizes singular vs. plural counts', () => {
    expect(instance.t('installed.subtitleCount', { count: 1 })).toBe('1 package installed')
    expect(instance.t('installed.subtitleCount', { count: 5 })).toBe('5 packages installed')
    expect(instance.t('updates.subtitleCanUpgrade', { count: 1 })).toBe('1 package can be upgraded')
    expect(instance.t('updates.subtitleCanUpgrade', { count: 0 })).toBe('0 packages can be upgraded')
  })

  it('falls back to the key itself for a missing translation, never throwing', () => {
    expect(() => instance.t('nonexistent.key.path')).not.toThrow()
  })
})
