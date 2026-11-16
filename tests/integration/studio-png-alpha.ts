import { inflateSync } from 'node:zlib'

/** Decode the alpha samples of the provider's normal noninterlaced RGBA PNG. */
export function pngAlpha(image: Buffer): { width: number; height: number; transparentPixels: number; visiblePixels: number; maximumAlpha: number } {
  if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Error('probe_png_required')
  const width = image.readUInt32BE(16), height = image.readUInt32BE(20)
  if (image[24] !== 8 || image[25] !== 6 || image[28] !== 0) throw Error('probe_png_rgba8_noninterlaced_required')
  const chunks: Buffer[] = []
  for (let offset = 8; offset + 12 <= image.length;) {
    const size = image.readUInt32BE(offset), type = image.toString('ascii', offset + 4, offset + 8)
    if (offset + size + 12 > image.length) throw Error('probe_png_truncated')
    if (type === 'IDAT') chunks.push(image.subarray(offset + 8, offset + 8 + size))
    offset += size + 12
  }
  const stride = width * 4, raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height })
  if (raw.length !== (stride + 1) * height) throw Error('probe_png_scanline_size')
  let previous = Buffer.alloc(stride), transparentPixels = 0, visiblePixels = 0, maximumAlpha = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!, row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)))
    if (filter > 4) throw Error('probe_png_filter')
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4]! : 0, b = previous[x]!, c = x >= 4 ? previous[x - 4]! : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      row[x] = (row[x]! + predictor) & 255
      if (x % 4 === 3) { if (row[x] === 0) transparentPixels++; else visiblePixels++; maximumAlpha = Math.max(maximumAlpha, row[x]!) }
    }
    previous = row
  }
  return { width, height, transparentPixels, visiblePixels, maximumAlpha }
}

