import { HelpField } from './HelpField'
import { FIELD_HELP } from './field-help-text'
import type { ConsoleConfigDraftInput } from '../../shared/console-types'
import { REN_EXPRESSION_NAMES, REN_MOTION_GROUPS, type SceneActionDefinition } from '../../shared/types'

type SceneActionKind = SceneActionDefinition['kind']

export function newSceneAction(kind: SceneActionKind, index: number): SceneActionDefinition {
  const base = { id: `action-${Date.now()}-${index}`, name: 'New action', enabled: true }
  if (kind === 'avatar_dialogue') return { ...base, kind, text: 'Speak these words exactly.' }
  if (kind === 'avatar_motion') return { ...base, kind, motionGroup: 'Scene' }
  if (kind === 'avatar_expression') return { ...base, kind, expression: 'exp_01' }
  if (kind === 'lighting' || kind === 'fog') {
    return { ...base, kind, command: 'on', presetId: 'default' }
  }
  if (kind === 'visual') {
    return { ...base, kind, assetId: '', fit: 'contain', playback: 'still', audio: 'muted', gain: 0 }
  }
  return { ...base, kind: 'music', command: 'stop', fadeDurationMs: 0 }
}


export function SceneActionFields({ action, draft, onChange, onImport }: { action: SceneActionDefinition; draft: ConsoleConfigDraftInput; onChange(action: SceneActionDefinition): void; onImport?(kind: 'visual' | 'music'): void }) {
 return <div className="scene-action-fields">
              {(action.kind === 'visual' || action.kind === 'music') && onImport ? <button type="button" onClick={() => onImport(action.kind as 'visual' | 'music')}>Browse & upload {action.kind === 'visual' ? 'image / video' : 'audio'}…</button> : null}
              <HelpField help={FIELD_HELP.actionName}>Name<input value={action.name} onChange={(event) => onChange({ ...action, name: event.currentTarget.value })} /></HelpField>
              <HelpField help={FIELD_HELP.actionEnabled}><input type="checkbox" checked={action.enabled} onChange={(event) => onChange({ ...action, enabled: event.currentTarget.checked })} /> Enabled</HelpField>
              <HelpField help={FIELD_HELP.actionKind}>Kind<select value={action.kind} onChange={(event) => onChange({ ...newSceneAction(event.currentTarget.value as SceneActionKind, 0), id: action.id, name: action.name })}>{(['avatar_dialogue', 'avatar_motion', 'avatar_expression', 'lighting', 'fog', 'music', 'visual'] as const).map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></HelpField>
              {action.kind === 'avatar_dialogue' ? <HelpField help={FIELD_HELP.dialogue}>Text<textarea value={action.text} onChange={(event) => onChange({ ...action, text: event.currentTarget.value })} /></HelpField> : null}
              {action.kind === 'avatar_motion' ? <HelpField help={FIELD_HELP.motionGroup}>Cubism motion group<select value={action.motionGroup} onChange={(event) => onChange({ ...action, motionGroup: event.currentTarget.value })}>{REN_MOTION_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></HelpField> : null}
              {action.kind === 'avatar_expression' ? <HelpField help={FIELD_HELP.expression}>Cubism expression<select value={action.expression} onChange={(event) => onChange({ ...action, expression: event.currentTarget.value })}>{REN_EXPRESSION_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</select></HelpField> : null}
              {action.kind === 'lighting' || action.kind === 'fog' ? <>
                <HelpField help={FIELD_HELP.hardwareCommand}>Command<select value={action.command} onChange={(event) => onChange(event.currentTarget.value === 'value' ? { ...action, command: 'value', value: 0.5 } : { id: action.id, name: action.name, enabled: action.enabled, kind: action.kind, command: event.currentTarget.value as 'on' | 'off', presetId: action.presetId })}><option value="on">ON</option><option value="off">OFF</option><option value="value">Value</option></select></HelpField>
                <HelpField help={FIELD_HELP.approvedPreset}>Approved preset<input value={action.presetId} onChange={(event) => onChange({ ...action, presetId: event.currentTarget.value })} /></HelpField>
                {action.command === 'value' ? <HelpField help={FIELD_HELP.hardwareValue}>Value 0–1<input type="number" min="0" max="1" step="0.05" value={action.value} onChange={(event) => onChange({ ...action, value: Number(event.currentTarget.value) })} /></HelpField> : null}
              </> : null}
              {action.kind === 'music' ? <>
                <HelpField help={FIELD_HELP.musicCommand}>Command<select value={action.command} onChange={(event) => {
                  const command = event.currentTarget.value
                  onChange(command === 'play'
                    ? { id: action.id, name: action.name, enabled: action.enabled, kind: 'music', command: 'play', assetId: draft?.musicAssets[0]?.id ?? '', gain: 1, loop: false }
                    : command === 'fade'
                      ? { id: action.id, name: action.name, enabled: action.enabled, kind: 'music', command: 'fade', targetGain: 0, durationMs: 1000 }
                      : { id: action.id, name: action.name, enabled: action.enabled, kind: 'music', command: 'stop', fadeDurationMs: 0 })
                }}><option value="play">Play</option><option value="stop">Stop</option><option value="fade">Fade</option></select></HelpField>
                {action.command === 'play' ? <><HelpField help={FIELD_HELP.musicAsset}>Asset<select value={action.assetId} onChange={(event) => onChange({ ...action, assetId: event.currentTarget.value })}><option value="">Select asset</option>{(draft?.musicAssets ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></HelpField><HelpField help={FIELD_HELP.musicGain}>Gain<input type="number" min="0" max="1" step="0.05" value={action.gain} onChange={(event) => onChange({ ...action, gain: Number(event.currentTarget.value) })} /></HelpField><HelpField help={FIELD_HELP.musicLoop}><input type="checkbox" checked={action.loop} onChange={(event) => onChange({ ...action, loop: event.currentTarget.checked })} /> Loop</HelpField></> : null}
                {action.command === 'stop' ? <HelpField help={FIELD_HELP.fadeOut}>Fade ms<input type="number" min="0" value={action.fadeDurationMs} onChange={(event) => onChange({ ...action, fadeDurationMs: Number(event.currentTarget.value) })} /></HelpField> : null}
                {action.command === 'fade' ? <><HelpField help={FIELD_HELP.targetGain}>Target gain<input type="number" min="0" max="1" step="0.05" value={action.targetGain} onChange={(event) => onChange({ ...action, targetGain: Number(event.currentTarget.value) })} /></HelpField><HelpField help={FIELD_HELP.fadeDuration}>Duration ms<input type="number" min="1" value={action.durationMs} onChange={(event) => onChange({ ...action, durationMs: Number(event.currentTarget.value) })} /></HelpField></> : null}
              </> : null}
              {action.kind === 'visual' ? <>
                <HelpField help={FIELD_HELP.visualAsset}>Asset<select value={action.assetId} onChange={(event) => {
                  const assetId = event.currentTarget.value
                  const asset = draft?.visualAssets.find((item) => item.id === assetId)
                  onChange({
                    ...action,
                    assetId,
                    playback: asset?.kind === 'video' ? 'once' : 'still',
                    audio: 'muted',
                    gain: 0,
                  })
                }}><option value="">Select asset</option>{(draft?.visualAssets ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.kind})</option>)}</select></HelpField>
                <HelpField help={FIELD_HELP.fit}>Fit<select value={action.fit} onChange={(event) => onChange({ ...action, fit: event.currentTarget.value as 'contain' | 'cover' })}><option value="contain">Contain</option><option value="cover">Cover</option></select></HelpField>
                {draft?.visualAssets.find((asset) => asset.id === action.assetId)?.kind === 'video' ? <>
                  <HelpField help={FIELD_HELP.playback}>Playback<select value={action.playback} onChange={(event) => onChange({ ...action, playback: event.currentTarget.value as 'once' | 'loop' })}><option value="once">Once</option><option value="loop">Loop</option></select></HelpField>
                  <HelpField help={FIELD_HELP.videoAudio}>Audio<select value={action.audio} onChange={(event) => onChange({ ...action, audio: event.currentTarget.value as 'muted' | 'embedded', gain: event.currentTarget.value === 'muted' ? 0 : Math.max(action.gain, 0.5) })}><option value="muted">Muted</option><option value="embedded">Embedded track</option></select></HelpField>
                  {action.audio === 'embedded' ? <HelpField help={FIELD_HELP.videoGain}>Gain<input type="number" min="0" max="1" step="0.05" value={action.gain} onChange={(event) => onChange({ ...action, gain: Number(event.currentTarget.value) })} /></HelpField> : null}
                  {action.audio === 'embedded' && draft?.visualAssets.find((asset) => asset.id === action.assetId)?.audioTrack === 'unknown' ? <p className="console__muted">Audio track could not be verified; test this Draft on Windows before Publish.</p> : null}
                </> : null}
              </> : null}
 </div>
}
