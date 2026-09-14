import { useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'
import type { ManagedVisualAsset } from '../../shared/types'
import { getAudioDeviceRouter } from '../audio-devices'
import { ResourceAccess } from './ResourceAccess'
import type { AvatarCatalog } from '../../shared/avatar-profiles'

export function VisualThumbnail({ asset }: { asset: ManagedVisualAsset }) {
  const [failed, setFailed] = useState(false)
  const url = `magic-mirror-media://visual-draft/${encodeURIComponent(asset.id)}`
  return <div className="media-thumbnail">
    {failed ? <span role="status">Preview unavailable</span> : asset.kind === 'image'
      ? <img src={url} alt={asset.name} loading="lazy" onError={() => setFailed(true)} />
      : <video src={url} aria-label={`${asset.name} video thumbnail`} preload="metadata" muted playsInline
        onLoadedMetadata={e => { e.currentTarget.currentTime = Math.min(0.1, e.currentTarget.duration / 2) }} onError={() => setFailed(true)} />}
    <span className="media-thumbnail__kind">{asset.kind === 'video' ? 'Video' : 'Image'}</span>
  </div>
}

export function MediaLibrary({ draft, bridge, disabled, onImport, avatarId = '', onCatalogChange }: {
  draft: ConsoleConfigDraftInput; bridge: ConsoleBridge; disabled: boolean; onImport(): void
  avatarId?: string; onCatalogChange?(catalog: AvatarCatalog): void
}) {
  const [playing, setPlaying] = useState('')
  const [reason, setReason] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    if (!playing) return
    const audio = audioRef.current
    if (!audio) return
    let cancelled = false
    const router = getAudioDeviceRouter()
    const stopVolumes = router.watchVolumes(volumes => { audio.volume = 0.5 * volumes.bgm })
    setReason('Loading audio preview…')
    void (async () => {
      const runtime = await bridge.getAvatarRuntime()
      if (cancelled) return
      if (runtime.ok && runtime.value.audioDevices) await router.select(runtime.value.audioDevices.preferences)
      const outputId = router.snapshot().preferences.outputId
      let fallback = false
      try { await audio.setSinkId(outputId) }
      catch { await audio.setSinkId(''); fallback = true }
      if (cancelled) return
      await audio.play()
      if (!cancelled) setReason(fallback ? 'Playing locally · 50% preview level × BGM volume · Selected speakers unavailable; using Windows default.' : 'Playing locally · 50% preview level × BGM volume')
    })().catch(() => { if (!cancelled) { setReason('Audio preview failed. Check the file and selected speakers.'); setPlaying('') } })
    return () => { cancelled = true; stopVolumes(); audio.pause(); audio.removeAttribute('src'); audio.load() }
  }, [playing, bridge])
  return <section className="media-library" aria-label="Media library">
    <div className="console__action-row"><button type="button" className="console__primary" disabled={disabled} onClick={onImport}>Browse & upload media…</button><span className="console__muted">Select images, videos and audio together · up to 32 files</span></div>
    <p className="console__muted">Files are copied locally. Save Draft to keep their links; Publish is separate.</p>
    {reason ? <p role="status">{reason}</p> : null}
    {playing ? <audio key={playing} ref={audioRef} src={`magic-mirror-media://music-draft/${encodeURIComponent(playing)}`} data-library-audio="true"
      onEnded={() => { setPlaying(''); setReason('Preview finished.') }} onError={() => { setPlaying(''); setReason('Audio preview failed: this file could not be decoded.') }} /> : null}
    <fieldset><legend>Managed visuals</legend><ul className="media-cards">
      {draft.visualAssets.map(asset => <li key={asset.id} className="media-card"><VisualThumbnail asset={asset} /><strong>{asset.name}</strong>
        <span>{asset.width}×{asset.height}{asset.kind === 'video' ? ` · ${((asset.durationMs ?? 0) / 1000).toFixed(1)}s` : ''}</span>
        {onCatalogChange ? <ResourceAccess catalog={draft.avatarCatalog} avatarId={avatarId} kind="visual" resourceId={asset.id} disabled={disabled} onChange={onCatalogChange} /> : null}</li>)}
    </ul>{!draft.visualAssets.length ? <p className="console__empty">No images or videos yet.</p> : null}</fieldset>
    <fieldset><legend>Managed music</legend><ul className="media-cards">
      {draft.musicAssets.map(asset => <li key={asset.id} className="media-card"><div className="media-card__audio" aria-hidden="true">♫</div><strong>{asset.name}</strong>
        <span>{asset.mimeType.replace('audio/', '').toUpperCase()} · {(asset.byteLength / 1048576).toFixed(1)} MB</span>
        <button type="button" aria-label={`${playing === asset.id ? 'Stop' : 'Play'} ${asset.name}`} onClick={() => {
          setReason(playing === asset.id ? 'Preview stopped.' : 'Loading audio preview…'); setPlaying(playing === asset.id ? '' : asset.id)
        }}>{playing === asset.id ? 'Stop preview' : 'Test play'}</button>
        {onCatalogChange ? <ResourceAccess catalog={draft.avatarCatalog} avatarId={avatarId} kind="music" resourceId={asset.id} disabled={disabled} onChange={onCatalogChange} /> : null}</li>)}
    </ul>{!draft.musicAssets.length ? <p className="console__empty">No audio yet.</p> : null}</fieldset>
  </section>
}
