import { deflateSync, inflateSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanSticker, STICKER_CLEANUP } from '../../src/main/studio/sticker-cleanup'
import { createStudioRuntime } from '../../src/main/studio/studio-runtime'
import type { PortraitImageResult } from '../../src/main/studio/image-provider'
import { defaultExperience } from '../../src/shared/portrait-studio'
import { SAMPLE_STUDIO_CONCEPT } from '../../src/shared/studio-concept'

type Rgba = [number, number, number, number]
const CLEAR: Rgba = [0, 0, 0, 0]
const paeth = (a: number, b: number, c: number) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
function chunk(type: string, data: Buffer): Buffer {
  // The cleaner does not read checksums, so the fixture leaves them zero.
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8)
  return out
}
/** A PNG whose rows cycle through all five row filters, as the provider's encoder may use any. */
function png(width: number, height: number, pixel: (x: number, y: number) => Rgba, options: { colourType?: number; extra?: Buffer[] } = {}): Buffer {
  const stride = width * 4, flat = Buffer.alloc(stride * height), raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) flat.set(pixel(x, y), (y * width + x) * 4)
  for (let y = 0; y < height; y++) {
    const filter = y % 5
    raw[y * (stride + 1)] = filter
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x, a = x >= 4 ? flat[at - 4]! : 0, b = y ? flat[at - stride]! : 0, c = x >= 4 && y ? flat[at - stride - 4]! : 0
      raw[y * (stride + 1) + 1 + x] = (flat[at]! - [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]!) & 255
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = options.colourType ?? 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), ...(options.extra ?? []), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
function read(image: Buffer) {
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20), stride = width * 4, types: string[] = [], data: Buffer[] = []
  for (let at = 8; at < image.length;) {
    const size = image.readUInt32BE(at), type = image.toString('ascii', at + 4, at + 8)
    types.push(type); if (type === 'IDAT') data.push(image.subarray(at + 8, at + 8 + size)); at += size + 12
  }
  const raw = inflateSync(Buffer.concat(data)), flat = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
    expect(raw[y * (stride + 1)]).toBe(2)
    flat[y * stride + x] = (raw[y * (stride + 1) + 1 + x]! + (y ? flat[(y - 1) * stride + x]! : 0)) & 255
  }
  return { width, height, types, at: (x: number, y: number): Rgba => [...flat.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)] as Rgba }
}

describe('sticker clean-up for a cutter', () => {
  it('clears invisible dust, makes the body fully opaque and keeps a soft edge, without moving a roomy subject', async () => {
    const body: Rgba = [200, 90, 40, 253], edge: Rgba = [200, 90, 40, 100]
    const source = png(100, 100, (x, y) => x >= 30 && x < 70 && y >= 30 && y < 70 ? body
      : x === 70 && y >= 30 && y < 70 ? edge
      : x === 2 && y === 3 ? [255, 0, 0, STICKER_CLEANUP.clearAlphaUpTo] : x === 97 && y === 96 ? [0, 0, 255, 1] : CLEAR)
    const cleaned = read((await cleanSticker(source))!)
    expect([cleaned.width, cleaned.height]).toEqual([100, 100])
    expect(cleaned.at(2, 3)).toEqual(CLEAR)
    expect(cleaned.at(97, 96)).toEqual(CLEAR)
    expect(cleaned.at(30, 30)).toEqual([200, 90, 40, 255])
    expect(cleaned.at(69, 69)).toEqual([200, 90, 40, 255])
    expect(cleaned.at(70, 50)).toEqual(edge)
    expect(cleaned.at(29, 50)).toEqual(CLEAR)
  })

  it('grows a square canvas and centres a subject that reaches the edge, pixel for pixel', async () => {
    // 90 wide and 50 tall, touching the left and bottom edges of a 100 px canvas.
    const colour = (x: number, y: number): Rgba => [x * 2, y * 2, 77, 255]
    const cleaned = read((await cleanSticker(png(100, 100, (x, y) => x < 90 && y >= 50 ? colour(x, y) : CLEAR)))!)
    const side = Math.ceil(90 / (1 - 2 * STICKER_CLEANUP.margin))
    expect([cleaned.width, cleaned.height]).toEqual([side, side])
    const left = Math.floor((side - 90) / 2), top = Math.floor((side - 50) / 2)
    expect(left).toBeGreaterThanOrEqual(Math.ceil(side * STICKER_CLEANUP.margin))
    expect(cleaned.at(left, top)).toEqual(colour(0, 50))
    expect(cleaned.at(left + 89, top + 49)).toEqual(colour(89, 99))
    expect(cleaned.at(left - 1, top)).toEqual(CLEAR)
    expect(cleaned.at(left + 90, top + 49)).toEqual(CLEAR)
    expect(cleaned.at(left, top - 1)).toEqual(CLEAR)
    expect(cleaned.at(left, top + 50)).toEqual(CLEAR)
  })

  it('recentres an off-centre subject that fits, keeping the canvas size', async () => {
    const cleaned = read((await cleanSticker(png(100, 100, (x, y) => x < 40 && y < 40 ? [9, 9, 9, 255] : CLEAR)))!)
    expect([cleaned.width, cleaned.height]).toEqual([100, 100])
    expect(cleaned.at(30, 30)).toEqual([9, 9, 9, 255])
    expect(cleaned.at(69, 69)).toEqual([9, 9, 9, 255])
    expect(cleaned.at(29, 30)).toEqual(CLEAR)
    expect(cleaned.at(70, 69)).toEqual(CLEAR)
  })

  it('keeps colour information and drops other extra chunks', async () => {
    const cleaned = read((await cleanSticker(png(20, 20, (x, y) => x > 5 && x < 14 && y > 5 && y < 14 ? [1, 2, 3, 255] : CLEAR,
      { extra: [chunk('sRGB', Buffer.from([0])), chunk('caBX', Buffer.from('manifest'))] })))!)
    expect(cleaned.types).toEqual(['IHDR', 'sRGB', 'IDAT', 'IEND'])
  })

  it('returns null for anything it cannot clean, so the caller keeps the original', async () => {
    expect(await cleanSticker(Buffer.from('not a png'))).toBeNull()
    expect(await cleanSticker(png(10, 10, () => [1, 2, 3, 255], { colourType: 2 }))).toBeNull()
    expect(await cleanSticker(png(10, 10, () => [255, 255, 255, 3]))).toBeNull()
    const whole = png(10, 10, () => [1, 2, 3, 255])
    expect(await cleanSticker(whole.subarray(0, whole.length - 20))).toBeNull()
  })
})

describe('Studio shows and prints the cut-ready sticker', () => {
  afterEach(() => { vi.useRealTimers() })
  const identity = { realtimeSessionId: 'rt-1', sessionGeneration: 1 }
  const first = Buffer.from('provider-first'), second = Buffer.from('provider-second')
  async function visit(cleanSticker: ((image: Buffer) => Promise<Buffer | null>) | undefined, results: PortraitImageResult[]) {
    const events: { event: string; imageUrl?: string; step?: { id: string } }[] = [], reports: string[] = []
    const edits: Buffer[] = [], delivered: Buffer[] = []
    const runtime = createStudioRuntime({
      concepts: { select: async () => ({ ok: true, concept: SAMPLE_STUDIO_CONCEPT, elapsedMs: 0 }) },
      provider: () => ({ generate: async () => results.shift()!, edit: async ({ image }) => { edits.push(image); return results.shift()! } }),
      ...(cleanSticker ? { cleanSticker } : {}),
      dispatch: command => { if (command.type === 'studio_event') events.push(command.event as never); return true },
      activity: vi.fn(), report: reason => reports.push(reason),
      keepsakeSinks: [{ name: 'printer', deliver: image => { delivered.push(image.bytes) } }],
    })
    const cue = (action: 'paint' | 'deliver') => runtime.handle({ action, stepId: events.filter(e => e.event === 'step').at(-1)!.step!.id }, identity)
    const shown = () => runtime.image(events.filter(e => e.event === 'ready').at(-1)!.imageUrl!.split('/').pop()!)?.bytes
    runtime.start(identity, defaultExperience(), 'mode')
    runtime.handle({ action: 'set_name', name: '測試', confirmed: false, language: 'zh' }, identity)
    runtime.handle({ action: 'set_name', name: '測試', confirmed: true, language: 'zh' }, identity)
    for (let question = 1; question <= 4; question++) runtime.handle({ action: 'answer', question, answer: `answer ${question}`, language: 'zh' }, identity)
    cue('paint')
    await vi.waitFor(() => expect(runtime.phase()).toBe('reveal'))
    return { runtime, reports, edits, delivered, cue, shown }
  }
  const ok = (image: Buffer): PortraitImageResult => ({ ok: true, image, mimeType: 'image/png', elapsedMs: 1 })

  it('shows and delivers the cleaned picture, and edits the provider’s original', async () => {
    const clean = vi.fn(async (image: Buffer) => Buffer.concat([Buffer.from('clean:'), image]))
    const h = await visit(clean, [ok(first), ok(second)])
    expect(h.shown()?.toString()).toBe('clean:provider-first')
    h.runtime.handle({ action: 'revise', change: 'red wings', mode: 'refine' }, identity)
    h.cue('paint')
    await vi.waitFor(() => expect(h.edits).toHaveLength(1))
    await vi.waitFor(() => expect(h.runtime.phase()).toBe('reveal'))
    expect(h.edits[0]!.equals(first)).toBe(true)
    expect(h.shown()?.toString()).toBe('clean:provider-second')
    h.runtime.handle({ action: 'finish' }, identity)
    h.cue('deliver')
    expect(h.delivered.map(String)).toEqual(['clean:provider-second'])
    expect(h.reports.filter(reason => reason.startsWith('studio_sticker_'))).toEqual(['studio_sticker_cleaned', 'studio_sticker_cleaned'])
  })

  it('still refuses a change the provider returned unchanged, judged on its original', async () => {
    const h = await visit(async image => Buffer.concat([Buffer.from('clean:'), image]), [ok(first), ok(first)])
    h.runtime.handle({ action: 'revise', change: 'red wings', mode: 'refine' }, identity)
    h.cue('paint')
    await vi.waitFor(() => expect(h.reports).toContain('studio_revision_unchanged'))
  })

  it('keeps the provider’s picture and says so when the clean-up cannot run', async () => {
    const h = await visit(async () => null, [ok(first)])
    expect(h.shown()?.equals(first)).toBe(true)
    expect(h.reports).toContain('studio_sticker_cleanup_skipped')
    const thrown = await visit(async () => { throw new Error('x') }, [ok(first)])
    expect(thrown.shown()?.equals(first)).toBe(true)
    expect(thrown.reports).toContain('studio_sticker_cleanup_skipped')
  })

  it('leaves a full picture alone', async () => {
    const clean = vi.fn(async () => Buffer.from('never'))
    const experience = defaultExperience()
    experience.studio.pictureType = 'portrait'
    const events: { event: string; imageUrl?: string; step?: { id: string } }[] = []
    const runtime = createStudioRuntime({
      concepts: { select: async () => ({ ok: true, concept: SAMPLE_STUDIO_CONCEPT, elapsedMs: 0 }) },
      provider: () => ({ generate: async () => ok(first), edit: async () => ok(second) }), cleanSticker: clean,
      dispatch: command => { if (command.type === 'studio_event') events.push(command.event as never); return true }, activity: vi.fn(), report: vi.fn(),
    })
    runtime.start(identity, experience, 'mode')
    runtime.handle({ action: 'set_name', name: '測試', confirmed: false, language: 'zh' }, identity)
    runtime.handle({ action: 'set_name', name: '測試', confirmed: true, language: 'zh' }, identity)
    for (let question = 1; question <= 4; question++) runtime.handle({ action: 'answer', question, answer: 'a', language: 'zh' }, identity)
    runtime.handle({ action: 'paint', stepId: events.filter(e => e.event === 'step').at(-1)!.step!.id }, identity)
    await vi.waitFor(() => expect(runtime.phase()).toBe('reveal'))
    expect(clean).not.toHaveBeenCalled()
  })
})
