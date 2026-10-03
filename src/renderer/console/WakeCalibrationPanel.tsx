import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { WakeCalibrationCommand, WakeCalibrationSettings, WakeCalibrationSnapshot } from '../../shared/wake-calibration'
import type { WakeScore } from '../../shared/wake-score'
import { WakeRecoveryStatus } from './WakeRecoveryStatus'

export function WakeScoreMeter({ score, testing, threshold }: {
  score: WakeScore | null; testing: boolean; threshold: number
}): React.JSX.Element {
  const current = testing ? score : null
  return <label>Wake match score
    {current ? <>
      <meter aria-label="Wake match score" min="0" max="1" value={current.acousticScore} />
      <strong>{`${current.acousticScore.toFixed(3)} / 1.000`}</strong>
      <small>{`${current.matchedTokens} / ${current.totalTokens} sound tokens · threshold ${threshold.toFixed(3)}`}</small>
      <small>{current.matchedTokens < current.totalTokens ? 'Phrase incomplete'
        : current.acousticScore < threshold ? 'Complete phrase below threshold' : 'Complete phrase at or above threshold'}</small>
    </> : <small>{testing ? 'No native score available — waiting for decoder data.' : 'Test stopped'}</small>}
  </label>
}

export function WakeCalibrationPanel({ bridge, visible, avatarName, initial, onApply }: {
  bridge: Pick<ConsoleBridge, 'wakeCalibration'>
  visible: boolean
  avatarName: string
  initial: WakeCalibrationSettings
  onApply(settings: WakeCalibrationSettings): void
}): React.JSX.Element {
  const [settings, setSettings] = useState(initial)
  const [snapshot, setSnapshot] = useState<WakeCalibrationSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const session = useRef<string | null>(null)
  const generation = useRef(0)
  const sent = useRef('')
  const mounted = useRef(true)
  const invoke = async (command: WakeCalibrationCommand): Promise<WakeCalibrationSnapshot> => {
    const result = await bridge.wakeCalibration!(command)
    if (!result.ok) throw new Error('Wake calibration is unavailable. Check the wake microphone status.')
    return result.value
  }
  const accept = (value: WakeCalibrationSnapshot): void => {
    if (!mounted.current) return
    setSnapshot(value)
    if (value.status === 'testing' && value.input?.recovery?.state !== 'failed') setMessage('')
    if (value.status === 'failed') setMessage(value.reason === 'wake_calibration_requires_sleep'
      ? 'Put the Mirror to sleep before testing; conversation currently owns the microphone.'
      : value.reason === 'wake_native_score_unavailable' ? 'Numerical wake scoring is unavailable on this installation. Rebuild the native extension, then restart Magic Mirror.'
      : 'The wake test failed. Check the microphone connection, save any draft edits, then close and restart Magic Mirror.')
  }
  const stop = async (): Promise<void> => {
    generation.current++
    const id = session.current
    session.current = null
    if (mounted.current) { setSnapshot(null); setBusy(false) }
    if (id) {
      try { const result = await invoke({ type: 'stop', sessionId: id }); accept(result) }
      catch { if (mounted.current) setMessage('The test connection failed. Save any draft edits, then close and restart Magic Mirror. Published settings restore automatically.') }
    }
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; void stop() }
  }, [])
  useEffect(() => {
    if (!visible) void stop()
  }, [visible])
  useEffect(() => {
    void stop()
    setSettings(initial)
  }, [initial.avatarId, initial.phrase])
  useEffect(() => {
    if (!session.current) setSettings(initial)
  }, [initial.threshold, initial.score, initial.numTrailingBlanks])
  useEffect(() => {
    const hide = (): void => { if (document.hidden) void stop() }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])
  const id = snapshot?.sessionId
  useEffect(() => {
    if (!visible) return
    let stopped = false
    let reading = false
    const poll = async (): Promise<void> => {
      if (reading || session.current !== (id ?? null)) return
      reading = true
      const token = generation.current
      try {
        const result = await invoke(id ? { type: 'read', sessionId: id } : { type: 'status' })
        if (!stopped && generation.current === token && session.current === (id ?? null)) {
          accept(result)
          if (id && result.sessionId !== id) session.current = null
        }
      } catch { if (!stopped) setMessage('The wake test connection failed. Save any draft edits, then close and restart Magic Mirror.') }
      finally { reading = false }
    }
    const timer = setInterval(() => { void poll() }, 500)
    void poll()
    return () => { stopped = true; clearInterval(timer) }
  }, [id, visible])
  useEffect(() => {
    if (!id || !visible || session.current !== id) return
    const encoded = JSON.stringify(settings)
    if (encoded === sent.current) return
    const timer = setTimeout(async () => {
      sent.current = encoded
      setBusy(true)
      try {
        const result = await invoke({ type: 'update', sessionId: id, settings })
        if (session.current === id) accept(result)
      } catch { setMessage('Could not apply the test settings. Save any draft edits, then close and restart Magic Mirror.') }
      finally { if (mounted.current) setBusy(false) }
    }, 400)
    return () => clearTimeout(timer)
  }, [settings, id, visible])
  const start = async (): Promise<void> => {
    const token = ++generation.current
    setBusy(true); setMessage(''); sent.current = JSON.stringify(settings)
    try {
      const result = await invoke({ type: 'start', settings })
      if (!mounted.current || generation.current !== token) {
        if (result.sessionId) await invoke({ type: 'stop', sessionId: result.sessionId })
        return
      }
      session.current = result.sessionId
      accept(result)
    } catch { setMessage('Could not start the wake test. Save any draft edits, then close and restart Magic Mirror.') }
    finally { if (mounted.current) setBusy(false) }
  }
  const testing = Boolean(id && session.current === id)
  const detected = testing && snapshot?.lastDetectionAgeMs !== null && (snapshot?.lastDetectionAgeMs ?? Infinity) < 2000
  const level = snapshot?.input
  const hasAudio = level?.state === 'signal' || level?.state === 'silent'
  const db = hasAudio && level.peak > 0 ? 20 * Math.log10(level.peak) : -Infinity
  const triggerStatus = detected ? 'DETECTED' : !testing ? 'Test stopped'
    : hasAudio ? 'Listening for the phrase'
      : level?.state === 'recovering' ? 'Recovering microphone…'
        : level?.state === 'failed' ? 'Microphone unavailable'
          : level?.state === 'stalled' ? 'Audio stream stalled' : 'Waiting for audio…'
  return <section className="wake-calibration" aria-label="Live wake calibration">
    <h4>Test wake phrase</h4>
    <p><strong>{avatarName}</strong> · {initial.phrase}</p>
    <p>The Mirror stays asleep during this test. Repeat the phrase and adjust the values below.</p>
    <WakeRecoveryStatus recovery={snapshot?.input?.recovery} />
    <div className="console__command-list">
      <button type="button" disabled={busy || testing || !visible} onClick={() => { void start() }}>Start live test</button>
      <button type="button" disabled={!testing && !busy} onClick={() => { void stop() }}>Stop test</button>
      <button type="button" disabled={busy} onClick={() => { onApply(settings); void stop(); setMessage('Values copied to this avatar’s draft. Save and publish to keep them after restart.') }}>Use in draft</button>
    </div>
    <div className="console__form-grid">
      <label>Threshold · {settings.threshold.toFixed(2)}<input aria-label="Live wake threshold" type="range" min="0" max="1" step="0.01" value={settings.threshold}
        onChange={event => setSettings({ ...settings, threshold: Number(event.currentTarget.value) })} /><small>Lower is easier to trigger; it can also increase false wakes.</small></label>
      <label>Keyword score<input aria-label="Live wake score" type="number" min="0.01" max="100" step="0.1" value={settings.score}
        onChange={event => { const score = Number(event.currentTarget.value); if (score > 0 && score <= 100) setSettings({ ...settings, score }) }} /><small>Higher gives the keyword more weight.</small></label>
      <label>Trailing blanks<input aria-label="Live wake trailing blanks" type="number" min="1" max="100" step="1" value={settings.numTrailingBlanks}
        onChange={event => { const numTrailingBlanks = Number(event.currentTarget.value); if (Number.isInteger(numTrailingBlanks) && numTrailingBlanks >= 1 && numTrailingBlanks <= 100) setSettings({ ...settings, numTrailingBlanks }) }} /></label>
    </div>
    <div className="wake-calibration__meters">
      <label>Microphone level <meter aria-label="Calibration microphone level" min="0" max="60" value={Math.max(0, 60 + db)} /><small>{hasAudio ? `${Number.isFinite(db) ? db.toFixed(1) : '−∞'} dBFS` : 'No live audio measurement'}</small></label>
      <WakeScoreMeter score={snapshot?.input?.detector ?? null} testing={testing} threshold={snapshot?.settings?.threshold ?? settings.threshold} />
    </div>
    <strong role="status">{triggerStatus}</strong>
    <p>Detections at these settings: <strong>{snapshot?.detections ?? 0}</strong>{snapshot?.lastDetectionAgeMs != null ? ` · Last trigger ${(snapshot.lastDetectionAgeMs / 1000).toFixed(1)} seconds ago` : ''}</p>
    <p className="console__detail">The score measures the matching part of the detector’s best guess during each update, not a probability of waking. A partial phrase can score highly. All sound tokens and the trailing silence must match before it triggers. No audio is recorded.</p>
    {testing && snapshot?.input?.detector && <p className="console__detail">Decoder steps: {snapshot.input.detector.decodedSteps} · Candidate trailing blanks: {snapshot.input.detector.trailingBlanks}</p>}
    {snapshot?.settings && <p aria-label="Live detector settings">{busy ? 'Applying settings…' : 'Testing'} threshold {snapshot.settings.threshold} · score {snapshot.settings.score} · trailing blanks {snapshot.settings.numTrailingBlanks} · Input {snapshot.input?.state ?? 'unavailable'}</p>}
    {message && <p role="alert">{message}</p>}
    <p className="console__detail">Test changes are temporary. Use in draft, then Save and Publish to keep them after restart.</p>
  </section>
}
