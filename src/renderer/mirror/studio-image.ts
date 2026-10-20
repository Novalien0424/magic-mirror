/**
 * Downscales a RAM-only Portrait Studio image to a small JPEG data URL for the
 * Realtime model, so the reveal fits one data-channel message (Fable review).
 */
export async function downscaleStudioImage(url: string, maxSide = 512, quality = 0.82): Promise<string | null> {
  if (!/^magic-mirror-media:\/\/studio\/[a-z0-9-]{8,64}$/.test(url)) return null
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) return null
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    return dataUrl.length <= 400_000 ? dataUrl : null
  } finally { bitmap.close() }
}
