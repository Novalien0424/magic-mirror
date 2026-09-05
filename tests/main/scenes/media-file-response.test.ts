import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { serveMediaFile } from '../../../src/main/scenes/media-file-response'
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
it('serves exact byte ranges and rejects unsatisfiable requests without sending the whole video', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mirror-range-')); roots.push(root)
  const path = join(root, 'synthetic.bin'); await writeFile(path, Buffer.from('0123456789'))
  for (const [range, want, contentRange] of [['bytes=2-4', '234', 'bytes 2-4/10'], ['bytes=-3', '789', 'bytes 7-9/10'], ['bytes=8-', '89', 'bytes 8-9/10']]) {
    const r = await serveMediaFile(new Request('http://local/', { headers: { Range: range! } }), path, 'video/mp4')
    expect(r.status).toBe(206); expect(r.headers.get('Content-Range')).toBe(contentRange); expect(await r.text()).toBe(want)
  }
  const invalid = await serveMediaFile(new Request('http://local/', { headers: { Range: 'bytes=15-' } }), path, 'video/mp4')
  expect(invalid.status).toBe(416); expect(invalid.headers.get('Content-Range')).toBe('bytes */10')
  const head = await serveMediaFile(new Request('http://local/', { method: 'HEAD' }), path, 'video/mp4')
  expect(head.headers.get('Content-Length')).toBe('10'); expect(await head.text()).toBe('')
})
