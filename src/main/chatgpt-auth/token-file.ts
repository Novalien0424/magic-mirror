import { open, readFile, rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { CHATGPT_CLIENT_ID, CHATGPT_EXPIRY_MARGIN_MS, CHATGPT_ISSUER, CHATGPT_KEEPALIVE_INTERVAL_MS, CHATGPT_REFRESH_INTERVAL_MS, CHATGPT_TOKEN_FILE } from './constants'

const writeFileAtomic = require('write-file-atomic') as (file: string, data: string, options: { mode: number }) => Promise<void>

export type ChatgptAuthStatus = 'signed_in' | 'missing' | 'invalid' | 'expired' | 'refresh_failed'
export interface ChatgptCredential { readonly accessToken: string; readonly accountId: string }
export interface ChatgptCredentialSource {
  get(): Promise<ChatgptCredential | null>
  /** After a provider 401: refresh once, even when the token looks valid. */
  refreshAfterRejection(rejected: ChatgptCredential): Promise<ChatgptCredential | null>
  status(): Promise<{ status: ChatgptAuthStatus; lastRefresh?: string }>
  /** Background upkeep: refreshes a token due before the next check, so an idle Mac stays signed in. Silent when signed out. */
  keepAlive?(): Promise<void>
}

interface Tokens { access: string; refresh: string; id: string; accountId: string; lastRefresh: string }

export function jwtClaims(jwt: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch { return {} }
}
function accountIdFrom(...jwts: string[]): string {
  for (const jwt of jwts) {
    const auth = jwtClaims(jwt)['https://api.openai.com/auth']
    const id = auth && typeof auth === 'object' ? (auth as Record<string, unknown>).chatgpt_account_id : undefined
    if (typeof id === 'string' && id) return id
  }
  return ''
}
const safeValue = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !/[\s"'#=]/.test(value)

export function tokenFileText(tokens: Tokens): string {
  return ['# Magic Mirror ChatGPT sign-in. Written by `npm run chatgpt:login`; Main refreshes it.',
    '# Secret: never commit, copy or share. Move it (do not copy) between checkouts.',
    `CHATGPT_ACCESS_TOKEN=${tokens.access}`, `CHATGPT_REFRESH_TOKEN=${tokens.refresh}`,
    `CHATGPT_ID_TOKEN=${tokens.id}`, `CHATGPT_ACCOUNT_ID=${tokens.accountId}`,
    `CHATGPT_LAST_REFRESH=${tokens.lastRefresh}`, ''].join('\n')
}

const LOCK_STALE_MS = 30_000
/**
 * Commit lock shared with `scripts/chatgpt-login.mjs`: `<file>.lock`, created
 * exclusively. A writer that crashed leaves it behind; a stale one is reclaimed.
 */
export async function withTokenFileLock<T>(file: string, run: () => Promise<T>): Promise<T> {
  const lock = `${file}.lock`
  for (let attempt = 0; ; attempt++) {
    try { await (await open(lock, 'wx', 0o600)).close(); break } catch (error) {
      if ((error as { code?: unknown })?.code !== 'EEXIST') throw error
      const age = await stat(lock).then(info => Date.now() - info.mtimeMs, () => 0)
      if (age > LOCK_STALE_MS) { await rm(lock, { force: true }); continue }
      if (attempt >= 100) throw Error('chatgpt_token_file_busy')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  try { return await run() } finally { await rm(lock, { force: true }) }
}

/**
 * Main-only ChatGPT session in the ignored root `.env.chatgpt` (owner ruling
 * 2026-10-17, invariant 12 amendment). Values stay in this module's RAM and the
 * file; callers and diagnostics only ever see status codes.
 */
export function createChatgptTokenFile(options: {
  path?: string
  readFile?: (path: string) => Promise<string>
  writeFile?: (path: string, text: string) => Promise<void>
  /** Serializes a refresh save with a login's save; tests replace the file lock. */
  lock?: <T>(run: () => Promise<T>) => Promise<T>
  fetchImpl?: typeof fetch
  now?: () => number
  report?: (reason: string) => void
} = {}): ChatgptCredentialSource {
  const path = options.path ?? resolve(process.cwd(), CHATGPT_TOKEN_FILE)
  const readText = options.readFile ?? ((file: string) => readFile(file, 'utf8'))
  const write = options.writeFile ?? ((file: string, text: string) => writeFileAtomic(file, text, { mode: 0o600 }))
  const lock = options.lock ?? (<T>(run: () => Promise<T>) => withTokenFileLock(path, run))
  const now = options.now ?? Date.now
  const report = (reason: string) => { try { options.report?.(reason) } catch { /* diagnostics never change auth */ } }
  // Tokens, 'removed' when the sign-in was deleted, or null when a refresh failed.
  let refreshing: Promise<Tokens | 'removed' | null> | null = null
  // The refresh token whose refresh failed. A new login replaces it and clears the failure.
  let failedRefresh: string | null = null
  // Rotated tokens that could not be saved; the file still holds the used refresh token.
  let unsaved: { from: string; tokens: Tokens } | null = null

  async function read(): Promise<Tokens | null | 'invalid'> {
    let text: string
    try { text = await readText(path) } catch (error) {
      if ((error as { code?: unknown })?.code === 'ENOENT') return null
      return 'invalid'
    }
    let values: Record<string, string | undefined>
    try { values = parseEnv(text) } catch { return 'invalid' }
    const tokens = { access: values.CHATGPT_ACCESS_TOKEN, refresh: values.CHATGPT_REFRESH_TOKEN, id: values.CHATGPT_ID_TOKEN,
      accountId: values.CHATGPT_ACCOUNT_ID, lastRefresh: values.CHATGPT_LAST_REFRESH }
    if (!safeValue(tokens.access) || !safeValue(tokens.refresh)) return 'invalid'
    const accountId = safeValue(tokens.accountId) ? tokens.accountId : accountIdFrom(tokens.id ?? '', tokens.access)
    if (!accountId) return 'invalid'
    return { access: tokens.access, refresh: tokens.refresh, id: safeValue(tokens.id) ? tokens.id : '', accountId,
      lastRefresh: tokens.lastRefresh && Number.isFinite(Date.parse(tokens.lastRefresh)) ? tokens.lastRefresh : new Date(0).toISOString() }
  }
  /**
   * Saves rotated tokens only while the file still holds the refresh token they
   * replace; otherwise returns the newer login (or null when signed out).
   */
  function commit(from: string, tokens: Tokens): Promise<'saved' | Tokens | null> {
    return lock(async () => {
      const latest = await read()
      if (latest === null || latest !== 'invalid' && latest.refresh !== from) return latest
      await write(path, tokenFileText(tokens))
      return 'saved' as const
    })
  }
  async function load(): Promise<Tokens | null | 'invalid'> {
    const tokens = await read()
    if (tokens === null || tokens === 'invalid') return tokens
    if (unsaved && unsaved.from !== tokens.refresh) unsaved = null
    if (unsaved) {
      const pending = unsaved
      let result: 'saved' | Tokens | null
      try { result = await commit(pending.from, pending.tokens) } catch { return pending.tokens /* keep RAM copy */ }
      unsaved = null
      if (result === 'saved') { report('chatgpt_refresh_persisted'); return pending.tokens }
      report('chatgpt_refresh_superseded')
      return result
    }
    if (failedRefresh !== null && failedRefresh !== tokens.refresh) failedRefresh = null
    return tokens
  }
  const expiresAt = (tokens: Tokens) => {
    const exp = jwtClaims(tokens.access).exp
    // Without an exp claim, only the scheduled interval triggers refresh.
    return typeof exp === 'number' ? exp * 1000 : Number.POSITIVE_INFINITY
  }
  const stale = (tokens: Tokens, leadMs = 0) => expiresAt(tokens) - CHATGPT_EXPIRY_MARGIN_MS - leadMs <= now()
    || now() - Date.parse(tokens.lastRefresh) >= CHATGPT_REFRESH_INTERVAL_MS

  /** One refresh at a time. Re-read first: a new login may already have replaced the session. */
  function refresh(seenRefresh: string): Promise<Tokens | 'removed' | null> {
    refreshing ??= (async () => {
      try {
        const current = await load()
        if (current === null || current === 'invalid') return 'removed'
        if (current.refresh !== seenRefresh) return current
        const response = await (options.fetchImpl ?? fetch)(`${CHATGPT_ISSUER}/oauth/token`, {
          method: 'POST', signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: CHATGPT_CLIENT_ID, grant_type: 'refresh_token', refresh_token: current.refresh }),
        })
        if (!response.ok) { report(`chatgpt_refresh_http_${response.status}`); failedRefresh = current.refresh; return null }
        const body = await response.json() as Record<string, unknown>
        if (!safeValue(body.access_token) || body.refresh_token !== undefined && !safeValue(body.refresh_token)) {
          report('chatgpt_refresh_shape_invalid'); failedRefresh = current.refresh; return null
        }
        const next: Tokens = { access: body.access_token, refresh: safeValue(body.refresh_token) ? body.refresh_token : current.refresh,
          id: safeValue(body.id_token) ? body.id_token : current.id, accountId: '', lastRefresh: new Date(now()).toISOString() }
        next.accountId = accountIdFrom(next.id, next.access) || current.accountId
        failedRefresh = null
        // Refresh tokens rotate: once the server answered, the old one is spent.
        // Keep the new tokens in RAM until a later save succeeds.
        let saved: 'saved' | Tokens | null
        try { saved = await commit(current.refresh, next) }
        catch { unsaved = { from: current.refresh, tokens: next }; report('chatgpt_refresh_persist_failed'); return next }
        // A login that replaced or removed the file while the request was in flight wins: never overwrite it.
        if (saved !== 'saved') { report('chatgpt_refresh_superseded'); return saved ?? 'removed' }
        report('chatgpt_refreshed')
        return next
      } catch { report('chatgpt_refresh_failed'); failedRefresh = seenRefresh; return null }
      finally { refreshing = null }
    })()
    return refreshing
  }
  const credential = (tokens: Tokens): ChatgptCredential => Object.freeze({ accessToken: tokens.access, accountId: tokens.accountId })

  return {
    async get() {
      const tokens = await load()
      if (tokens === null || tokens === 'invalid') { report(tokens === null ? 'chatgpt_signin_missing' : 'chatgpt_signin_invalid'); return null }
      if (!stale(tokens)) return credential(tokens)
      const next = await refresh(tokens.refresh)
      // A sign-in removed meanwhile is never handed out again.
      if (next === 'removed') return null
      if (next) return credential(next)
      // A failed scheduled refresh keeps a still-valid token usable.
      return expiresAt(tokens) > now() ? credential(tokens) : null
    },
    async refreshAfterRejection(rejected) {
      const tokens = await load()
      if (tokens === null || tokens === 'invalid') return null
      if (tokens.access !== rejected.accessToken) return credential(tokens)
      const next = await refresh(tokens.refresh)
      return next && next !== 'removed' ? credential(next) : null
    },
    async keepAlive() {
      const tokens = await load().catch(() => null)
      if (tokens === null || tokens === 'invalid' || !stale(tokens, CHATGPT_KEEPALIVE_INTERVAL_MS)) return
      await refresh(tokens.refresh)
    },
    async status() {
      const tokens = await load()
      if (tokens === null) return { status: 'missing' }
      if (tokens === 'invalid') return { status: 'invalid' }
      if (failedRefresh !== null && failedRefresh === tokens.refresh) return { status: 'refresh_failed', lastRefresh: tokens.lastRefresh }
      return { status: expiresAt(tokens) > now() ? 'signed_in' : 'expired', lastRefresh: tokens.lastRefresh }
    },
  }
}
