import { HelpField } from './HelpField'
import { FIELD_HELP } from './field-help-text'
import { useEffect, useState } from 'react'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'
import type { LifecycleState } from '../../shared/types'
import { DEFAULT_PRESENTATION, parsePresentation } from '../../shared/presentation'
import { PresentationStage } from '../avatar/PresentationStage'
import { AvatarCanvas } from '../avatar/AvatarCanvas'
import type { PresentationPhase } from '../avatar/presentation-controller'

const ignore = () => undefined
export function PresentationEditor({ draft, onChange, disabled, model }: {
  draft: ConsoleConfigDraftInput; onChange(draft: ConsoleConfigDraftInput): void; disabled: boolean
  model?: import('../../shared/avatar-profiles').AvatarModelReference
}) {
  const config = draft.presentation ?? DEFAULT_PRESENTATION
  const [lifecycle, setLifecycle] = useState<LifecycleState>('dormant')
  const [phase, setPhase] = useState<PresentationPhase>('asleep')
  const [previewKind, setPreviewKind] = useState<'entrance' | 'exit' | 'cycle' | null>(null)
  const [previewRun, setPreviewRun] = useState(0)
  const [reason, setReason] = useState('')
  const reflective = config.mode === 'reflective'
  const videos = draft.visualAssets.filter(asset => asset.kind === 'video')
  const entranceVideo = videos.find(asset => asset.id === config.entranceVideoId)
  const exitVideo = videos.find(asset => asset.id === config.exitVideoId)
  const blackHoldMs = config.blackHoldMs ?? 400
  const revealStartMs = config.revealStartMs ?? 1500
  const timingError = reflective && blackHoldMs > revealStartMs ? 'Black hold must finish at or before the reveal starts.'
    : reflective && revealStartMs >= config.entranceMs ? 'Reveal must start before the entrance ends.' : ''
  const error = timingError || (config.entranceVideoId && !entranceVideo || config.exitVideoId && !exitVideo
    ? 'Select available videos for the entrance and exit, or choose No video.'
    : !parsePresentation(config) ? 'Check timing ranges, whole milliseconds, volume levels and the greeting/farewell fields.' : '')
  const stop = () => setPreviewKind(null)
  const edit = (patch: Partial<typeof config>) => { stop(); setReason(''); onChange({ ...draft, presentation: { ...config, ...patch } }) }
  const preview = (kind: 'entrance' | 'exit' | 'cycle') => {
    if (error) return
    setReason(''); setLifecycle(kind === 'entrance' ? 'active' : 'dormant')
    setPhase(kind === 'exit' ? 'awake' : 'asleep')
    setPreviewKind(kind); setPreviewRun(run => run + 1)
  }
  useEffect(() => {
    if (previewKind !== 'cycle') return
    const enter = setTimeout(() => setLifecycle('active'), 2000)
    const timer = setTimeout(() => setLifecycle('dormant'), 2000 + config.entranceMs + 2500)
    return () => { clearTimeout(enter); clearTimeout(timer) }
  }, [previewKind, previewRun, config.entranceMs])
  useEffect(() => { setPreviewKind(null) }, [config.mode, config.entranceMs, config.exitMs, config.blackHoldMs,
    config.revealStartMs, config.entranceVideoId, config.exitVideoId, config.entranceBlend, config.exitBlend,
    config.ambienceId, config.ambienceGain, config.activeAmbienceGain, config.backgroundId, model?.id])
  return <fieldset className="presentation-editor">
    <legend>Avatar presentation</legend>
    <p>Choose what visitors see before waking the mirror, during conversation, and when it goes back to sleep.</p>
    <div className="presentation-editor__layout">
      <fieldset className="console__form-grid" disabled={disabled}>
        <HelpField help={FIELD_HELP.visibility}>Visibility mode<select value={config.mode} onChange={e => edit({ mode: e.currentTarget.value as typeof config.mode })}>
          <option value="always_visible">Always visible</option><option value="emerge">Emerge from mist</option>
          <option value="reflective">Reflective mirror · black when dormant</option>
        </select></HelpField>
        <button type="button" onClick={() => edit({ mode: 'reflective', blackHoldMs: 400, revealStartMs: 1500, entranceMs: 4000, exitMs: 2400 })}>Quiet, ceremonial dread</button>
        {!reflective ? <HelpField help={FIELD_HELP.background}>Background image / looping video<select value={config.backgroundId} onChange={e => edit({ backgroundId: e.currentTarget.value })}>
          <option value="">Built-in atmosphere</option>{draft.visualAssets.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}
        </select></HelpField> : null}
        <HelpField help={FIELD_HELP.ambience}>{reflective ? 'Dormant music (loops)' : 'Sleep ambience (loops)'}<select value={config.ambienceId} onChange={e => edit({ ambienceId: e.currentTarget.value })}>
          <option value="">No ambience</option>{draft.musicAssets.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}
        </select></HelpField>
        <HelpField help={FIELD_HELP.ambienceVolume}>{reflective ? 'Dormant music volume' : 'Ambience volume'} · {Math.round(config.ambienceGain * 100)}%<input type="range" min="0" max="1" step="0.05" value={config.ambienceGain} onChange={e => edit({ ambienceGain: Number(e.currentTarget.value) })} /></HelpField>
        <HelpField help={FIELD_HELP.activeBgmVolume}>Active BGM volume · {Math.round((config.activeAmbienceGain ?? 0) * 100)}%<input type="range" min="0" max="1" step="0.05" value={config.activeAmbienceGain ?? 0} onChange={e => edit({ activeAmbienceGain: Number(e.currentTarget.value) })} /></HelpField>
        {reflective ? <>
          <HelpField help={FIELD_HELP.entranceVideo}>Entrance mist video<select value={config.entranceVideoId ?? ''} onChange={e => edit({ entranceVideoId: e.currentTarget.value })}>
            <option value="">No video · soft fade</option>{videos.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}
          </select></HelpField>
          <HelpField help={FIELD_HELP.exitVideo}>Exit mist video<select value={config.exitVideoId ?? ''} onChange={e => edit({ exitVideoId: e.currentTarget.value })}>
            <option value="">No video · soft fade</option>{videos.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}
          </select></HelpField>
          <HelpField help={FIELD_HELP.ritualBlend}>Entrance video background<select value={config.entranceBlend ?? 'screen'} onChange={e => edit({ entranceBlend: e.currentTarget.value as 'screen' | 'normal' })}>
            <option value="screen">Black background · screen blend</option><option value="normal">Transparent background · normal blend</option>
          </select></HelpField>
          <HelpField help={FIELD_HELP.ritualBlend}>Exit video background<select value={config.exitBlend ?? 'screen'} onChange={e => edit({ exitBlend: e.currentTarget.value as 'screen' | 'normal' })}>
            <option value="screen">Black background · screen blend</option><option value="normal">Transparent background · normal blend</option>
          </select></HelpField>
          <HelpField help={FIELD_HELP.blackHold}>Black hold seconds<input type="number" min="0" max="10" step="0.1" value={blackHoldMs / 1000} onChange={e => edit({ blackHoldMs: Math.round(Number(e.currentTarget.value) * 1000) })} /></HelpField>
          <HelpField help={FIELD_HELP.revealStart}>Reveal starts at seconds<input type="number" min="0" max="10" step="0.1" value={revealStartMs / 1000} onChange={e => edit({ revealStartMs: Math.round(Number(e.currentTarget.value) * 1000) })} /></HelpField>
          <p className="console__muted">Black hold ≤ reveal start &lt; entrance duration. The avatar fades in from the reveal start until the entrance ends.</p>
        </> : null}
        <HelpField help={FIELD_HELP.entrance}>Entrance seconds<input type="number" min="0.2" max="10" step="0.1" value={config.entranceMs / 1000} onChange={e => edit({ entranceMs: Math.round(Number(e.currentTarget.value) * 1000) })} /></HelpField>
        <HelpField help={FIELD_HELP.exit}>Exit seconds<input type="number" min="0.2" max="10" step="0.1" value={config.exitMs / 1000} onChange={e => edit({ exitMs: Math.round(Number(e.currentTarget.value) * 1000) })} /></HelpField>
        <HelpField help={FIELD_HELP.wakeGreeting}>Wake greeting<textarea maxLength={500} value={config.wakeGreeting ?? DEFAULT_PRESENTATION.wakeGreeting} onChange={e => edit({ wakeGreeting: e.currentTarget.value })} /></HelpField>
        <HelpField help={FIELD_HELP.sleepFarewell}>Sleep farewell (verbatim)<textarea maxLength={500} value={config.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell} onChange={e => edit({ sleepFarewell: e.currentTarget.value })} /></HelpField>
        {error ? <p className="console__fault" role="alert">{error} Fix this before previewing, saving or publishing.</p> : null}
        <p className="console__muted">Videos are muted. Music mutes during avatar speech, then fades back in. Uses your selected speakers.{reflective ? ' Dormant music returns only when the exit is complete and the mirror is black.' : ''}</p>
        {reflective && (!entranceVideo || !exitVideo) ? <p className="console__muted">Missing video uses a soft fade. No mist is generated.</p> : null}
        <p className="console__muted">Import media in the Media library. Save, Test and Publish below to apply this presentation to the mirror.</p>
      </fieldset>
      <div className="presentation-editor__preview-panel">
        <div className="console__action-row">
          <button type="button" aria-label="Preview entrance" disabled={disabled || !!error} onClick={() => preview('entrance')}>Entrance</button>
          <button type="button" aria-label="Preview exit" disabled={disabled || !!error} onClick={() => preview('exit')}>Exit / sleep</button>
          <button type="button" aria-label="Preview full cycle" disabled={disabled || !!error} onClick={() => preview('cycle')}>Preview draft</button>
          <button type="button" disabled={!previewKind} onClick={stop}>Stop preview</button>
        </div>
        <div className="presentation-preview">
          {previewKind && !error ? <PresentationStage key={previewRun} payload={{ config: { ...config },
            background: draft.visualAssets.find(a => a.id === config.backgroundId) ?? null,
            entranceVideo: entranceVideo ? { id: entranceVideo.id, kind: 'video' } : null,
            exitVideo: exitVideo ? { id: exitVideo.id, kind: 'video' } : null }}
            initialPhase={previewKind === 'exit' ? 'awake' : 'asleep'} lifecycle={lifecycle} onPhase={setPhase} onFailure={setReason} draft>
            <AvatarCanvas embedded model={model} state={phase === 'entering' ? 'Waking' : phase === 'exiting' ? 'Suspending' : phase === 'awake' ? 'Listening' : 'Dormant'}
              onRenderer={ignore} onMetrics={ignore} onEvent={e => { if (e.status === 'failed') setReason(e.reason) }} />
          </PresentationStage> : <p>Preview stopped. Choose Entrance, Exit / sleep or Preview draft.</p>}
        </div>
        <p role="status">Local draft preview · {previewKind ? phase : 'stopped'} · uses selected media and speakers</p>
        {reason === 'presentation_ritual_video_missing' ? <p className="console__muted" role="status">Missing video uses a soft fade.</p>
          : reason ? <p className="console__fault" role="alert">Preview: {reason.startsWith('presentation_ritual_video_') ? 'Video unavailable. The avatar uses a soft fade.' : reason}</p> : null}
        <p className="console__muted">Full-cycle preview uses local video and music. No microphone or provider speech. Greeting is live only; reflective greeting waits for the reveal to finish. Save, check and publish to apply live changes.</p>
      </div>
    </div>
  </fieldset>
}
