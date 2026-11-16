import { promisify } from 'node:util'
import { deflate, inflate } from 'node:zlib'

/**
 * Makes a transparent picture ready for a sticker cutter that traces the shape
 * and cuts with a white margin (owner 2026-11-16). Pixels are never resampled.
 */
export const STICKER_CLEANUP = Object.freeze({
  /** The image model leaves invisible dust (measured alpha 1–8) far from the subject; a tracer cuts it. */
  clearAlphaUpTo: 16,
  /** The model's "solid" is alpha 250–254; a tracer may want fully opaque. */
  opaqueAlphaFrom: 248,
  /** Empty space on each side, as a share of the canvas: room for the cut margin (4.8 mm of 60 mm). */
  margin: 0.08,
  maxSide: 4096,
})

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
// Colour information is kept; a provenance manifest would no longer match the changed pixels.
const KEPT_CHUNKS = new Set(['sRGB', 'gAMA', 'cHRM', 'iCCP', 'pHYs'])
const inflateAsync = promisify(inflate), deflateAsync = promisify(deflate)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12)
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8)
  let crc = -1
  for (let i = 4; i < data.length + 8; i++) crc = CRC[(crc ^ out[i]!) & 255]! ^ (crc >>> 8)
  out.writeInt32BE(~crc, data.length + 8)
  return out
}
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Null when the bytes are not the provider's 8-bit RGBA PNG or show nothing: the caller keeps the original. */
export async function cleanSticker(png: Buffer): Promise<Buffer | null> {
  try {
    if (png.length < 57 || !png.subarray(0, 8).equals(SIGNATURE) || png.toString('ascii', 12, 16) !== 'IHDR') return null
    const W = png.readUInt32BE(16), H = png.readUInt32BE(20)
    if (!W || !H || W > STICKER_CLEANUP.maxSide || H > STICKER_CLEANUP.maxSide
      || png[24] !== 8 || png[25] !== 6 || png[26] !== 0 || png[27] !== 0 || png[28] !== 0) return null
    const data: Buffer[] = [], kept: Buffer[] = []
    for (let at = 8; at + 12 <= png.length;) {
      const size = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8)
      if (at + size + 12 > png.length) return null
      if (type === 'IDAT') data.push(png.subarray(at + 8, at + 8 + size))
      else if (KEPT_CHUNKS.has(type) && !data.length) kept.push(png.subarray(at, at + size + 12))
      at += size + 12
    }
    const stride = W * 4
    const raw = await inflateAsync(Buffer.concat(data), { maxOutputLength: (stride + 1) * H })
    if (raw.length !== (stride + 1) * H) return null

    // Undo the row filters, tidy the alpha and find the subject, in one pass.
    const pixels = Buffer.alloc(stride * H)
    let left = W, top = H, right = -1, bottom = -1
    for (let y = 0; y < H; y++) {
      const filter = raw[y * (stride + 1)]!, from = y * (stride + 1) + 1, to = y * stride
      if (filter > 4) return null
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? pixels[to + x - 4]! : 0, b = y ? pixels[to + x - stride]! : 0, c = x >= 4 && y ? pixels[to + x - stride - 4]! : 0
        pixels[to + x] = (raw[from + x]! + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0)) & 255
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const at = (y * W + x) * 4, alpha = pixels[at + 3]!
      if (alpha <= STICKER_CLEANUP.clearAlphaUpTo) { pixels.fill(0, at, at + 4); continue }
      if (alpha >= STICKER_CLEANUP.opaqueAlphaFrom) pixels[at + 3] = 255
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
    if (right < 0) return null

    // Grow the canvas only as far as the margin needs and centre the subject; a square stays square.
    const width = right - left + 1, height = bottom - top + 1, usable = 1 - 2 * STICKER_CLEANUP.margin
    let outW = Math.max(W, Math.ceil(width / usable)), outH = Math.max(H, Math.ceil(height / usable))
    if (W === H) outW = outH = Math.max(outW, outH)
    const marginX = Math.ceil(outW * STICKER_CLEANUP.margin), marginY = Math.ceil(outH * STICKER_CLEANUP.margin)
    const roomy = outW === W && outH === H && left >= marginX && top >= marginY && W - 1 - right >= marginX && H - 1 - bottom >= marginY
    const moveX = roomy ? 0 : Math.floor((outW - width) / 2) - left, moveY = roomy ? 0 : Math.floor((outH - height) / 2) - top

    // Write rows with the "up" filter: flat colour and empty space become runs of zeros.
    const outStride = outW * 4, out = Buffer.alloc((outStride + 1) * outH)
    const previous = Buffer.alloc(outStride), row = Buffer.alloc(outStride)
    for (let y = 0; y < outH; y++) {
      row.fill(0)
      const sourceY = y - moveY
      if (sourceY >= top && sourceY <= bottom) pixels.copy(row, (left + moveX) * 4, (sourceY * W + left) * 4, (sourceY * W + right + 1) * 4)
      const at = y * (outStride + 1)
      out[at] = 2
      for (let x = 0; x < outStride; x++) out[at + 1 + x] = (row[x]! - previous[x]!) & 255
      row.copy(previous)
    }
    const header = Buffer.from(png.subarray(16, 29))
    header.writeUInt32BE(outW, 0); header.writeUInt32BE(outH, 4)
    return Buffer.concat([SIGNATURE, chunk('IHDR', header), ...kept, chunk('IDAT', await deflateAsync(out, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
  } catch { return null }
}
