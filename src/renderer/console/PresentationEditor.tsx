import { useEffect, useState } from 'react'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'
import type { LifecycleState } from '../../shared/types'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'
import { PresentationStage } from '../avatar/PresentationStage'
import { AvatarCanvas } from '../avatar/AvatarCanvas'
import type { PresentationPhase } from '../avatar/presentation-controller'

const ignore = () => undefined
export function PresentationEditor({ draft, onChange, disabled }: {
  draft: ConsoleConfigDraftInput; onChange(draft: ConsoleConfigDraftInput): void; disabled: boolean
}) {
  const config = draft.presentation ?? DEFAULT_PRESENTATION
  const [lifecycle, setLifecycle] = useState<LifecycleState>('dormant')
  const [phase, setPhase] = useState<PresentationPhase>('asleep')
  const [cycle, setCycle] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [reason, setReason] = useState('')
  const edit = (patch: Partial<typeof config>) => { setReason(''); onChange({ ...draft, presentation: { ...config, ...patch } }) }
  useEffect(() => {
    if (!cycle) return
    setLifecycle('dormant')
    const enter = setTimeout(() => setLifecycle('active'), 2000)
    const timer = setTimeout(() => { setLifecycle('dormant'); setCycle(false) }, 2000 + config.entranceMs + 2500)
    return () => { clearTimeout(enter); clearTimeout(timer) }
  }, [cycle, config.entranceMs])
  return <fieldset className="presentation-editor" disabled={disabled}>
    <legend>Avatar presentation</legend>
    <p>Choose what visitors see before waking the mirror, during conversation, and when it goes back to sleep.</p>
    <div className="presentation-editor__layout">
      <div className="console__form-grid">
        <label>Visibility mode<select value={config.mode} onChange={e => edit({ mode: e.currentTarget.value as typeof config.mode })}>
          <option value="always_visible">Always visible</option><option value="emerge">Emerge from mist</option>
        </select></label>
        <label>Background image / looping video<select value={config.backgroundId} onChange={e => edit({ backgroundId: e.currentTarget.value })}>
          <option value="">Built-in atmosphere</option>{draft.visualAssets.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}
        </select></label>
        <label>Sleep ambience (loops)<select value={config.ambienceId} onChange={e => edit({ ambienceId: e.currentTarget.value })}>
          <option value="">No ambience</option>{draft.musicAssets.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}
        </select></label>
        <label>Ambience volume · {Math.round(config.ambienceGain * 100)}%<input type="range" min="0" max="1" step="0.05" value={config.ambienceGain} onChange={e => edit({ ambienceGain: Number(e.currentTarget.value) })} /></label>
        <label>Entrance seconds<input type="number" min="0.2" max="10" step="0.1" value={config.entranceMs / 1000} onChange={e => edit({ entranceMs: Math.round(Number(e.currentTarget.value) * 1000) })} /></label>
        <label>Exit seconds<input type="number" min="0.2" max="10" step="0.1" value={config.exitMs / 1000} onChange={e => edit({ exitMs: Math.round(Number(e.currentTarget.value) * 1000) })} /></label>
        <p className="console__muted">Cubism motions: Waking → Listening → Suspending → Dormant. Mist is a built-in effect. Background video is muted; ambience fades out on wake and uses your selected speakers.</p>
        <p className="console__muted">Import media in the Media library. Save, Test and Publish below to apply this presentation to the mirror.</p>
      </div>
      <div className="presentation-editor__preview-panel">
        <div className="console__action-row">
          <button type="button" aria-label="Preview entrance" onClick={() => { setReason(''); setPreviewing(true); setCycle(false); setLifecycle('active') }}>Entrance</button>
          <button type="button" aria-label="Preview exit" onClick={() => { setReason(''); setPreviewing(true); setCycle(false); setLifecycle('dormant') }}>Exit / sleep</button>
          <button type="button" aria-label="Preview full cycle" disabled={disabled || cycle} onClick={() => { setReason(''); setPreviewing(true); setCycle(true) }}>Preview draft</button>
          <button type="button" disabled={disabled || !previewing} onClick={() => { setPreviewing(false); setCycle(false) }}>Stop preview</button>
        </div>
        <div className="presentation-preview">
          <PresentationStage payload={{ config: { ...config }, background: draft.visualAssets.find(a => a.id === config.backgroundId) ?? null }} lifecycle={previewing ? lifecycle : 'starting'} onPhase={setPhase} onFailure={setReason} draft>
            <AvatarCanvas embedded state={phase === 'entering' ? 'Waking' : phase === 'exiting' ? 'Suspending' : phase === 'awake' ? 'Listening' : 'Dormant'}
              onRenderer={ignore} onMetrics={ignore} onEvent={e => { if (e.status === 'failed') setReason(e.reason) }} />
          </PresentationStage>
        </div>
        <p role="status">Local draft preview · {previewing ? phase : 'stopped'} · uses selected media and speakers</p>
        {reason ? <p className="console__fault" role="alert">Preview: {reason}</p> : null}
        <p className="console__muted">Local only. No microphone or live changes.</p>
      </div>
    </div>
  </fieldset>
}
