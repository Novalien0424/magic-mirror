import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { createTailnetVerifier, createWebConsoleRegistry, isWebConsoleEvent, parseWebConsoleConfig, startWebConsole } from '../../src/main/web-console'
import { authorizeSender } from '../../src/main/ipc'

const cleanups: (() => Promise<void> | void)[] = []
// Node fetch rewrites Host; use the HTTP client to exercise Serve's forwarded host.
function fetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: options.method, headers: options.headers }, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })))
      res.on('error', reject)
    })
    req.on('error', reject); req.end(options.body)
  })
}
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
describe('tailnet browser Console', () => {
  it('bounds and caches node verification without accepting ambiguous proxy addresses', async () => {
    const lookup = vi.fn(async (ip: string) => ip === '100.64.0.1'), verify = createTailnetVerifier(lookup)
    expect(await verify('100.64.0.1, 1.1.1.1')).toBe(false)
    expect(await verify('not-an-address')).toBe(false)
    expect(await verify('100.64.0.1')).toBe(true)
    expect(await verify('100.64.0.1')).toBe(true)
    expect(await verify('1.1.1.1')).toBe(false)
    expect(lookup).toHaveBeenCalledTimes(2)
  })
  it('allows only a Main-created Console capability and clears it after the call', async () => {
    const ipc = { handle: vi.fn(), on: vi.fn() }, registry = createWebConsoleRegistry(ipc)
    let held: unknown
    registry.registrar.handle('console:get-config', event => {
      held = event
      expect(authorizeSender(event, 'console', {})).toEqual({ ok: true })
      expect(authorizeSender(event, 'mirror', {}).ok).toBe(false)
      return { ok: true }
    })
    expect(isWebConsoleEvent({})).toBe(false)
    expect(await registry.invoke('getConfig', [])).toEqual({ ok: true })
    expect(isWebConsoleEvent(held)).toBe(false)
    expect(ipc.handle).toHaveBeenCalledOnce()
  })
  it('only accepts the dedicated HTTPS tailnet origin and loopback port', () => {
    expect(parseWebConsoleConfig({ origin: 'https://mac.tail123.ts.net:8443', port: 38433 })).not.toBeNull()
    for (const origin of ['http://mac.tail123.ts.net:8443', 'https://evil.test:8443', 'https://mac.tail123.ts.net', 'https://mac.tail123.ts.net:8443/']) {
      expect(parseWebConsoleConfig({ origin, port: 38433 })).toBeNull()
    }
  })
  it('serves the Console, opaque media and validated calls behind tailnet identity and CSRF checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mm-web-console-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    await mkdir(join(root, 'console'))
    await writeFile(join(root, 'console/index.html'), '<title>Console</title>')
    await writeFile(join(root, 'private.map'), 'not public')
    for (const extension of ['moc3', 'frag', 'vert', 'mjs']) await writeFile(join(root, `preview.${extension}`), 'fixture')
    await symlink('/etc/hosts', join(root, 'escape.js'))
    const invoke = vi.fn(async () => ({ ok: true })), media = vi.fn(async (_request: Request) => new Response('asset', { status: 206, headers: { 'Content-Type': 'video/mp4' } }))
    const origin = 'https://mac.tail123.ts.net:8443'
    const server = await startWebConsole({ rendererRoot: root, config: { origin, port: 0 }, invoke, media, report: vi.fn(),
      authenticateNode: async ip => ip === '100.64.0.1' })
    cleanups.push(() => server.close())
    const url = `http://127.0.0.1:${server.port}`
    // Tagged devices omit user identity headers; Serve still proves node identity.
    const headers = { Host: new URL(origin).host, 'X-Forwarded-Host': new URL(origin).host,
      'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '100.64.0.1' }
    expect((await fetch(url)).status).toBe(403)
    expect((await fetch(url, { headers: { Host: headers.Host } })).status).toBe(403)
    expect((await fetch(url, { headers: { ...headers, Host: 'localhost' } })).status).toBe(403)
    expect((await fetch(url, { headers: { ...headers, 'Tailscale-Funnel-Request': '?1' } })).status).toBe(403)
    expect((await fetch(url, { headers: { ...headers, 'X-Forwarded-For': '1.1.1.1' } })).status).toBe(403)
    expect((await fetch(url, { headers: { ...headers, 'X-Forwarded-For': '100.64.0.1, 1.1.1.1' } })).status).toBe(403)
    expect(await (await fetch(url, { headers })).text()).toContain('<title>Console</title>')
    for (const extension of ['moc3', 'frag', 'vert', 'mjs']) expect((await fetch(`${url}/preview.${extension}`, { headers })).status).toBe(200)
    const session = await (await fetch(`${url}/api/session`, { headers })).json() as { token: string }
    const post = (body: unknown, extra: Record<string, string> = {}) => fetch(`${url}/api/invoke`, { method: 'POST', headers: {
      ...headers, Origin: origin, 'Content-Type': 'application/json', 'X-Console-Token': session.token, ...extra }, body: JSON.stringify(body) })
    expect((await post({ method: 'getConfig', args: [] }, { Origin: 'https://evil.test' })).status).toBe(403)
    expect((await post({ method: 'getConfig', args: [] }, { 'X-Console-Token': 'wrong' })).status).toBe(403)
    expect((await post({ method: 'requestRealtimeClientSecret', args: [] })).status).toBe(400)
    expect((await post({ method: 'constructor', args: [] })).status).toBe(400)
    expect(invoke).not.toHaveBeenCalled()
    expect(await (await post({ method: 'saveDraft', args: [{ config: 'fixture' }] })).json()).toEqual({ ok: true })
    expect(invoke).toHaveBeenCalledWith('saveDraft', [{ config: 'fixture' }])
    expect(await (await post({ method: 'mediaFolders', args: [{ action: 'choose' }] })).json()).toMatchObject({ ok: false })
    expect((await fetch(`${url}/private.map`, { headers })).status).toBe(404)
    expect((await fetch(`${url}/escape.js`, { headers })).status).toBe(404)
    expect((await fetch(`${url}/media/studio/visitor-image`, { headers })).status).toBe(404)
    const asset = await fetch(`${url}/media/visual-draft/fixture`, { headers: { ...headers, Range: 'bytes=0-4' } })
    expect(asset.status).toBe(206)
    expect(await asset.text()).toBe('asset')
    expect(media.mock.calls[0]?.[0]).toMatchObject({ url: 'magic-mirror-media://visual-draft/fixture' })
    await new Promise<void>((resolveStream, reject) => {
      const stream = request(`${url}/api/events`, { headers }, res => {
        let received = ''
        res.on('data', chunk => {
          received += chunk.toString()
          if (received.includes('"lifecycle":"dormant"')) { stream.destroy(); resolveStream() }
          else if (received.includes(': connected')) server.publish('console:snapshot', { lifecycle: 'dormant' })
        })
        res.on('error', error => { if (!received.includes('"lifecycle":"dormant"')) reject(error) })
      })
      stream.on('error', reject); stream.end()
    })
  })
})
