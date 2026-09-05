import { useState } from 'react'
import type { ConsoleConfigDraftInput, ConsoleConfigSafeView } from '../../shared/console-types'
import type { SceneActionDefinition, SceneDefinition, SceneStageDefinition, SpellConfig } from '../../shared/types'
import { SceneActionFields, newSceneAction } from './SceneActionFields'
import { duplicateStage } from './scene-editor-model'
import { estimateSceneMaximumMs } from './scene-estimate'

const ACTION_NAMES = { visual: 'Image / video', music: 'Music', avatar_dialogue: 'Dialogue',
  avatar_motion: 'Avatar motion', avatar_expression: 'Expression', lighting: 'Lighting', fog: 'Fog' } as const
const id = () => crypto.randomUUID()
const newStep = (index: number): SceneStageDefinition => ({ id: id(), name: `Step ${index + 1}`,
  actionIds: [], endCondition: { kind: 'duration', durationMs: 3000 } })

export function SceneComposer({ draft, active, onChange, onRun, onImport, disabled }: {
  draft: ConsoleConfigDraftInput; active: ConsoleConfigSafeView
  onChange(draft: ConsoleConfigDraftInput): void; onRun(id: string): void; disabled: boolean
  onImport(kind: 'visual' | 'music', actionId: string): void
}) {
  const [sceneId, setSceneId] = useState('')
  const [stepId, setStepId] = useState('')
  const [actionId, setActionId] = useState('')
  const [undo, setUndo] = useState<ConsoleConfigDraftInput | null>(null)
  const scene = draft.scenes.find(s => s.id === sceneId) ?? draft.scenes[0]
  const step = scene?.stages.find(s => s.id === stepId) ?? scene?.stages[0]
  const action = draft.sceneActions.find(a => a.id === actionId && step?.actionIds.includes(a.id))
    ?? draft.sceneActions.find(a => step?.actionIds.includes(a.id))
  const change = (next: ConsoleConfigDraftInput) => { setUndo(null); onChange(next) }
  const editScene = (next: SceneDefinition) => change({ ...draft, scenes: draft.scenes.map(s => s.id === next.id ? next : s) })
  const editStep = (next: SceneStageDefinition) => {
    if (scene) editScene({ ...scene, stages: scene.stages.map(s => s.id === next.id ? next : s) })
  }
  const editSpell = (next: SpellConfig) => change({ ...draft, spells: draft.spells.map(s => s.id === next.id ? next : s) })
  const addAction = (kind: SceneActionDefinition['kind']) => {
    if (!step || !scene) return
    let next = { ...newSceneAction(kind, draft.sceneActions.length), id: id(), name: ACTION_NAMES[kind] }
    if (kind === 'visual' && draft.visualAssets[0]) next = { ...next, kind, assetId: draft.visualAssets[0].id,
      fit: 'cover', playback: draft.visualAssets[0].kind === 'video' ? 'once' : 'still', audio: 'muted', gain: 0 }
    if (kind === 'music') next = { id: next.id, name: next.name, enabled: true, kind, command: 'play',
      assetId: draft.musicAssets[0]?.id ?? '', gain: 0.5, loop: false }
    change({ ...draft, sceneActions: [...draft.sceneActions, next], scenes: draft.scenes.map(s => s.id !== scene.id ? s : {
      ...s, stages: s.stages.map(st => st.id !== step.id ? st : { ...st, actionIds: [...st.actionIds, next.id] }) }) })
    setActionId(next.id)
  }
  return <fieldset className="scene-composer" disabled={disabled}>
    <legend>Spell scenes</legend>
    <div className="scene-composer__layout">
      <aside className="scene-composer__list" aria-label="Scene selection">
        <button type="button" className="console__primary" onClick={() => {
          const next = { id: id(), name: 'New scene', enabled: true, stages: [newStep(0)] }
          change({ ...draft, scenes: [...draft.scenes, next], spells: [...draft.spells, {
            id: id(), name: 'New spell', phrase: '', sceneId: next.id, enabled: true, cooldownMs: 5000 }] })
          setSceneId(next.id); setStepId(''); setActionId('')
        }}>Add scene</button>
        {draft.scenes.map(s => <button type="button" key={s.id} aria-pressed={s.id === scene?.id}
          onClick={() => { setSceneId(s.id); setStepId(''); setActionId('') }}>
          <strong>{s.name}</strong><span>{s.stages.length} steps{s.enabled ? '' : ' · Disabled'}</span>
        </button>)}
      </aside>
      {!scene ? <div className="console__empty"><h3>Create a short spell scene</h3><p>Add a scene, enter the exact phrase, then add a few steps.</p><p>Import media from the Media library whenever you need it.</p></div> :
      <div className="scene-composer__body">
        <div className="scene-composer__heading">
          <label>Scene name<input value={scene.name} onChange={e => editScene({ ...scene, name: e.currentTarget.value })} /></label>
          <label className="console__check"><input type="checkbox" checked={scene.enabled} onChange={e => editScene({ ...scene, enabled: e.currentTarget.checked })} />Enabled</label>
        </div>
        <section aria-label="Spell triggers" className="scene-composer__triggers">
          {draft.spells.filter(s => s.sceneId === scene.id).map(spell => <div key={spell.id} className="scene-spell">
            <label>Exact phrase<input placeholder="Say this to play the scene" value={spell.phrase} onChange={e => editSpell({ ...spell, phrase: e.currentTarget.value })} /></label>
            <details><summary>Spell options</summary><div className="console__form-grid">
              <label>Spell name<input value={spell.name} onChange={e => editSpell({ ...spell, name: e.currentTarget.value })} /></label>
              <label>Cooldown seconds<input type="number" min="0" step="0.1" value={spell.cooldownMs / 1000} onChange={e => editSpell({ ...spell, cooldownMs: Math.round(Number(e.currentTarget.value) * 1000) })} /></label>
              <label className="console__check"><input type="checkbox" checked={spell.enabled} onChange={e => editSpell({ ...spell, enabled: e.currentTarget.checked })} />Spell enabled</label>
              <button type="button" onClick={() => { change({ ...draft, spells: draft.spells.filter(s => s.id !== spell.id) }); setUndo(draft) }}>Remove spell</button>
            </div></details>
          </div>)}
          <button type="button" onClick={() => change({ ...draft, spells: [...draft.spells, { id: id(), name: 'New spell', phrase: '', sceneId: scene.id, enabled: true, cooldownMs: 5000 }] })}>Add spell</button>
          <p className="console__muted">Only the complete, exact phrase triggers this scene.</p>
        </section>
        <div className="scene-steps" aria-label="Ordered steps">
          {scene.stages.map((s, index) => <button type="button" key={s.id} aria-pressed={s.id === step?.id}
            onClick={() => { setStepId(s.id); setActionId('') }}><span>{index + 1}</span> {s.name}</button>)}
          <button type="button" onClick={() => { const next = newStep(scene.stages.length); editScene({ ...scene, stages: [...scene.stages, next] }); setStepId(next.id); setActionId('') }}>Add step</button>
        </div>
        {step ? <section className="console__stage-card" aria-label="Selected step">
          <div className="console__form-grid">
            <label>Step name<input value={step.name} onChange={e => editStep({ ...step, name: e.currentTarget.value })} /></label>
            <label>Ends when<select value={step.endCondition.kind} onChange={e => {
              const kind = e.currentTarget.value
              editStep({ ...step, endCondition: kind === 'duration' ? { kind, durationMs: 3000 } : kind === 'until_stopped'
                ? { kind, maxRuntimeMs: 60000 } : { kind: 'video_complete', visualActionId: draft.sceneActions.find(a => step.actionIds.includes(a.id) && a.kind === 'visual' && a.playback === 'once')?.id ?? '' } })
            }}><option value="duration">After a duration</option><option value="video_complete">When video finishes</option><option value="until_stopped">Until stopped (final step)</option></select></label>
            {step.endCondition.kind === 'duration' ? <label>Duration seconds<input type="number" min="0.1" step="0.1" value={step.endCondition.durationMs / 1000} onChange={e => editStep({ ...step, endCondition: { kind: 'duration', durationMs: Math.round(Number(e.currentTarget.value) * 1000) } })} /></label> : null}
            {step.endCondition.kind === 'until_stopped' ? <label>Maximum seconds<input type="number" min="1" value={step.endCondition.maxRuntimeMs / 1000} onChange={e => editStep({ ...step, endCondition: { kind: 'until_stopped', maxRuntimeMs: Math.round(Number(e.currentTarget.value) * 1000) } })} /></label> : null}
            {step.endCondition.kind === 'video_complete' ? <label>Completion video<select value={step.endCondition.visualActionId} onChange={e => editStep({ ...step, endCondition: { kind: 'video_complete', visualActionId: e.currentTarget.value } })}>
              <option value="">Select video action</option>{draft.sceneActions.filter(a => step.actionIds.includes(a.id) && a.kind === 'visual' && a.playback === 'once').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></label> : null}
          </div>
          <div className="console__action-row">
            {([-1, 1] as const).map(direction => <button type="button" key={direction} disabled={disabled || scene.stages.indexOf(step) + direction < 0 || scene.stages.indexOf(step) + direction >= scene.stages.length} onClick={() => {
              const stages = [...scene.stages]; const i = stages.indexOf(step); const j = i + direction
              ;[stages[i], stages[j]] = [stages[j]!, stages[i]!]; editScene({ ...scene, stages })
            }}>{direction === -1 ? 'Move earlier' : 'Move later'}</button>)}
            <button type="button" onClick={() => {
              const copy = duplicateStage(step, draft.sceneActions)
              const stages = [...scene.stages]; stages.splice(stages.indexOf(step) + 1, 0, copy.stage)
              change({ ...draft, sceneActions: [...draft.sceneActions, ...copy.actions], scenes: draft.scenes.map(s => s.id === scene.id ? { ...s, stages } : s) }); setStepId(copy.stage.id)
            }}>Duplicate step</button>
            <button type="button" disabled={disabled || scene.stages.length === 1} onClick={() => { editScene({ ...scene, stages: scene.stages.filter(s => s.id !== step.id) }); setUndo(draft) }}>Remove step</button>
          </div>
          <h3>Actions in this step</h3><p className="console__muted">These start together. Add another step to play something afterward.</p>
          <div className="console__action-row" aria-label="Add action">
            {(Object.keys(ACTION_NAMES) as Array<keyof typeof ACTION_NAMES>).map(kind => <button type="button" key={kind} onClick={() => addAction(kind)}>+ {ACTION_NAMES[kind]}</button>)}
          </div>
          <div className="scene-actions" aria-label="Action selection">
            {step.actionIds.map(aid => { const a = draft.sceneActions.find(item => item.id === aid); return <button type="button" key={aid} aria-pressed={a?.id === action?.id} onClick={() => setActionId(aid)}>{a?.name ?? 'Missing action'}</button> })}
          </div>
          {action ? <article className="scene-action-editor" aria-label="Selected action">
            {draft.scenes.flatMap(s => s.stages).filter(s => s.actionIds.includes(action.id)).length > 1 ? <p className="console__notice">Shared action: edits affect every linked step. Duplicate this step to make an independent copy.</p> : null}
            <SceneActionFields action={action} draft={draft} onChange={next => change({ ...draft, sceneActions: draft.sceneActions.map(a => a.id === next.id ? next : a) })} onImport={kind => onImport(kind, action.id)} />
            <button type="button" onClick={() => { editStep({ ...step, actionIds: step.actionIds.filter(a => a !== action.id) }); setUndo(draft) }}>Remove from step</button>
          </article> : <p className="console__empty">Add an action above, or link one from the library below.</p>}
          <details><summary>Link a reusable action</summary><div className="console__form-grid">
            {draft.sceneActions.map(a => <label key={a.id} className="console__check"><input type="checkbox" checked={step.actionIds.includes(a.id)} onChange={e => editStep({ ...step, actionIds: e.currentTarget.checked ? [...step.actionIds, a.id] : step.actionIds.filter(k => k !== a.id) })} />{a.name}</label>)}
          </div></details>
        </section> : null}
        <p className="console__muted">Maximum scene length: {(() => { const ms = estimateSceneMaximumMs(scene, draft.sceneActions, draft.visualAssets); return ms === null ? 'Finish configuring the steps' : `${(ms / 1000).toFixed(1)} seconds` })()}. Step endings do not undo actions; author explicit stops for music and hardware.</p>
        <div className="console__action-row">
          <button type="button" disabled={disabled || !active.scenes.some(s => s.id === scene.id && s.enabled)} onClick={() => onRun(scene.id)}>Run Published Scene</button>
          <span className="console__muted">Runs the live version, not these draft edits.</span>
        </div>
        <details><summary>Scene options</summary><button type="button" onClick={() => { change({ ...draft, scenes: draft.scenes.filter(s => s.id !== scene.id), spells: draft.spells.filter(s => s.sceneId !== scene.id) }); setUndo(draft) }}>Remove scene and its spells</button></details>
      </div>}
    </div>
    {undo ? <button type="button" onClick={() => { onChange(undo); setUndo(null) }}>Undo removal</button> : null}
  </fieldset>
}
