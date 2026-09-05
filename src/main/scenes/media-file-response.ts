import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

// Called only after the protocol has authorized an opaque managed asset ID.
// Chromium needs byte ranges for MP4 metadata at EOF and fast seeking.
export async function serveMediaFile(request: Request, filePath: string, mimeType: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  const info = await stat(filePath)
  if (!info.isFile()) return new Response(null, { status: 404 })
  const size = info.size
  const headers = new Headers({ 'Content-Type': mimeType, 'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length',
    'Cache-Control': 'no-cache' })
  const range = request.headers.get('Range')
  let start = 0; let end = size - 1
  if (range && request.method !== 'HEAD') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    let valid = !!match && !!(match[1] || match[2])
    if (valid && match) {
      if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, size - suffix); valid = Number.isSafeInteger(suffix) && suffix > 0 }
      else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1 }
      valid &&= Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < size
    }
    if (!valid) { headers.set('Content-Range', `bytes */${size}`); return new Response(null, { status: 416, headers }) }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  }
  headers.set('Content-Length', String(Math.max(0, end - start + 1)))
  const body = request.method === 'HEAD' || size === 0 ? null
    : Readable.toWeb(createReadStream(filePath, { start, end, signal: request.signal })) as ReadableStream<Uint8Array>
  return new Response(body, { status: range && request.method !== 'HEAD' ? 206 : 200, headers })
}
