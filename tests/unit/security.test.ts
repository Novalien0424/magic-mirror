import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const MIRROR_HTML_URL = new URL('../../src/renderer/mirror/index.html', import.meta.url)
const CONSOLE_HTML_URL = new URL('../../src/renderer/console/index.html', import.meta.url)

function readDirective(url: URL, name: string): string[] {
  const html = readFileSync(url, 'utf8')
  const csp = html.match(/http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"/i)?.[1]
  expect(csp).toBeDefined()
  const directive = csp?.split(';').map((value) => value.trim())
    .find((value) => value.toLowerCase().startsWith(name.toLowerCase() + ' '))
  expect(directive).toBeDefined()
  return directive?.split(/\s+/).slice(1) ?? []
}

function readMirrorConnectSource(): string[] {
  const html = readFileSync(MIRROR_HTML_URL, 'utf8')
  const cspMeta = html.match(
    /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content="([^"]+)"[^>]*>/i,
  )

  expect(cspMeta).not.toBeNull()

  const connectSource = cspMeta?.[1]
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.toLowerCase().startsWith('connect-src '))

  expect(connectSource).toBeDefined()
  return connectSource?.split(/\s+/).slice(1) ?? []
}

describe('mirror renderer security policy', () => {
  test('allows only the loopback endpoints and the production Realtime origin', () => {
    const connectSource = readMirrorConnectSource()
    const expectedConnectSource = [
      "'self'",
      'magic-mirror-media:',
      'ws://localhost:*',
      'http://localhost:*',
      'ws://127.0.0.1:*',
      'http://127.0.0.1:*',
      'https://api.openai.com',
    ]

    expect(connectSource).toHaveLength(expectedConnectSource.length)
    expect(new Set(connectSource)).toEqual(new Set(expectedConnectSource))
    expect(connectSource).not.toContain('*')
    expect(connectSource).not.toContain('https:')
    expect(connectSource).not.toContain('wss:')
    expect(connectSource.some((token) => /https?:\/\/\*\.openai\.com$/i.test(token))).toBe(false)
  })

  test.each([
    ['Mirror image', MIRROR_HTML_URL, 'img-src'],
    ['Mirror media', MIRROR_HTML_URL, 'media-src'],
    ['Console image', CONSOLE_HTML_URL, 'img-src'],
    ['Console media', CONSOLE_HTML_URL, 'media-src'],
    ['Console probe fetch', CONSOLE_HTML_URL, 'connect-src'],
  ] as const)('%s permits only the managed media scheme in addition to its local sources', (_label, url, directive) => {
    const sources = readDirective(url, directive)
    expect(sources).toContain('magic-mirror-media:')
    expect(sources).not.toContain('*')
    expect(sources).not.toContain('file:')
    expect(sources).not.toContain('https:')
  })
})
