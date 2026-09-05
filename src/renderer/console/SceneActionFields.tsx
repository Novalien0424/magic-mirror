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
              <label>Name<input value={action.name} onChange={(event) => onChange({ ...action, name: event.currentTarget.value })} /></label>
              <label><input type="checkbox" checked={action.enabled} onChange={(event) => onChange({ ...action, enabled: event.currentTarget.checked })} /> Enabled</label>
              <label>Kind<select value={action.kind} onChange={(event) => onChange({ ...newSceneAction(event.currentTarget.value as SceneActionKind, 0), id: action.id, name: action.name })}>{(['avatar_dialogue', 'avatar_motion', 'avatar_expression', 'lighting', 'fog', 'music', 'visual'] as const).map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
              {action.kind === 'avatar_dialogue' ? <label>Text<textarea value={action.text} onChange={(event) => onChange({ ...action, text: event.currentTarget.value })} /></label> : null}
              {action.kind === 'avatar_motion' ? <label>Cubism motion group<select value={action.motionGroup} onChange={(event) => onChange({ ...action, motionGroup: event.currentTarget.value })}>{REN_MOTION_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}</select></label> : null}
              {action.kind === 'avatar_expression' ? <label>Cubism expression<select value={action.expression} onChange={(event) => onChange({ ...action, expression: event.currentTarget.value })}>{REN_EXPRESSION_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : null}
              {action.kind === 'lighting' || action.kind === 'fog' ? <>
                <label>Command<select value={action.command} onChange={(event) => onChange(event.currentTarget.value === 'value' ? { ...action, command: 'value', value: 0.5 } : { id: action.id, name: action.name, enabled: action.enabled, kind: action.kind, command: event.currentTarget.value as 'on' | 'off', presetId: action.presetId })}><option value="on">ON</option><option value="off">OFF</option><option value="value">Value</option></select></label>
                <label>Approved preset<input value={action.presetId} onChange={(event) => onChange({ ...action, presetId: event.currentTarget.value })} /></label>
                {action.command === 'value' ? <label>Value 0–1<input type="number" min="0" max="1" step="0.05" value={action.value} onChange={(event) => onChange({ ...action, value: Number(event.currentTarget.value) })} /></label> : null}
              </> : null}
              {action.kind === 'music' ? <>
                <label>Command<select value={action.command} onChange={(event) => {
                  const command = event.currentTarget.value
                  onChange(command === 'play'
                    ? { id: action.id, name: action.name, enabled: action.enabled, kind: 'music', command: 'play', assetId: draft?.musicAssets[0]?.id ?? '', gain: 1, loop: false }
                    : command === 'fade'
                      ? { id: action.id, name: action.name, enabled: action.enabled, kind: 'music', command: 'fade', targetGain: 0, durationMs: 1000 }
                      : { id: action.id, name: action.name, enabled: action.enabled, kind: 'music', command: 'stop', fadeDurationMs: 0 })
                }}><option value="play">Play</option><option value="stop">Stop</option><option value="fade">Fade</option></select></label>
                {action.command === 'play' ? <><label>Asset<select value={action.assetId} onChange={(event) => onChange({ ...action, assetId: event.currentTarget.value })}><option value="">Select asset</option>{(draft?.musicAssets ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label><label>Gain<input type="number" min="0" max="1" step="0.05" value={action.gain} onChange={(event) => onChange({ ...action, gain: Number(event.currentTarget.value) })} /></label><label><input type="checkbox" checked={action.loop} onChange={(event) => onChange({ ...action, loop: event.currentTarget.checked })} /> Loop</label></> : null}
                {action.command === 'stop' ? <label>Fade ms<input type="number" min="0" value={action.fadeDurationMs} onChange={(event) => onChange({ ...action, fadeDurationMs: Number(event.currentTarget.value) })} /></label> : null}
                {action.command === 'fade' ? <><label>Target gain<input type="number" min="0" max="1" step="0.05" value={action.targetGain} onChange={(event) => onChange({ ...action, targetGain: Number(event.currentTarget.value) })} /></label><label>Duration ms<input type="number" min="1" value={action.durationMs} onChange={(event) => onChange({ ...action, durationMs: Number(event.currentTarget.value) })} /></label></> : null}
              </> : null}
              {action.kind === 'visual' ? <>
                <label>Asset<select value={action.assetId} onChange={(event) => {
                  const assetId = event.currentTarget.value
                  const asset = draft?.visualAssets.find((item) => item.id === assetId)
                  onChange({
                    ...action,
                    assetId,
                    playback: asset?.kind === 'video' ? 'once' : 'still',
                    audio: 'muted',
                    gain: 0,
                  })
                }}><option value="">Select asset</option>{(draft?.visualAssets ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.kind})</option>)}</select></label>
                <label>Fit<select value={action.fit} onChange={(event) => onChange({ ...action, fit: event.currentTarget.value as 'contain' | 'cover' })}><option value="contain">Contain</option><option value="cover">Cover</option></select></label>
                {draft?.visualAssets.find((asset) => asset.id === action.assetId)?.kind === 'video' ? <>
                  <label>Playback<select value={action.playback} onChange={(event) => onChange({ ...action, playback: event.currentTarget.value as 'once' | 'loop' })}><option value="once">Once</option><option value="loop">Loop</option></select></label>
                  <label>Audio<select value={action.audio} onChange={(event) => onChange({ ...action, audio: event.currentTarget.value as 'muted' | 'embedded', gain: event.currentTarget.value === 'muted' ? 0 : Math.max(action.gain, 0.5) })}><option value="muted">Muted</option><option value="embedded">Embedded track</option></select></label>
                  {action.audio === 'embedded' ? <label>Gain<input type="number" min="0" max="1" step="0.05" value={action.gain} onChange={(event) => onChange({ ...action, gain: Number(event.currentTarget.value) })} /></label> : null}
                  {action.audio === 'embedded' && draft?.visualAssets.find((asset) => asset.id === action.assetId)?.audioTrack === 'unknown' ? <p className="console__muted">Audio track could not be verified; test this Draft on Windows before Publish.</p> : null}
                </> : null}
              </> : null}
 </div>
}
