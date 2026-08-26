import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const MIRROR_HTML_URL = new URL('../../src/renderer/mirror/index.html', import.meta.url)

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
})
