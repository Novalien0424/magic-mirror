import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STUDIO_CONSOLE_CHANNEL } from '../../src/shared/portrait-studio'

// Sandboxed preloads can require only `electron`. A local module imported at
// runtime by both preloads becomes a shared Rollup chunk that each preload must
// require, which throws at load (found in the Portrait Studio deploy QA).
function runtimeClosure(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen
  seen.add(entry)
  const source = readFileSync(entry, 'utf8')
  for (const match of source.matchAll(/^import\s+(?!type\b)[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
    const base = resolve(dirname(entry), match[1]!)
    const file = [base + '.ts', base + '.tsx', base].find(path => { try { readFileSync(path); return true } catch { return false } })
    if (file && /\.tsx?$/.test(file)) runtimeClosure(file, seen)
  }
  return seen
}

describe('preload bundles', () => {
  it('share no runtime module, so Rollup emits no chunk a sandboxed preload would have to require', () => {
    const mirror = runtimeClosure(resolve('src/preload/mirror.ts'))
    const consolePreload = runtimeClosure(resolve('src/preload/console.ts'))
    const shared = [...consolePreload].filter(file => mirror.has(file))
    expect(shared).toEqual([])
  })

  it('uses the shared Studio Console channel name', () => {
    expect(readFileSync('src/preload/console.ts', 'utf8')).toContain(`'${STUDIO_CONSOLE_CHANNEL}'`)
  })
})
