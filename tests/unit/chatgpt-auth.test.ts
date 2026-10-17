import { describe, expect, it, vi } from 'vitest'
import * as constants from '../../src/main/chatgpt-auth/constants'
import { createChatgptTokenFile, jwtClaims, tokenFileText } from '../../src/main/chatgpt-auth/token-file'

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`
const auth = (account: string) => ({ 'https://api.openai.com/auth': { chatgpt_account_id: account } })
const NOW = Date.parse('2026-10-17T00:00:00Z')
const file = (access: string, refresh = 'refresh-1', lastRefresh = '2026-10-16T00:00:00.000Z') =>
  tokenFileText({ access, refresh, id: jwt(auth('acct-1')), accountId: 'acct-1', lastRefresh })

function harness(initial: string | null, fetchImpl?: typeof fetch, options: { failWrites?: number } = {}) {
  let text = initial
  let failWrites = options.failWrites ?? 0
  const writes: string[] = []
  const reports: string[] = []
  const source = createChatgptTokenFile({ path: '/x/.env.chatgpt', now: () => NOW, fetchImpl, report: r => reports.push(r),
    readFile: async () => { if (text === null) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return text },
    writeFile: async (_path, next) => { if (failWrites-- > 0) throw new Error('disk'); text = next; writes.push(next) } })
  return { source, writes, reports, current: () => text, replace: (next: string) => { text = next } }
}
const rotated = (refresh = 'refresh-2') => vi.fn(async () =>
  new Response(JSON.stringify({ access_token: jwt({ exp: NOW / 1000 + 7200, ...auth('acct-1') }), refresh_token: refresh })))

describe('ChatGPT token file', () => {
  it('mirrors the login script constants', async () => {
    const script = await import('../../scripts/chatgpt-login.mjs')
    expect(script.CHATGPT_CLIENT_ID).toBe(constants.CHATGPT_CLIENT_ID)
    expect(script.CHATGPT_ISSUER).toBe(constants.CHATGPT_ISSUER)
    const text = script.tokenFileText({ access_token: jwt({ exp: 1 }), refresh_token: 'r', id_token: jwt(auth('acct-9')) }, new Date(NOW))
    expect(text).toContain('CHATGPT_ACCOUNT_ID=acct-9')
    expect(text).toContain('CHATGPT_LAST_REFRESH=2026-10-17T00:00:00.000Z')
  })

  it('returns a valid token without refreshing and reports missing files as metadata', async () => {
    const valid = harness(file(jwt({ exp: NOW / 1000 + 3600, ...auth('acct-1') })))
    expect(await valid.source.get()).toMatchObject({ accountId: 'acct-1' })
    expect(valid.writes).toHaveLength(0)
    const missing = harness(null)
    expect(await missing.source.get()).toBeNull()
    expect(await missing.source.status()).toEqual({ status: 'missing' })
    expect(missing.reports).toEqual(['chatgpt_signin_missing'])
  })

  it('refreshes an expiring token once, serializes concurrent callers and rotates the refresh token', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(init!.body as string)).toEqual({ client_id: constants.CHATGPT_CLIENT_ID, grant_type: 'refresh_token', refresh_token: 'refresh-1' })
      return new Response(JSON.stringify({ access_token: jwt({ exp: NOW / 1000 + 7200, ...auth('acct-1') }), refresh_token: 'refresh-2' }))
    })
    const h = harness(file(jwt({ exp: NOW / 1000 + 60 })), fetchImpl as unknown as typeof fetch)
    const [a, b] = await Promise.all([h.source.get(), h.source.get()])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(a?.accessToken).toBe(b?.accessToken)
    expect(h.current()).toContain('CHATGPT_REFRESH_TOKEN=refresh-2')
    expect(h.reports).toContain('chatgpt_refreshed')
  })

  it('does not refresh when a newer login replaced the file, and never exposes values in reports', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 400 }))
    const h = harness(file(jwt({ exp: NOW / 1000 + 3600 }), 'refresh-new'), fetchImpl as unknown as typeof fetch)
    const fresh = await h.source.refreshAfterRejection({ accessToken: 'older-token', accountId: 'acct-1' })
    expect(fresh?.accessToken).not.toBe('older-token')
    expect(fetchImpl).not.toHaveBeenCalled()
    const failing = harness(file(jwt({ exp: NOW / 1000 - 10 })), fetchImpl as unknown as typeof fetch)
    expect(await failing.source.get()).toBeNull()
    expect(await failing.source.status()).toMatchObject({ status: 'refresh_failed' })
    expect(failing.reports.join(' ')).not.toMatch(/refresh-1|eyJ/)
  })

  it('skips the refresh when another writer rotated the file after the stale read', async () => {
    const fetchImpl = rotated()
    let reads = 0
    const newer = file(jwt({ exp: NOW / 1000 + 3600, ...auth('acct-1') }), 'refresh-other')
    const source = createChatgptTokenFile({ path: '/x/.env.chatgpt', now: () => NOW, fetchImpl: fetchImpl as unknown as typeof fetch,
      readFile: async () => (reads++ === 0 ? file(jwt({ exp: NOW / 1000 + 60 })) : newer), writeFile: async () => { throw new Error('unexpected') } })
    expect((await source.get())?.accessToken).toBe(newer.match(/CHATGPT_ACCESS_TOKEN=(\S+)/)![1])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps a valid token usable after a failed scheduled refresh and clears the failure after a new login', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }))
    const h = harness(file(jwt({ exp: NOW / 1000 + 3600 }), 'refresh-1', '2026-10-01T00:00:00.000Z'), fetchImpl as unknown as typeof fetch)
    expect(await h.source.get()).not.toBeNull()
    expect(await h.source.status()).toMatchObject({ status: 'refresh_failed' })
    h.replace(file(jwt({ exp: NOW / 1000 + 3600 }), 'refresh-login'))
    expect(await h.source.status()).toMatchObject({ status: 'signed_in' })
  })

  it('keeps rotated tokens in RAM when saving fails and saves them on the next use', async () => {
    const fetchImpl = rotated()
    const h = harness(file(jwt({ exp: NOW / 1000 + 60 })), fetchImpl as unknown as typeof fetch, { failWrites: 1 })
    const first = await h.source.get()
    expect(h.reports).toContain('chatgpt_refresh_persist_failed')
    expect(h.current()).toContain('CHATGPT_REFRESH_TOKEN=refresh-1')
    expect((await h.source.get())?.accessToken).toBe(first?.accessToken)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(h.current()).toContain('CHATGPT_REFRESH_TOKEN=refresh-2')
    expect(h.reports).toContain('chatgpt_refresh_persisted')
  })

  it('rejects a malformed rotated refresh token instead of keeping the spent one', async () => {
    const h = harness(file(jwt({ exp: NOW / 1000 - 10 })), rotated('bad token') as unknown as typeof fetch)
    expect(await h.source.get()).toBeNull()
    expect(h.reports).toContain('chatgpt_refresh_shape_invalid')
    expect(h.writes).toHaveLength(0)
  })

  it('login listens on the fallback port when the first one is busy', async () => {
    const { createServer } = await import('node:http')
    const script = await import('../../scripts/chatgpt-login.mjs')
    const busy = createServer()
    await new Promise<void>(resolve => busy.listen(0, '127.0.0.1', resolve))
    const busyPort = (busy.address() as { port: number }).port
    const probe = createServer()
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
    const freePort = (probe.address() as { port: number }).port
    await new Promise(resolve => probe.close(resolve))
    const server = createServer()
    try {
      expect(await script.listen(server, [busyPort, freePort])).toBe(freePort)
      expect((server.address() as { port: number }).port).toBe(freePort)
    } finally {
      await new Promise(resolve => server.close(resolve))
      await new Promise(resolve => busy.close(resolve))
    }
  })

  it('decodes JWT claims defensively', () => {
    expect(jwtClaims('not-a-jwt')).toEqual({})
    expect(jwtClaims(jwt({ exp: 5 }))).toEqual({ exp: 5 })
  })
})
