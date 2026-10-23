import { createServer, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { isIP } from 'node:net'
import { WEB_CONSOLE_METHODS, type WebConsoleMethod } from '../shared/web-console'
import type { IpcMainRegistrar } from './ipc'

// Only Main can create this capability. No request payload can impersonate it.
const webEvents = new WeakSet<object>()
export const isWebConsoleEvent = (event: unknown): boolean => !!event && typeof event === 'object' && webEvents.has(event)
export function createWebConsoleRegistry(ipc: IpcMainRegistrar) {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  const channels = new Set<string>(Object.values(WEB_CONSOLE_METHODS))
  return {
    registrar: {
      handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) {
        if (channels.has(channel)) handlers.set(channel, handler)
        ipc.handle(channel, handler)
      },
      on: ipc.on.bind(ipc),
    } satisfies IpcMainRegistrar,
    async invoke(method: WebConsoleMethod, args: unknown[]) {
      const handler = handlers.get(WEB_CONSOLE_METHODS[method])
      if (!handler) throw Error('console_not_ready')
      const event = Object.freeze({})
      webEvents.add(event)
      try { return await handler(event, ...args) } finally { webEvents.delete(event) }
    },
  }
}

export interface WebConsoleConfig { origin: string; port: number }
export function parseWebConsoleConfig(value: unknown): WebConsoleConfig | null {
  if (!value || typeof value !== 'object') return null
  const { origin, port } = value as WebConsoleConfig
  if (typeof origin !== 'string' || !/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net:8443$/.test(origin) || port !== 38433) return null
  return { origin, port }
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.moc3': 'application/octet-stream', '.frag': 'text/plain', '.vert': 'text/plain',
  '.wav': 'audio/wav', '.mp4': 'video/mp4' }
const json = (res: ServerResponse, status: number, value: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value))
}
// Serve replaces X-Forwarded-For with the authenticated peer address. Tagged
// nodes deliberately have no Tailscale-User-Login, so authorize node identity.
// Keep identity data inside this lookup; never log or send the whois response.
export function createTailnetVerifier(lookup: (ip: string) => Promise<boolean> = ip => new Promise(resolveIdentity => {
  execFile(process.platform === 'darwin' ? '/opt/homebrew/bin/tailscale' : 'tailscale', ['whois', '--json', ip],
    { timeout: 2500, maxBuffer: 256 * 1024 }, (error, stdout) => {
      if (error) { resolveIdentity(false); return }
      try {
        const result = JSON.parse(stdout) as { Node?: { ID?: number; Addresses?: string[] } }
        resolveIdentity(!!result.Node?.ID && !!result.Node.Addresses?.some(address => address.split('/')[0] === ip))
      } catch { resolveIdentity(false) }
    })
})) {
  const cache = new Map<string, { expires: number; result: Promise<boolean> }>()
  return (ip: string): Promise<boolean> => {
    if (!isIP(ip)) return Promise.resolve(false)
    const existing = cache.get(ip)
    if (existing && existing.expires > Date.now()) return existing.result
    if (cache.size >= 64) cache.delete(cache.keys().next().value!)
    const result = lookup(ip).catch(() => false)
    cache.set(ip, { expires: Date.now() + 10_000, result })
    return result
  }
}
/** Loopback only, behind a dedicated tailnet-only Tailscale Serve endpoint. */
export async function startWebConsole(input: {
  config: WebConsoleConfig
  rendererRoot: string
  invoke(method: WebConsoleMethod, args: unknown[]): Promise<unknown>
  media(request: Request): Promise<Response>
  report(reason: string): void
  authenticateNode?(ip: string): Promise<boolean>
}) {
  const token = randomBytes(32).toString('hex'), host = new URL(input.config.origin).host
  const root = await realpath(input.rendererRoot)
  const clients = new Set<ServerResponse>()
  const authenticateNode = input.authenticateNode ?? createTailnetVerifier()
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    // Serve overwrites forwarded headers and marks Funnel requests. Refuse
    // public ingress even if someone later enables Funnel on this port.
    // Local processes have the same machine authority; no listener is exposed on LAN.
    const peer = req.headers['x-forwarded-for']
    if (req.headers.host !== host || req.headers['x-forwarded-host'] !== host || req.headers['x-forwarded-proto'] !== 'https'
      || req.headers['tailscale-funnel-request'] || req.headers['sec-fetch-site'] === 'cross-site'
      || typeof peer !== 'string' || !isIP(peer) || !await authenticateNode(peer)) {
      json(res, 403, { error: 'tailnet_authentication_required' }); return
    }
    try {
      const url = new URL(req.url ?? '/', input.config.origin)
      if (req.method === 'GET' && url.pathname === '/api/session') { json(res, 200, { token }); return }
      if (req.method === 'POST' && url.pathname === '/api/invoke') {
        if (req.headers.origin !== input.config.origin || req.headers['x-console-token'] !== token
          || req.headers['content-type'] !== 'application/json') { json(res, 403, { error: 'console_request_rejected' }); return }
        let bytes = 0; const chunks: Buffer[] = []
        for await (const chunk of req) {
          bytes += chunk.length
          if (bytes > 2 * 1024 * 1024) { json(res, 413, { error: 'console_request_too_large' }); return }
          chunks.push(chunk)
        }
        let body: unknown
        try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { json(res, 400, { error: 'console_request_invalid' }); return }
        if (!body || typeof body !== 'object' || Array.isArray(body)) { json(res, 400, { error: 'console_request_invalid' }); return }
        const { method, args } = body as { method: string; args: unknown[] }
        if (Object.keys(body).sort().join(',') !== 'args,method' || !Object.hasOwn(WEB_CONSOLE_METHODS, method) || !Array.isArray(args) || args.length > 3) {
          json(res, 400, { error: 'console_method_unavailable' }); return
        }
        // A browser cannot choose a folder on the host through a hidden native dialog.
        if (method === 'mediaFolders' && (args[0] as { action?: string } | null)?.action === 'choose') {
          json(res, 200, { ok: false, error: 'console_request_rejected', reason: 'Open Console on the Mac to link a folder.' }); return
        }
        json(res, 200, await input.invoke(method as WebConsoleMethod, args)); return
      }
      if (req.method !== 'GET') { json(res, 405, { error: 'method_not_allowed' }); return }
      if (url.pathname === '/api/events') {
        if (clients.size >= 16) { json(res, 503, { error: 'console_client_limit' }); return }
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
        res.write(': connected\n\n'); clients.add(res)
        res.on('close', () => clients.delete(res)); return
      }
      if (url.pathname.startsWith('/media/')) {
        const path = url.pathname.slice('/media/'.length)
        // Reuse the same opaque-asset allowlist and range handling as Electron.
        if (!/^(avatar|music|music-draft|visual|visual-draft|visual-pending)\//.test(path)) { json(res, 404, { error: 'asset_not_found' }); return }
        const response = await input.media(new Request(`magic-mirror-media://${path}${url.search}`, { headers: req.headers.range ? { Range: req.headers.range } : {} }))
        const headers: Record<string, string> = {}
        response.headers.forEach((value, key) => { if (!key.toLowerCase().startsWith('access-control')) headers[key] = value })
        res.writeHead(response.status, headers)
        if (response.body) await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), res)
        else res.end()
        return
      }
      let relative = decodeURIComponent(url.pathname)
      if (relative === '/') relative = '/console/index.html'
      if (relative.includes('\0') || relative.includes('\\') || relative.split('/').includes('..')) { json(res, 404, { error: 'not_found' }); return }
      const file = await realpath(resolve(root, `.${relative}`))
      if (!file.startsWith(root + sep) || file.endsWith('.map') || !mime[extname(file)]) { json(res, 404, { error: 'not_found' }); return }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] }); res.end(await readFile(file))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !res.headersSent) { json(res, 404, { error: 'not_found' }); return }
      if (!res.headersSent) json(res, 503, { error: 'console_request_failed' })
      else res.end()
      input.report('web_console_request_failed')
    }
  })
  server.requestTimeout = 30_000; server.headersTimeout = 10_000
  server.maxConnections = 32
  await new Promise<void>((resolveReady, reject) => { server.once('error', reject); server.listen(input.config.port, '127.0.0.1', resolveReady) })
  server.on('error', () => input.report('web_console_server_failed'))
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n') }, 15_000)
  heartbeat.unref()
  return {
    port: (server.address() as import('node:net').AddressInfo).port,
    publish(channel: string, value: unknown) {
      const message = `data: ${JSON.stringify({ channel, value })}\n\n`
      for (const client of clients) if (!client.write(message)) { client.destroy(); clients.delete(client); input.report('web_console_slow_client_closed') }
    },
    close() { clearInterval(heartbeat); for (const client of clients) client.end(); clients.clear(); server.close(); server.closeAllConnections() },
  }
}
