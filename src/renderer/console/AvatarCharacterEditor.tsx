import * as React from 'react'
import type { ConsoleWakeTuningDefaults } from '../../shared/console-types'
import { useEffect, useRef, useState } from 'react'
import { HelpField } from './HelpField'
import { FIELD_HELP } from './field-help-text'
import type { AvatarProfile, AvatarWakeTuning } from '../../shared/avatar-profiles'
import { DEFAULT_WAKE_PHRASE, LEGACY_SLEEP_PHRASE } from '../../shared/avatar-commands'
import { DEFAULT_PRESENTATION } from '../../shared/presentation'
import { WakeCalibrationPanel } from './WakeCalibrationPanel'

export function AvatarCharacterEditor({ avatar, onChange, disabled, focusName, onNameFocused, wakeDefaults, calibrationBridge, visible = true }: {
  calibrationBridge?: Pick<import('../../shared/bridge').ConsoleBridge, 'wakeCalibration'> | null
  visible?: boolean
  wakeDefaults?: ConsoleWakeTuningDefaults | null
  focusName?: boolean; onNameFocused?: () => void
  avatar: AvatarProfile; onChange(avatar: AvatarProfile): void; disabled: boolean
}): React.JSX.Element {
  const nameInput = useRef<HTMLInputElement>(null)
  const [tuningOpen, setTuningOpen] = useState(false)
  useEffect(() => {
    if (focusName && !disabled) { nameInput.current?.focus(); nameInput.current?.select(); onNameFocused?.() }
  }, [avatar.id, focusName, disabled, onNameFocused])
  const settings = { name: avatar.name, personality: avatar.personality, speakingStyle: avatar.speakingStyle,
    wakePhrase: avatar.wakePhrase ?? DEFAULT_WAKE_PHRASE,
    sleepPhrase: avatar.sleepPhrase ?? LEGACY_SLEEP_PHRASE,
    spellPhrases: avatar.spells.filter(s => s.enabled).map(s => s.phrase),
    wakeGreeting: avatar.presentation.wakeGreeting ?? DEFAULT_PRESENTATION.wakeGreeting!,
    sleepFarewell: avatar.presentation.sleepFarewell ?? DEFAULT_PRESENTATION.sleepFarewell! }
  const tuning = avatar.wakeTuning
  const tuningEnabled = tuning?.enabled === true && tuning.phrase === settings.wakePhrase
  const updateTuning = (change: Partial<AvatarWakeTuning>): void => {
    const next: AvatarWakeTuning = {
      ...(tuning ?? { phrase: settings.wakePhrase, enabled: false }),
      ...change,
      phrase: settings.wakePhrase,
    }
    onChange({ ...avatar, wakeTuning: next })
  }
  const updateWakePhrase = (wakePhrase: string): void => {
    onChange({
      ...avatar,
      wakePhrase,
      // A phrase edit invalidates detector overrides until explicitly enabled
      // again for the new exact phrase.
      ...(tuning ? { wakeTuning: { ...tuning, phrase: wakePhrase, enabled: false } } : {}),
    })
  }
  const effective = (key: 'threshold' | 'score' | 'numTrailingBlanks'): number | '' => (tuningEnabled ? tuning?.[key] : undefined) ?? wakeDefaults?.[key] ?? ''
  const optionalNumber = (value: string): number | undefined => value.trim() === '' ? undefined : Number(value)
  return <fieldset disabled={disabled} className="avatar-character"><legend className="console__sr-only">Persona</legend>
    <div className="console__form-grid">
      <HelpField help={FIELD_HELP.avatarName}>Avatar name<input ref={nameInput} aria-label="Avatar name" maxLength={80} value={avatar.name} onChange={e => onChange({ ...avatar, name: e.currentTarget.value })} /></HelpField>
      <HelpField help={FIELD_HELP.avatarWakePhrase}>Wake phrase<input aria-label="Avatar wake phrase" maxLength={96} value={settings.wakePhrase} onChange={e => updateWakePhrase(e.currentTarget.value)} /></HelpField>
      <HelpField help={FIELD_HELP.avatarSleepPhrase}>Sleep phrase<input aria-label="Avatar sleep phrase" maxLength={96} value={settings.sleepPhrase} onChange={e => onChange({ ...avatar, sleepPhrase: e.currentTarget.value })} /></HelpField>
      <HelpField help={FIELD_HELP.personality}>Personality<textarea rows={5} maxLength={12000} value={avatar.personality} onChange={e => onChange({ ...avatar, personality: e.currentTarget.value })} /></HelpField>
      <HelpField help={FIELD_HELP.idle}>Sleep after inactivity (seconds)<input type="number" min={1} max={86400} value={avatar.idleSeconds} onChange={e => onChange({ ...avatar, idleSeconds: Number(e.currentTarget.value) })} /></HelpField>
    </div>
    <details className="avatar-wake-tuning" onToggle={event => setTuningOpen(event.currentTarget.open)}>
      <summary>Wake sensitivity tuning</summary>
      <p className="console__muted">Values below show what this avatar’s draft will use after publishing. Enable per-avatar tuning to adjust them, then Save all changes → Publish all changes. Clear an override to restore its package value.</p>
      {wakeDefaults ? <p aria-label="Wake package defaults">Package defaults: threshold {wakeDefaults.threshold} · score {wakeDefaults.score} · trailing blanks {wakeDefaults.numTrailingBlanks}.</p>
        : <p role="status">Package values unavailable. Check the wake package status; existing overrides are retained.</p>}
      <div className="console__form-grid">
        <HelpField help={FIELD_HELP.avatarWakeTuningEnable}>Use per-avatar tuning<input aria-label="Enable avatar wake tuning" type="checkbox" checked={tuningEnabled} onChange={e => updateTuning({ enabled: e.currentTarget.checked })} /></HelpField>
        <HelpField help={FIELD_HELP.avatarWakeThreshold}>Threshold override (0–1)<input aria-label="Wake threshold override" type="number" min={0} max={1} step={0.01} placeholder="Unavailable" disabled={!tuningEnabled} value={effective('threshold')} onChange={e => updateTuning({ threshold: optionalNumber(e.currentTarget.value) })} /></HelpField>
        <HelpField help={FIELD_HELP.avatarWakeScore}>Score override (&gt;0)<input aria-label="Wake score override" type="number" min={0.01} max={100} step={0.01} placeholder="Unavailable" disabled={!tuningEnabled} value={effective('score')} onChange={e => updateTuning({ score: optionalNumber(e.currentTarget.value) })} /></HelpField>
        <HelpField help={FIELD_HELP.avatarWakeTrailingBlanks}>Trailing blanks (1–100)<input aria-label="Wake trailing blanks override" type="number" min={1} max={100} step={1} placeholder="Unavailable" disabled={!tuningEnabled} value={effective('numTrailingBlanks')} onChange={e => updateTuning({ numTrailingBlanks: optionalNumber(e.currentTarget.value) })} /></HelpField>
      </div>
      <p aria-label="Effective wake tuning">Effective draft values: threshold {effective('threshold') === '' ? 'unavailable' : effective('threshold')} ({tuningEnabled && tuning?.threshold !== undefined ? 'override' : 'package'}) · score {effective('score') === '' ? 'unavailable' : effective('score')} ({tuningEnabled && tuning?.score !== undefined ? 'override' : 'package'}) · trailing blanks {effective('numTrailingBlanks') === '' ? 'unavailable' : effective('numTrailingBlanks')} ({tuningEnabled && tuning?.numTrailingBlanks !== undefined ? 'override' : 'package'}).</p>
      {calibrationBridge?.wakeCalibration && wakeDefaults && <WakeCalibrationPanel bridge={calibrationBridge} visible={visible && tuningOpen} avatarName={avatar.name}
        initial={{ avatarId: avatar.id, phrase: settings.wakePhrase, threshold: Number(effective('threshold')), score: Number(effective('score')), numTrailingBlanks: Number(effective('numTrailingBlanks')) }}
        onApply={values => updateTuning({ enabled: true, threshold: values.threshold, score: values.score, numTrailingBlanks: values.numTrailingBlanks })} />}
    </details>
    <p className="console__muted">Published voice and character changes apply to the next conversation. Both visitor and avatar speech keep the conversation awake.</p>
  </fieldset>
}
