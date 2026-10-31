import { useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import { DEFAULT_DANCE, type DanceCommand, type DanceSettings, type DanceView } from '../../shared/dance-floor'

const reasons: Record<string, string> = {
  dance_idle: 'Stopped', dance_preparing: 'Preparing local audio…', dance_analysing: 'Analysing the track’s rhythm…',
  dance_welcome: 'Raven’s DJ welcome', dance_starting: 'Starting music…', dance_beat_locked: 'Dancing to detected beats',
  dance_no_confident_beat: 'No confident beat in this passage · movement rests', dance_waiting_for_audio: 'Waiting for audio · movement paused',
  dance_track_missing: 'Track unavailable. Add DanceFloor.m4a to Common or add music to Common/DanceFloor, then Refresh.',
  dance_playback_failed: 'Playback failed. Check the media and speakers, then retry Start.',
  dance_track_oversize: 'Every Dance Floor track is larger than 200 MB. Replace it with a smaller file, then Refresh.',
  dance_folder_empty: 'No music found. Add DanceFloor.m4a to Common or add music to Common/DanceFloor, then Refresh.',
  dance_folder_unavailable: 'The shared music folder is unavailable. Check Common in System → Media folders, then Refresh.',
  dance_start_failed: 'Dance Floor could not start. Check the track and speakers, then retry Start.',
  dance_stop_failed: 'Dance Floor could not stop cleanly. Press Stop again, or use the physical STOP key.',
  dance_volume_restore_failed: 'Dance stopped, but the speaker volume could not be restored. Check the Jabra level.',
  dance_settings_invalid: 'Those settings were rejected. Choose a listed track and an offset between −500 and 500 ms.',
  dance_request_rejected: 'The request was rejected. Check the values and retry.',
}
const explain = (reason: string): string => reasons[reason] ?? `Dance Floor needs attention (${reason}).`
export function DanceFloorPanel({ bridge, visible }: { bridge: ConsoleBridge | null | undefined; visible: boolean }): React.JSX.Element {
  const [view, setView] = useState<DanceView>(), [draft, setDraft] = useState<DanceSettings>({ ...DEFAULT_DANCE })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [readError, setReadError] = useState('')
  const dirty = useRef(false), mounted = useRef(true), epoch = useRef(0)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++epoch.current } }, [])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [])
  const accept = (next: DanceView) => { setView(next); if (!dirty.current) setDraft(next.settings) }
  useEffect(() => {
    if (!visible || !bridge?.danceFloor) return
    let stopped = false, pending = false
    const read = async (refresh = false) => {
      if (pending) return; pending = true
      try {
        const result = await bridge.danceFloor!({ action: refresh ? 'refresh' : 'get' })
        if (stopped) return
        if (result.ok) { accept(result.value); setReadError('') } else setReadError(explain(result.reason ?? 'dance_operation_failed'))
      }
      catch { if (!stopped) setReadError('Could not read Dance Floor. Reconnect to the Console.') }
      finally { pending = false }
    }
    void read(true); const timer = setInterval(() => void read(), 750)
    return () => { stopped = true; clearInterval(timer) }
  }, [bridge, visible])
  const edit = (patch: Partial<DanceSettings>) => { dirty.current = true; setDraft(current => ({ ...current, ...patch })); setMessage('Unsaved settings') }
  const run = async (command: DanceCommand) => {
    if (!bridge?.danceFloor || busy && command.action !== 'stop') return
    const run = ++epoch.current; setBusy(true); setError(''); setMessage('')
    try {
      const result = await bridge.danceFloor(command)
      if (!mounted.current || run !== epoch.current) return
      if (!result.ok) throw Error(result.reason ?? 'dance_operation_failed')
      if (command.action === 'save') { dirty.current = false; setMessage('Saved. Intensity, timing and volume apply now; track, language and welcome apply on the next start.') }
      accept(result.value)
    } catch (e) { if (mounted.current && run === epoch.current) setError(explain(e instanceof Error ? e.message : 'dance_operation_failed')) }
    finally { if (mounted.current && run === epoch.current) setBusy(false) }
  }
  const active = view && ['preparing', 'welcome', 'playing'].includes(view.frame.status)
  return <section className="console__panel dance-floor-panel" aria-label="Dance Floor controls">
    <h2>Dance Floor</h2>
    <p>Raven hosts the dance floor. Music plays through the Mac’s connected speakers; microphone and camera stay off.</p>
    <div role="status">{view ? explain(view.frame.reason) : readError || 'Reading Dance Floor…'}</div>
    <p className="console__muted">Default: Common/DanceFloor.m4a. Additional tracks: Common/DanceFloor. Maximum 200 MB per file.</p>
    <label>Track<select aria-label="Dance Floor track" value={draft.track} disabled={busy} onChange={e => edit({ track: e.currentTarget.value })}>
      <option value="">First available Dance Floor track</option>
      {view?.tracks.map(track => <option key={track.id} value={track.id}>{track.name} · {(track.bytes / 1e6).toFixed(1)} MB</option>)}
    </select></label>
    <div className="console__action-row">
      <button disabled={busy} onClick={() => void run({ action: 'refresh' })}>Refresh tracks</button>
    </div>
    <label>Movement intensity · {Math.round(draft.intensity * 100)}%
      <input aria-label="Dance intensity" type="range" min="0" max="1" step="0.05" value={draft.intensity} onChange={e => edit({ intensity: Number(e.currentTarget.value) })} /></label>
    <label>Speaker volume · {Math.round(draft.volume * 100)}%
      <input aria-label="Dance volume" type="range" min="0" max="1" step="0.01" value={draft.volume} onChange={e => edit({ volume: Number(e.currentTarget.value) })} /></label>
    <p className="console__muted">Applied once on Start, or when you save a changed volume. Physical speaker buttons remain free afterward. Fixed-volume outputs use their own amplifier setting.</p>
    <label>Visual timing adjustment (ms)<input aria-label="Dance timing offset" type="number" min="-500" max="500" step="10" value={draft.offsetMs} onChange={e => edit({ offsetMs: Math.max(-500, Math.min(500, Math.round(Number(e.currentTarget.value) || 0))) })} /></label>
    <p className="console__muted">Positive moves Raven earlier; negative moves Raven later. Use this to compensate for the TV and speakers’ delay.</p>
    <label className="dance-floor-checkbox"><input aria-label="DJ welcome" type="checkbox" checked={draft.welcome} onChange={e => edit({ welcome: e.currentTarget.checked })} />Brief in-character DJ welcome</label>
    <label>DJ language<select aria-label="DJ language" value={draft.language} onChange={e => edit({ language: e.currentTarget.value as DanceSettings['language'] })}>
      <option value="zh-TW">繁體中文</option><option value="en">English</option>
    </select></label>
    <div className="console__action-row">
      <button disabled={busy || !dirty.current} onClick={() => void run({ action: 'save', settings: draft })}>Save settings</button>
      <button disabled={busy || dirty.current || active || !view?.tracks.length} onClick={() => void run({ action: 'start' })}>Start Dance Floor</button>
      <button onClick={() => void run({ action: 'stop' })}>Stop Dance Floor</button>
    </div>
    {dirty.current && <p>Save your changes before starting.</p>}
    {view && view.outputs.count > 0 && <p>{view.outputs.count} outputs · {view.outputs.controlled} writable volume controls · {view.outputs.verified ? 'last volume command verified' : 'volume needs attention'}</p>}
    <p className="console__muted">Stop ends music and DJ speech, restores the speakers (Jabra 70%) and returns Raven to Conversation; the app keeps running. The physical STOP key still shuts the installation down. Change track and restart to use another selection.</p>
    {message && <p role="status">{message}</p>}{(error || view && readError) && <p role="alert">{error || readError}</p>}
  </section>
}
