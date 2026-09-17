import { REALTIME_PROMPTS } from '../../shared/realtime-prompts'
import { HelpField } from './HelpField'
import { FIELD_HELP, VOICE_FIELD_HELP } from './field-help-text'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import { AVATAR_VOICES, type AvatarProfile, type AvatarModel } from '../../shared/avatar-profiles'
import { DEFAULT_VOICE_EFFECTS, VOICE_EFFECT_PRESETS, type VoiceEffects } from '../../shared/voice-effects'
import { avatarLibraryName } from '../../shared/avatar-library'
import { AvatarCanvas } from '../avatar/AvatarCanvas'
import type { CubismAvatarRenderer } from '../avatar/cubism-avatar'
import { startVoiceAudition, type VoiceAudition } from './voice-preview'

const sliders = [
  ['pitchSemitones', 'Pitch · semitones', -12, 12, 0.1], ['formantSemitones', 'Body / formant · semitones', -6, 6, 0.1],
  ['warmthDb', 'Warmth · dB', -6, 6, 0.1], ['brightnessDb', 'Brightness · dB', -6, 6, 0.1],
  ['grit', 'Grit', 0, 0.3, 0.01], ['roomMix', 'Room mix', 0, 0.25, 0.01], ['outputTrimDb', 'Output trim · dB', -18, 0, 0.5],
] as const
export function VoiceStudio({ avatar, model, disabled, bridge, onChange }: {
  avatar: AvatarProfile; model?: AvatarModel; disabled: boolean; bridge: ConsoleBridge | null; onChange(avatar: AvatarProfile): void
}) {
  const effects = avatar.voiceEffects ?? DEFAULT_VOICE_EFFECTS
  const [file, setFile] = useState<File>(), [loop, setLoop] = useState(false), [original, setOriginal] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const localSpeechHelpId = useId()
  const [running, setRunning] = useState(false), [status, setStatus] = useState('Select an approved speech fixture, or generate a test voice.')
  const [rigName, setRigName] = useState(model?.name ?? 'Built-in Ren')
  const audition = useRef<VoiceAudition | null>(null), controller = useRef<AbortController | null>(null), generation = useRef(0)
  const pending = useRef<Promise<VoiceAudition> | null>(null)
  const cleanup = useRef<Promise<void>>(Promise.resolve())
  const latestEffects = useRef(effects)
  latestEffects.current = original ? { ...effects, enabled: false } : effects
  const renderer = useRef<CubismAvatarRenderer | null>(null), analyser = useRef<AnalyserNode | null>(null)
  const onRenderer = useCallback((value: CubismAvatarRenderer | null) => { renderer.current = value }, [])
  useEffect(() => {
    let cancelled = false
    setRigName(model?.name ?? 'Built-in Ren')
    if (bridge && model) void bridge.listAvatarModels().then(result => {
      if (cancelled) return
      const label = result.ok ? result.value.labels?.[model.id] : undefined
      if (label) setRigName(avatarLibraryName(label))
      if (!result.ok) setStatus('Rig library labels unavailable.')
    }).catch(() => { if (!cancelled) setStatus('Rig library labels unavailable.') })
    return () => { cancelled = true }
  }, [bridge, model?.id, model?.name])
  const stop = useCallback(async () => {
    const previous = audition.current, preparing = pending.current
    pending.current = null
    ++generation.current; controller.current?.abort(); controller.current = null
    audition.current = null; analyser.current = null
    renderer.current?.setMouthOpen(0); setRunning(false)
    cleanup.current = Promise.allSettled([cleanup.current, previous?.stop(), preparing?.then(value => value.stop())]).then(() => undefined)
    await cleanup.current
  }, [])
  useEffect(() => () => { void stop() }, [avatar.id, stop])
  useEffect(() => bridge?.onVoicePreviewCancelled?.(reason => { stop(); setStatus(reason) }), [bridge, stop])
  useEffect(() => {
    const timer = requestAnimationFrame(() => { void audition.current?.update(original ? { ...effects, enabled: false } : effects).catch(() => setStatus('Voice effect update failed.')) })
    return () => cancelAnimationFrame(timer)
  }, [effects, original])
  useEffect(() => {
    if (!running) return
    let frame: number
    const samples = new Float32Array(2048)
    const tick = (): void => {
      analyser.current?.getFloatTimeDomainData(samples)
      const rms = analyser.current ? Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length) : 0
      renderer.current?.setMouthOpen(Math.min(1, rms * 5)); frame = requestAnimationFrame(tick)
    }
    tick(); return () => { cancelAnimationFrame(frame); renderer.current?.setMouthOpen(0) }
  }, [running])
  const start = async (generated: boolean): Promise<void> => {
    const retiring = stop(); if (!bridge) return
    const current = ++generation.current, abort = new AbortController(); controller.current = abort
    setRunning(true); setStatus('Preparing voice preview…')
    try {
      await retiring
      if (generation.current !== current || abort.signal.aborted) return
      const preparing = startVoiceAudition({ bridge, avatar: { ...avatar, voiceEffects: original ? { ...effects, enabled: false } : effects },
        ...(generated ? {} : { file }), loop, signal: abort.signal,
        onAnalyser: node => { if (generation.current === current) analyser.current = node },
        onStatus: reason => { if (generation.current === current) setStatus(reason) },
        onEnded: () => { if (generation.current === current) { setRunning(false); audition.current = null; setStatus(previous => previous.startsWith('Generating one audition') || previous.startsWith('Local fixture playing') ? 'Audition finished.' : previous) } },
      })
      pending.current = preparing
      const value = await preparing
      if (pending.current === preparing) pending.current = null
      if (generation.current !== current) await value.stop(); else { audition.current = value; await value.update(latestEffects.current) }
    } catch (error) { if (generation.current === current) { setRunning(false); setStatus(error instanceof Error ? error.message : 'Voice preview failed.') } }
  }
  const edit = (patch: Partial<VoiceEffects>): void => onChange({ ...avatar, voiceEffects: { ...effects, ...patch } })
  const presetKey = Object.entries(VOICE_EFFECT_PRESETS).find(([, value]) => JSON.stringify(value) === JSON.stringify(effects))?.[0]
  const preset = presetKey === 'ethereal' ? 'Ethereal' : presetKey === 'darkOracle' ? 'Dark oracle' : effects.enabled ? 'Custom' : 'Bypassed'
  return <section className="voice-studio" aria-label="Voice Studio">
    <div className="voice-studio__layout"><div>
      <p className="console__muted">Rig: {rigName} · Preset: {preset}</p>
      <p className="console__muted">Draft voice settings. Published changes apply to the next conversation.</p>
      <fieldset disabled={disabled}><legend>Voice and delivery</legend><div className="console__form-grid">
        <HelpField help={FIELD_HELP.baseVoice}>Base voice<select value={avatar.voice} onChange={e => onChange({ ...avatar, voice: e.currentTarget.value })}>{AVATAR_VOICES.map(voice => <option key={voice}>{voice}</option>)}</select></HelpField>
        <HelpField help={FIELD_HELP.speechSpeed}>Speech speed · {(avatar.voiceSpeed ?? 1).toFixed(2)}×<input type="range" min="0.5" max="1.5" step="0.05" value={avatar.voiceSpeed ?? 1} onChange={e => onChange({ ...avatar, voiceSpeed: Number(e.currentTarget.value) })} /></HelpField>
        <HelpField help={FIELD_HELP.deliveryStyle}>Delivery style<textarea value={avatar.speakingStyle} maxLength={2000} rows={3} onChange={e => onChange({ ...avatar, speakingStyle: e.currentTarget.value })} /></HelpField>
      </div><div className="console__action-row">{REALTIME_PROMPTS.authoring.deliveryPresets.map(({name, instructions}) => <button key={name} onClick={() => onChange({ ...avatar, speakingStyle: instructions })}>{name}</button>)}</div></fieldset>
      <fieldset disabled={disabled}><legend>Local voice effects</legend><div className="console__action-row">
        <button onClick={() => onChange({ ...avatar, voiceEffects: { ...VOICE_EFFECT_PRESETS.ethereal }, voiceSpeed: 0.95 })}>Default · Ethereal</button>
        <button onClick={() => onChange({ ...avatar, voiceEffects: { ...VOICE_EFFECT_PRESETS.darkOracle }, voiceSpeed: 0.9 })}>Raven · Dark oracle</button>
        <button onClick={() => { stop(); onChange({ ...avatar, voiceEffects: { ...DEFAULT_VOICE_EFFECTS }, voiceSpeed: 1 }); setStatus('Effects reset to bypass.') }}>Reset</button>
      </div><HelpField help={FIELD_HELP.effectsEnabled}><input type="checkbox" checked={effects.enabled} onChange={e => edit({ enabled: e.currentTarget.checked })} /> Effects enabled</HelpField>
        <details><summary>Fine tuning</summary><div className="console__form-grid">{sliders.map(([key, label, min, max, step]) => <HelpField help={VOICE_FIELD_HELP[key]} key={key}>{label} · {effects[key].toFixed(2)}<input aria-label={label} type="range" min={min} max={max} step={step} value={effects[key]} onChange={e => edit({ [key]: Number(e.currentTarget.value) })} /></HelpField>)}</div>
        <HelpField help={FIELD_HELP.formantCompensation}><input type="checkbox" checked={effects.formantCompensation} onChange={e => edit({ formantCompensation: e.currentTarget.checked })} /> Preserve formants when pitch changes</HelpField>
        <HelpField help={FIELD_HELP.roomSize}>Room size<select value={effects.roomSize} onChange={e => edit({ roomSize: e.currentTarget.value as VoiceEffects['roomSize'] })}><option value="short">Short · 120 ms</option><option value="medium">Medium · 250 ms</option></select></HelpField>
      </details></fieldset></div>
      <div className="voice-studio__preview"><div className="presentation-preview"><AvatarCanvas embedded preview model={model ? { id: model.id, manifestFileName: model.manifestFileName } : undefined}
        state={running ? 'Speaking' : 'Listening'} onRenderer={onRenderer} onMetrics={() => undefined} onEvent={event => { if (event.status === 'failed') setStatus(event.reason) }} /></div>
        <div className="voice-file-picker"><HelpField help={FIELD_HELP.localSpeech} descriptionId={localSpeechHelpId}>Local speech sample
          <input ref={fileInput} hidden aria-label="Local speech sample" type="file" accept="audio/*" onChange={e => { stop(); setFile(e.currentTarget.files?.[0]) }} /></HelpField>
          <button aria-describedby={localSpeechHelpId} onClick={() => fileInput.current?.click()}>Choose audio file</button>
          <p className="console__muted" style={{overflowWrap:'anywhere'}}>{file?.name ?? 'No audio selected'}</p>
        </div>
        <HelpField help={FIELD_HELP.loopFixture}><input type="checkbox" checked={loop} onChange={e => { stop(); setLoop(e.currentTarget.checked) }} /> Loop local fixture</HelpField>
        <div className="console__action-row"><button disabled={disabled || !file || running} onClick={() => void start(false)}>Play local fixture</button><button disabled={disabled || running} onClick={() => void start(true)}>Generate test voice</button><button disabled={!running} onClick={() => { stop(); setStatus('Preview stopped.') }}>Stop</button></div>
        <div className="console__action-row"><button aria-pressed={original} onClick={() => setOriginal(true)}>Original</button><button aria-pressed={!original} onClick={() => setOriginal(false)}>Processed</button></div>
        <p role="status">{status}</p><p className="console__muted">Generate sends this draft voice/style to the provider for one audition, up to 20 seconds. No microphone. Voice, speed and style changes require Generate again.</p>
      </div></div>
  </section>
}
