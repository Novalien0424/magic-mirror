const owners = new WeakMap<HTMLVideoElement, () => void>()

/** A transition owns one muted clip; it never extends the presentation clock. */
export function playRitualVideo(input: {
  video: HTMLVideoElement
  src: string
  delayMs: number
  durationMs: number
  onVisible(visible: boolean): void
  onFailure(reason: string): void
}): () => void {
  const { video } = input
  owners.get(video)?.()
  let cancelled = false
  let played = false
  let started = false
  let failed = false
  let startTimer: ReturnType<typeof setTimeout> | undefined
  let endTimer: ReturnType<typeof setTimeout> | undefined
  let readinessTimer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    if (cancelled) return
    cancelled = true
    clearTimeout(startTimer); clearTimeout(endTimer); clearTimeout(readinessTimer)
    video.removeEventListener('error', error)
    video.removeEventListener('ended', ended)
    video.removeEventListener('playing', playing)
    video.removeEventListener('waiting', waiting)
    video.removeEventListener('stalled', waiting)
    video.pause(); video.removeAttribute('src'); video.load()
    input.onVisible(false)
    if (owners.get(video) === stop) owners.delete(video)
  }
  const fail = (reason: string) => {
    if (cancelled || failed) return
    failed = true
    try { input.onFailure(reason) } catch { /* Reporting cannot retain failed playback. */ }
    stop()
  }
  const error = () => fail('presentation_ritual_video_failed')
  const ended = () => stop()
  const playing = () => {
    if (cancelled) { if (!owners.has(video)) video.pause(); return }
    played = true
    clearTimeout(readinessTimer)
    readinessTimer = undefined
    input.onVisible(true)
  }
  const waiting = () => {
    if (cancelled || !started || readinessTimer !== undefined) return
    readinessTimer = setTimeout(() => fail('presentation_ritual_video_timeout'), 3000)
  }
  owners.set(video, stop)
  input.onVisible(false)
  video.pause(); video.muted = true; video.loop = false; video.playsInline = true; video.preload = 'auto'
  video.addEventListener('error', error)
  video.addEventListener('ended', ended)
  video.addEventListener('playing', playing)
  video.addEventListener('waiting', waiting)
  video.addEventListener('stalled', waiting)
  video.src = input.src; video.load()
  if (cancelled) return stop
  startTimer = setTimeout(() => {
    if (cancelled) return
    started = true
    clearTimeout(readinessTimer)
    readinessTimer = undefined
    waiting()
    try {
      video.currentTime = 0
      void video.play().then(() => {
        if (cancelled) { if (!owners.has(video)) video.pause() }
        else playing()
      }).catch(() => { if (!cancelled) fail('presentation_ritual_video_play_failed') })
    } catch { fail('presentation_ritual_video_play_failed') }
  }, input.delayMs)
  endTimer = setTimeout(() => {
    if ((!played || readinessTimer !== undefined) && !cancelled) fail('presentation_ritual_video_timeout')
    else stop()
  }, input.durationMs)
  return stop
}
