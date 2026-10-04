import * as React from 'react'
import { getAudioDeviceRouter } from '../audio-devices'

/** Operator-only preview, disposed on avatar/tab changes. Never starts Mirror playback. */
export function MediaPreview({ kind, id, name, gain }: { kind: 'video' | 'music'; id: string; name: string; gain: number }): React.JSX.Element {
  const ref = React.useRef<HTMLMediaElement | null>(null)
  const [reason, setReason] = React.useState('')
  React.useEffect(() => {
    const media = ref.current
    if (!media) return
    let disposed = false, detach = () => {}
    const router = getAudioDeviceRouter()
    const volumes = router.watchVolumes(value => { media.volume = gain * value.bgm })
    const unsubscribe = router.subscribe(state => {
      if (state.reason.startsWith('audio_output_')) setReason('Selected speakers unavailable; preview is using the system default or cannot route audio.')
    })
    void router.attach(media, () => disposed).then(cleanup => { if (disposed) cleanup(); else detach = cleanup })
    return () => { disposed = true; volumes(); unsubscribe(); detach(); media.pause() }
  }, [gain])
  const props = {
    controls: true, preload: 'none', 'aria-label': `Preview ${name}`, 'data-media-preview': true,
    src: `magic-mirror-media://${kind === 'video' ? 'visual' : 'music'}-draft/${encodeURIComponent(id)}`,
    onPlay: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      document.querySelectorAll<HTMLMediaElement>('[data-media-preview]').forEach(media => { if (media !== event.currentTarget) media.pause() })
    },
    onError: () => setReason('Preview unavailable. Check the file or import it again.'),
  }
  return <details className="media-skill-preview" onToggle={event => { if (!event.currentTarget.open) ref.current?.pause() }}>
    <summary>Preview {kind}</summary>
    {kind === 'video' ? <video {...props} playsInline ref={element => { ref.current = element }} />
      : <audio {...props} ref={element => { ref.current = element }} />}
    {reason && <p role="status">{reason}</p>}
    <p className="console__muted">Plays here in Console. Say “loop [name]” to repeat on Mirror.</p>
  </details>
}
