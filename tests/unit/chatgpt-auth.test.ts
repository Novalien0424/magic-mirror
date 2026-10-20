import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as constants from '../../src/main/chatgpt-auth/constants'
import { createChatgptTokenFile, jwtClaims, tokenFileText } from '../../src/main/chatgpt-auth/token-file'

const jwt = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`
const auth = (account: string) => ({ 'https://api.openai.com/auth': { chatgpt_account_id: account } })
const NOW = Date.parse('2026-10-17T00:00:00Z')
const file = (access: string, refresh = 'refresh-1', lastRefresh = '2026-10-16T00:00:00.000Z') =>
  tokenFileText({ access, refresh, id: jwt(auth('acct-1')), accountId: 'acct-1', lastRefresh })

function harness(initial: string | null, fetchImpl?: typeof fetch, options: { failWrites?: number; onRead?: (count: number) => void } = {}) {
  let text = initial
  let failWrites = options.failWrites ?? 0, reads = 0
  const writes: string[] = []
  const reports: string[] = []
  // Stands in for the shared lock file: one committing writer at a time.
  let tail: Promise<unknown> = Promise.resolve()
  const lock = <T>(run: () => Promise<T>): Promise<T> => { const next = tail.then(run); tail = next.catch(() => undefined); return next }
  const source = createChatgptTokenFile({ path: '/x/.env.chatgpt', now: () => NOW, fetchImpl, report: r => reports.push(r), lock,
    readFile: async () => { options.onRead?.(++reads); if (text === null) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return text },
    writeFile: async (_path, next) => { if (failWrites-- > 0) throw new Error('disk'); text = next; writes.push(next) } })
  return { source, writes, reports, current: () => text, replace: (next: string) => { text = next },
    /** `npm run chatgpt:login` saving under the same lock. */
    login: (next: string) => lock(async () => { text = next }) }
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

  it('keeps a login that replaced the file while a refresh was in flight', async () => {
    const login = tokenFileText({ access: jwt({ exp: NOW / 1000 + 3600, ...auth('acct-2') }), refresh: 'refresh-login',
      id: jwt(auth('acct-2')), accountId: 'acct-2', lastRefresh: '2026-10-17T00:00:00.000Z' })
    let h!: ReturnType<typeof harness>
    const fetchImpl = vi.fn(async () => { h.replace(login); return rotated()() })
    h = harness(file(jwt({ exp: NOW / 1000 + 60 })), fetchImpl as unknown as typeof fetch)
    const credential = await h.source.get()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(h.current()).toBe(login)
    expect(h.writes).toHaveLength(0)
    expect(credential?.accountId).toBe('acct-2')
    expect(h.reports).toContain('chatgpt_refresh_superseded')
    // A file removed during the request is a sign-out, not something to recreate.
    let removed!: ReturnType<typeof harness>
    removed = harness(file(jwt({ exp: NOW / 1000 + 60 })), vi.fn(async () => { removed.replace(null as unknown as string); return rotated()() }) as unknown as typeof fetch)
    await removed.source.get()
    expect(removed.writes).toHaveLength(0)
    expect(removed.current()).toBeNull()
    expect(removed.reports).toContain('chatgpt_refresh_superseded')
    expect(await removed.source.get()).toBeNull()
  })

  it('lets a login that arrives during the refresh save land after it, never under it', async () => {
    const login = tokenFileText({ access: jwt({ exp: NOW / 1000 + 3600, ...auth('acct-2') }), refresh: 'refresh-login',
      id: jwt(auth('acct-2')), accountId: 'acct-2', lastRefresh: '2026-10-17T00:00:00.000Z' })
    let h!: ReturnType<typeof harness>
    let loginSaved: Promise<void> | undefined
    // Reads: get(), the refresh re-read, then the commit re-read. The login starts right after that last check.
    h = harness(file(jwt({ exp: NOW / 1000 + 60 })), rotated() as unknown as typeof fetch, { onRead: count => { if (count === 3) loginSaved = h.login(login) } })
    const credential = await h.source.get()
    await loginSaved
    expect(h.writes).toHaveLength(1)
    expect(h.writes[0]).toContain('CHATGPT_REFRESH_TOKEN=refresh-2')
    expect(h.current()).toBe(login)
    // The caller gets the refreshed credential it saved; the next request uses the login.
    expect(credential?.accessToken).toBe(h.writes[0]!.match(/CHATGPT_ACCESS_TOKEN=(\S+)/)![1])
    expect((await h.source.get())?.accountId).toBe('acct-2')
  })

  it('never hands a removed sign-in to a request that was waiting for the refresh', async () => {
    // Still valid but due for its scheduled refresh: a failed refresh alone would keep it usable.
    let h!: ReturnType<typeof harness>
    let release!: () => void
    const fetchImpl = vi.fn(async () => { await new Promise<void>(resolve => { release = resolve }); h.replace(null as unknown as string); return rotated()() })
    h = harness(file(jwt({ exp: NOW / 1000 + 3600 }), 'refresh-1', '2026-10-01T00:00:00.000Z'), fetchImpl as unknown as typeof fetch)
    const first = h.source.get(), waiting = h.source.get()
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce())
    release()
    expect(await first).toBeNull()
    expect(await waiting).toBeNull()
    expect(h.writes).toHaveLength(0)
    expect(h.reports).toContain('chatgpt_refresh_superseded')
  })

  it('shares a lock file with the login script', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mm-chatgpt-lock-'))
    try {
      const path = join(dir, '.env.chatgpt'), lock = `${path}.lock`
      await writeFile(path, file(jwt({ exp: NOW / 1000 + 60 })))
      // A login holding the lock delays the refresh save until it releases.
      await writeFile(lock, '')
      const pending = createChatgptTokenFile({ path, now: () => NOW, fetchImpl: rotated() as unknown as typeof fetch }).get()
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(await readFile(path, 'utf8')).toContain('CHATGPT_REFRESH_TOKEN=refresh-1')
      await rm(lock)
      expect(await pending).not.toBeNull()
      expect(await readFile(path, 'utf8')).toContain('CHATGPT_REFRESH_TOKEN=refresh-2')
      expect(existsSync(lock)).toBe(false)
      // The login script waits for Main's lock in the same way.
      const script = await import('../../scripts/chatgpt-login.mjs')
      await writeFile(lock, '')
      expect(() => script.writePrivate(path, 'login\n', { waitMs: 100 })).toThrow('session_file_busy')
      await rm(lock)
      script.writePrivate(path, 'login\n')
      expect(await readFile(path, 'utf8')).toBe('login\n')
      expect(existsSync(lock)).toBe(false)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('keeps the sign-in alive in the background: refreshes a token due before the next check, silently skips a missing one', async () => {
    const fresh = harness(file(jwt({ exp: NOW / 1000 + 7200 })), rotated())
    await fresh.source.keepAlive!()
    expect(fresh.writes).toHaveLength(0)
    const fetchImpl = rotated()
    const due = harness(file(jwt({ exp: NOW / 1000 + 20 * 60 })), fetchImpl)
    await due.source.keepAlive!()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(due.current()).toContain('CHATGPT_REFRESH_TOKEN=refresh-2')
    expect(await due.source.status()).toMatchObject({ status: 'signed_in' })
    const missingFetch = rotated()
    const missing = harness(null, missingFetch)
    await missing.source.keepAlive!()
    expect(missingFetch).not.toHaveBeenCalled()
    expect(missing.reports).toEqual([])
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
