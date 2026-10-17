import { useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import { isFolderMediaId, type FolderMediaEntry } from '../../shared/media-folders'
import { DEFAULT_LOOP_VIDEO, parseLoopVideoSettings, type LoopVideoCommand, type LoopVideoSettings,
  type LoopVideoView, type OperatorLoopSnapshot } from '../../shared/operator-loop'
import { ReasonDetail } from './reason-copy'

export function sameLoopVideoSettings(left: LoopVideoSettings, right: LoopVideoSettings): boolean {
  return left.videoId === right.videoId && left.audioMode === right.audioMode && left.audioId === right.audioId
    && left.fit === right.fit && left.volume === right.volume
}

export function loopVideoValidation(settings: LoopVideoSettings, entries: readonly FolderMediaEntry[]): string {
  if (!parseLoopVideoSettings(settings)) return 'Check the video, audio source, fit and volume settings.'
  const available = (id: string, kind: FolderMediaEntry['kind']) => isFolderMediaId(id)
    && entries.some(entry => entry.origin === 'shared' && entry.kind === kind && entry.assetId === id)
  if (!settings.videoId) return 'Select a video from the Common folder.'
  if (!available(settings.videoId, 'video')) return 'The selected video is unavailable. Check System → Media folders.'
  if (settings.audioMode === 'separate' && !available(settings.audioId, 'music')) return 'Select available music from the Common folder.'
  return ''
}

function safeReason(reason: string | undefined, fallback: string): string {
  const code = reason?.replace(/^cause=/, '')
  return code && /^operator_loop_[a-z0-9_]{1,80}$/.test(code) ? code : fallback
}

function MutedLoopPreview({ videoId, visible, fit }: { videoId: string; visible: boolean; fit: LoopVideoSettings['fit'] }): React.JSX.Element {
  const ref = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const video = ref.current
    setFailed(false)
    if (!video) return
    video.muted = true; video.volume = 0
    if (visible && videoId) video.src = `magic-mirror-media://visual-draft/${encodeURIComponent(videoId)}`
    return () => { video.pause(); video.removeAttribute('src'); video.load() }
  }, [visible, videoId])
  return <details className="loop-video-preview" onToggle={event => { if (!event.currentTarget.open) ref.current?.pause() }}>
    <summary>Muted local preview</summary>
    <video ref={ref} muted controls playsInline preload="metadata" disablePictureInPicture
      style={{ objectFit: fit }} aria-label="Muted loop video preview"
      onPlay={event => { if (!visible) event.currentTarget.pause(); event.currentTarget.muted = true }}
      onVolumeChange={event => {
        if (!event.currentTarget.muted) event.currentTarget.muted = true
        if (event.currentTarget.volume !== 0) event.currentTarget.volume = 0
      }} onError={() => setFailed(true)} />
    <p className="console__muted">Silent preview in Console. Use Play on Mirror for the saved video and audio.</p>
    {failed && <p role="status">Preview unavailable. Check the selected file in System → Media folders.</p>}
  </details>
}

function playbackCopy(snapshot: OperatorLoopSnapshot | null): string {
  if (!snapshot) return 'Reading Mirror playback status…'
  if (snapshot.mode === 'avatar') return 'Avatar mode'
  if (snapshot.status === 'failed') return 'Loop video failed. Mirror stays black. Use Return to Avatar to exit.'
  if (snapshot.status === 'recovering') return 'Recovering loop video… Voice and camera are off.'
  if (snapshot.status === 'preparing') return 'Preparing loop video… Voice and camera are off.'
  return 'Loop video playing. Voice and camera are off.'
}

/** Global operator settings; deliberately independent of avatar drafts/publishing. */
export function LoopVideoPanel({ bridge, visible, onMediaFolders, onPlaybackChange }: {
  bridge: ConsoleBridge | null; visible: boolean; onMediaFolders(): void; onPlaybackChange?(snapshot: OperatorLoopSnapshot): void
}): React.JSX.Element {
  const [draft, setDraft] = useState<LoopVideoSettings | null>(null)
  const [saved, setSaved] = useState<LoopVideoSettings | null>(null)
  const savedRef = useRef<LoopVideoSettings | null>(null)
  const [snapshot, setSnapshot] = useState<OperatorLoopSnapshot | null>(null)
  useEffect(() => { if (snapshot) onPlaybackChange?.(snapshot) }, [snapshot, onPlaybackChange])
  const [entries, setEntries] = useState<FolderMediaEntry[]>([])
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [apiError, setApiError] = useState('')
  const [statusError, setStatusError] = useState('')
  const [savedMessage, setSavedMessage] = useState(false)
  const [action, setAction] = useState<LoopVideoCommand['action'] | null>(null)
  const epoch = useRef(0), pending = useRef<LoopVideoCommand['action'] | null>(null)
  const mounted = useRef(false)
  const settings = draft ?? DEFAULT_LOOP_VIDEO
  const dirty = !!draft && !!saved && !sameLoopVideoSettings(draft, saved)
  const validation = loopVideoValidation(settings, entries)
  const available = !!bridge?.loopVideo
  const acceptView = (view: LoopVideoView, replaceDraft: boolean): boolean => {
    const next = parseLoopVideoSettings(view.settings)
    if (!next) return false
    const previousSaved = savedRef.current
    setDraft(current => replaceDraft || !current || previousSaved && sameLoopVideoSettings(current, previousSaved) ? { ...next } : current)
    savedRef.current = next; setSaved(next); setSnapshot(view.snapshot)
    return true
  }

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; epoch.current++ }
  }, [])
  useEffect(() => {
    if (!dirty) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
  useEffect(() => {
    if (!bridge?.loopVideo) return
    let disposed = false, polling = false
    const refresh = async () => {
      if (disposed || polling || pending.current) return
      polling = true
      const requestEpoch = epoch.current
      try {
        const result = await bridge.loopVideo!({ action: 'get' })
        if (disposed || requestEpoch !== epoch.current) return
        if (result.ok && acceptView(result.value, false)) setStatusError('')
        else setStatusError(result.ok ? 'operator_loop_invalid_response'
          : safeReason(result.fields?.[0]?.message ?? result.reason, 'operator_loop_status_unavailable'))
      } catch { if (!disposed && requestEpoch === epoch.current) setStatusError('operator_loop_status_unavailable') }
      finally { polling = false }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 1000)
    return () => { disposed = true; clearInterval(timer) }
  }, [bridge, visible])
  useEffect(() => {
    if (!visible || !bridge?.mediaFolders) return
    let disposed = false, polling = false
    const refresh = async () => {
      if (polling) return
      polling = true
      try {
        const result = await bridge.mediaFolders!({ action: 'get' })
        if (disposed) return
        if (result.ok) {
          setEntries(result.value.entries.filter(entry => entry.origin === 'shared'))
          setLibraryLoaded(true)
          setLibraryError(result.value.reason || result.value.shared?.status === 'unavailable'
            ? 'Common media is unavailable. Check System → Media folders.' : '')
        } else setLibraryError('Could not read Common media. Check System → Media folders.')
      } catch { if (!disposed) setLibraryError('Could not read Common media. Check System → Media folders.') }
      finally { polling = false }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => { disposed = true; clearInterval(timer) }
  }, [bridge, visible])

  const edit = (patch: Partial<LoopVideoSettings>) => {
    setDraft(current => ({ ...(current ?? DEFAULT_LOOP_VIDEO), ...patch }))
    setSavedMessage(false); setApiError('')
  }
  const run = async (command: LoopVideoCommand) => {
    if (!bridge?.loopVideo || pending.current && command.action !== 'stop') return
    const requestEpoch = ++epoch.current
    pending.current = command.action; setAction(command.action); setApiError(''); setSavedMessage(false)
    try {
      const result = await bridge.loopVideo(command)
      if (!mounted.current || requestEpoch !== epoch.current) return
      if (result.ok && acceptView(result.value, command.action === 'save')) {
        setStatusError(''); setSavedMessage(command.action === 'save')
      } else setApiError(result.ok ? 'operator_loop_invalid_response'
        : safeReason(result.fields?.[0]?.message ?? result.reason, 'operator_loop_request_failed'))
    } catch { if (mounted.current && requestEpoch === epoch.current) setApiError('operator_loop_request_failed') }
    finally {
      if (mounted.current && requestEpoch === epoch.current) { pending.current = null; setAction(null) }
    }
  }
  const videos = entries.filter(entry => entry.kind === 'video')
  const music = entries.filter(entry => entry.kind === 'music')
  const configured = !!draft && !!saved && libraryLoaded && !libraryError && !validation
  return <section className="console__panel loop-video-panel" aria-labelledby="console-loop-video">
    <div className="console__panel-heading"><div><h2 id="console-loop-video">Loop Video</h2>
      <p>One video repeats on Mirror until you return to the avatar here or with Stream Deck.</p></div></div>
    <div className="loop-video-status" role="status"><strong>{playbackCopy(snapshot)}</strong>
      <button type="button" disabled={!available || action === 'stop'} onClick={() => void run({ action: 'stop' })}>Return to Avatar</button></div>
    <p className="console__muted">Global settings, separate from avatar music, conversation and publishing. Video and separate music loop independently at the volume below.</p>
    {!available && <p role="alert" className="console__fault">Loop Video is unavailable. Reopen the updated Console.</p>}
    {(apiError || statusError) && <div role="alert" className="console__fault"><ReasonDetail code={apiError || statusError} /></div>}
    {snapshot?.mode === 'loop' && snapshot.reason && (snapshot.status === 'failed'
      ? <ReasonDetail code={safeReason(snapshot.reason, 'operator_loop_playback_failed')} />
      : <details className="console__technical"><summary>Playback detail</summary><code>{safeReason(snapshot.reason, 'operator_loop_playback_status')}</code></details>)}
    {libraryError && <p role="alert" className="console__fault">{libraryError}</p>}
    {available && !bridge?.mediaFolders && <p role="alert" className="console__fault">Common media listing is unavailable. Reopen the updated Console.</p>}
    {visible && bridge?.mediaFolders && !libraryLoaded && !libraryError && <p role="status">Reading Common media…</p>}
    {libraryLoaded && !videos.length && <div className="console__empty"><p>No shared videos found. Link a Common folder and add a video to get started.</p>
      <button type="button" onClick={onMediaFolders}>Open System Media folders</button></div>}
    <div className="loop-video-layout"><div>
      <fieldset className="console__form-grid" disabled={!available || !draft || action !== null}>
        <legend>Global loop settings</legend>
        <label>Common video<select aria-label="Loop video" value={settings.videoId} onChange={event => edit({ videoId: event.currentTarget.value })}>
          <option value="">Choose a shared video…</option>{videos.map(entry => <option value={entry.assetId} key={entry.assetId}>{entry.name}</option>)}
          {settings.videoId && !videos.some(entry => entry.assetId === settings.videoId) && <option value={settings.videoId}>Selected video unavailable</option>}
        </select></label>
        <label>Audio source<select aria-label="Loop audio source" value={settings.audioMode} onChange={event => edit({ audioMode: event.currentTarget.value as LoopVideoSettings['audioMode'], audioId: '' })}>
          <option value="embedded">Video’s embedded audio</option><option value="separate">Mute video + separate music</option>
        </select></label>
        {settings.audioMode === 'separate' && <label>Common music<select aria-label="Loop music" value={settings.audioId} onChange={event => edit({ audioId: event.currentTarget.value })}>
          <option value="">Choose shared music…</option>{music.map(entry => <option value={entry.assetId} key={entry.assetId}>{entry.name}</option>)}
          {settings.audioId && !music.some(entry => entry.assetId === settings.audioId) && <option value={settings.audioId}>Selected music unavailable</option>}
        </select></label>}
        <label>Video fit<select aria-label="Loop video fit" value={settings.fit} onChange={event => edit({ fit: event.currentTarget.value as LoopVideoSettings['fit'] })}>
          <option value="contain">Contain · show whole video</option><option value="cover">Cover · fill screen and crop edges</option>
        </select></label>
        <label>Loop volume · {Math.round(settings.volume * 100)}%<input aria-label="Loop volume" type="range" min="0" max="1" step="0.01"
          value={settings.volume} onChange={event => edit({ volume: Number(event.currentTarget.value) })} /></label>
      </fieldset>
      <button type="button" onClick={onMediaFolders}>Manage Common media in System</button>
    </div>{settings.videoId && videos.some(entry => entry.assetId === settings.videoId)
      && <MutedLoopPreview videoId={settings.videoId} fit={settings.fit} visible={visible} />}</div>
    {draft && libraryLoaded && validation && <p role="status">{validation}</p>}
    <div className="console__action-row loop-video-actions">
      <button type="button" disabled={!available || action !== null || !dirty || !configured}
        onClick={() => void run({ action: 'save', settings })}>Save settings</button>
      <button type="button" className="console__primary" disabled={!available || action !== null || dirty || !configured}
        onClick={() => void run({ action: 'play' })}>Play on Mirror</button>
      <span role="status">{dirty ? 'Unsaved changes. Save settings before playing.' : savedMessage ? 'Settings saved.' : saved ? 'Saved settings' : 'Loading saved settings…'}</span>
    </div>
  </section>
}
