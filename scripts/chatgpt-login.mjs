#!/usr/bin/env node
// Owner-run ChatGPT (Codex) sign-in for Portrait Studio image generation.
// Writes the ignored root `.env.chatgpt` (0600). Prints metadata only, never tokens.
// Constants mirror src/main/chatgpt-auth/constants.ts; a unit test checks parity.
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { closeSync, openSync, renameSync, statSync, writeFileSync, chmodSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'

export const CHATGPT_ISSUER = 'https://auth.openai.com'
export const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CHATGPT_LOGIN_PORTS = [1455, 1457]
export const CHATGPT_LOGIN_SCOPE = 'openid profile email offline_access'
export const CHATGPT_LOGIN_ORIGINATOR = 'codex_cli_rs'
const LOGIN_TIMEOUT_MS = 5 * 60_000

const base64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export function claims(jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString('utf8')) } catch { return {} }
}

export function tokenFileText(tokens, now = new Date()) {
  const auth = claims(tokens.id_token)['https://api.openai.com/auth'] ?? claims(tokens.access_token)['https://api.openai.com/auth'] ?? {}
  const accountId = typeof auth.chatgpt_account_id === 'string' ? auth.chatgpt_account_id : ''
  for (const value of [tokens.access_token, tokens.refresh_token, tokens.id_token, accountId]) {
    if (typeof value !== 'string' || !value || /[\s"'#=]/.test(value)) throw new Error('token_response_invalid')
  }
  return ['# Magic Mirror ChatGPT sign-in. Written by `npm run chatgpt:login`; Main refreshes it.',
    '# Secret: never commit, copy or share. Move it (do not copy) between checkouts.',
    `CHATGPT_ACCESS_TOKEN=${tokens.access_token}`,
    `CHATGPT_REFRESH_TOKEN=${tokens.refresh_token}`,
    `CHATGPT_ID_TOKEN=${tokens.id_token}`,
    `CHATGPT_ACCOUNT_ID=${accountId}`,
    `CHATGPT_LAST_REFRESH=${now.toISOString()}`, ''].join('\n')
}

const LOCK_STALE_MS = 30_000
/**
 * Saves under `<file>.lock`, the lock Main holds while it saves a refreshed
 * session (src/main/chatgpt-auth/token-file.ts), so neither overwrites the other.
 */
export function writePrivate(path, text, { waitMs = 10_000 } = {}) {
  const lock = `${path}.lock`
  const deadline = Date.now() + waitMs
  for (;;) {
    try { closeSync(openSync(lock, 'wx', 0o600)); break } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let age = 0
      try { age = Date.now() - statSync(lock).mtimeMs } catch { continue }
      if (age > LOCK_STALE_MS) { rmSync(lock, { force: true }); continue }
      if (Date.now() >= deadline) throw new Error('session_file_busy')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  const temporary = join(dirname(path), `.env.chatgpt.${process.pid}.tmp`)
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' })
    chmodSync(temporary, 0o600)
    renameSync(temporary, path)
  } catch (error) { rmSync(temporary, { force: true }); throw error }
  finally { rmSync(lock, { force: true }) }
}

/** Listen on the first free registered callback port; resolves the port actually bound. */
export function listen(server, ports = CHATGPT_LOGIN_PORTS) {
  return new Promise((resolvePort, reject) => {
    const attempt = index => {
      const port = ports[index]
      if (port === undefined) { reject(new Error('login_port_unavailable')); return }
      // Each attempt owns one listener pair; a failed attempt's callback must not resolve the next.
      const onListening = () => { server.off('error', onError); resolvePort(server.address().port) }
      const onError = error => {
        server.off('listening', onListening)
        if (error.code === 'EADDRINUSE') attempt(index + 1)
        else reject(error)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, '127.0.0.1')
    }
    attempt(0)
  })
}

async function main() {
  const outIndex = process.argv.indexOf('--out')
  const out = resolve(outIndex > 0 ? process.argv[outIndex + 1] : join(process.cwd(), '.env.chatgpt'))
  const verifier = base64url(randomBytes(64))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = base64url(randomBytes(32))
  let finish
  const done = new Promise((resolveDone, rejectDone) => { finish = { resolve: resolveDone, reject: rejectDone } })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/auth/callback') { response.writeHead(404).end(); return }
    const page = (status, text) => response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
      .end(`<!doctype html><meta charset="utf-8"><title>Magic Mirror</title><body style="font:16px system-ui;padding:40px">${text}</body>`)
    if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
      page(400, 'Sign-in failed: the response did not match this request. Close this tab and run the command again.')
      finish.reject(new Error(url.searchParams.get('error') ? 'login_denied' : 'login_state_mismatch')); return
    }
    try {
      const exchange = await fetch(`${CHATGPT_ISSUER}/oauth/token`, {
        method: 'POST', signal: AbortSignal.timeout(30_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CHATGPT_CLIENT_ID,
          code: url.searchParams.get('code'), redirect_uri: redirectUri, code_verifier: verifier }).toString(),
      })
      if (!exchange.ok) throw new Error(`token_exchange_http_${exchange.status}`)
      const tokens = await exchange.json()
      writePrivate(out, tokenFileText(tokens))
      const plan = claims(tokens.id_token)['https://api.openai.com/auth']?.chatgpt_plan_type
      page(200, 'Magic Mirror is signed in to ChatGPT. You can close this tab.')
      finish.resolve({ plan: typeof plan === 'string' ? plan : 'unknown' })
    } catch (error) {
      page(500, 'Sign-in failed while saving the session. Close this tab and run the command again.')
      finish.reject(error)
    }
  })
  const port = await listen(server)
  const redirectUri = `http://127.0.0.1:${port}/auth/callback`
  const authorize = new URL(`${CHATGPT_ISSUER}/oauth/authorize`)
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: CHATGPT_CLIENT_ID, redirect_uri: redirectUri,
    code_challenge: challenge, code_challenge_method: 'S256', state, scope: CHATGPT_LOGIN_SCOPE,
    id_token_add_organizations: 'true', codex_cli_simplified_flow: 'true', originator: CHATGPT_LOGIN_ORIGINATOR })) {
    authorize.searchParams.set(key, value)
  }
  console.log('Opening ChatGPT sign-in in your browser. If it does not open, visit:')
  console.log(authorize.toString())
  if (process.platform === 'darwin') spawn('open', [authorize.toString()], { stdio: 'ignore', detached: true }).unref()
  const timer = setTimeout(() => finish.reject(new Error('login_timeout')), LOGIN_TIMEOUT_MS)
  try {
    const result = await done
    console.log(`Signed in (plan: ${result.plan}). Saved ${out} with owner-only permissions.`)
  } finally { clearTimeout(timer); server.close() }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error(`ChatGPT sign-in failed: ${error instanceof Error ? error.message : 'unknown_error'}`); process.exit(1) })
}
