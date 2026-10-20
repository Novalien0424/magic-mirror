/** Content-free measurements; samples stay with the caller. dBFS is not SPL. */
export function pcmLevels(pcm: Int16Array) {
  let energy = 0, peak = 0, clipped = 0
  for (const n of pcm) { const value = Math.abs(n) / 32768; energy += value * value; peak = Math.max(peak, value); if (Math.abs(n) >= 32767) clipped++ }
  const rms = Math.sqrt(energy / Math.max(1, pcm.length))
  return { samples: pcm.length, peak, rms, rmsDbfs: rms > 0 ? 20 * Math.log10(rms) : null, clipped }
}

export function scalePcm(source: Int16Array, gain: number) {
  if (!Number.isFinite(gain) || gain < 0 || gain > 4) throw Error('raven_qa_gain_invalid')
  let clipped = 0
  const pcm = Int16Array.from(source, n => {
    const value = Math.round(n * gain)
    if (value > 32767 || value < -32768) clipped++
    return Math.max(-32768, Math.min(32767, value))
  })
  return { pcm, clipped }
}
