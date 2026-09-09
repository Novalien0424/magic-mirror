import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { AvatarModel } from '../../shared/avatar-profiles'
import { parseAvatarLibraryLabel, type AvatarLibraryLabel } from '../../shared/avatar-library'
import { AvatarCanvas } from '../avatar/AvatarCanvas'
import type { CubismAvatarRenderer } from '../avatar/cubism-avatar'
import type { CubismCapabilities, CubismParameter, CubismPreviewControls } from '../avatar/cubism-preview'

const BUILTIN: AvatarModel = { id: 'builtin-ren', name: 'Built-in Ren', manifestFileName: 'Ren.model3.json', files: [] }
const EMPTY: CubismCapabilities = { motions: [], expressions: [], parameters: [] }
const PARAMETER_NAMES: Record<string, string> = {
  ParamAngleX: 'Head turn', ParamAngleY: 'Head up / down', ParamAngleZ: 'Head tilt',
  ParamEyeBallX: 'Look left / right', ParamEyeBallY: 'Look up / down',
  ParamEyeLOpen: 'Left eye / blink', ParamEyeROpen: 'Right eye / blink',
  ParamMouthOpenY: 'Mouth / beak opening', ParamMouthForm: 'Mouth shape',
  ParamBreath: 'Breathing', ParamBodyAngleX: 'Body turn', ParamBodyAngleY: 'Body lean', ParamBodyAngleZ: 'Body tilt',
}
const number = (value: number) => Number(value.toFixed(3))

export function CubismStudio({ bridge, visible }: { bridge: ConsoleBridge | null; visible: boolean }): React.JSX.Element {
  const [models, setModels] = useState<AvatarModel[]>([BUILTIN])
  const [labels, setLabels] = useState<Record<string, AvatarLibraryLabel>>({})
  const [labelName, setLabelName] = useState('')
  const [labelVersion, setLabelVersion] = useState('')
  const [selectedId, setSelectedId] = useState(BUILTIN.id)
  const [loaded, setLoaded] = useState<AvatarModel | null>(null)
  const [capabilities, setCapabilities] = useState<CubismCapabilities>(EMPTY)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Select an avatar, then Load preview.')
  const [fault, setFault] = useState('')
  const [libraryWarning, setLibraryWarning] = useState('')
  const [fps, setFps] = useState(0)
  const [values, setValues] = useState<Record<string, number>>({})
  const [observed, setObserved] = useState<Readonly<Record<string, number>>>({})
  const renderer = useRef<CubismAvatarRenderer | null>(null)
  const controls = useRef<CubismPreviewControls | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const mounted = useRef(true)
  const request = useRef(0)
  const selected = models.find(model => model.id === selectedId)
  const modelTitle = (model: AvatarModel) => model.id === BUILTIN.id ? model.name
    : `${model.name}${labels[model.id]?.version ? '' : ' · version not set'} · ${model.id.slice(-8)}`
  useEffect(() => {
    setLabelName(labels[selectedId]?.name ?? selected?.name ?? '')
    setLabelVersion(labels[selectedId]?.version ?? '')
  }, [selectedId, labels, selected?.name])

  const cancelTest = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const reset = () => {
    cancelTest()
    controls.current?.reset()
    setValues({})
  }
  const refresh = async () => {
    if (!bridge) return
    const generation = ++request.current
    setBusy(true)
    try {
      const response = await bridge.listAvatarModels()
      if (!mounted.current || generation !== request.current) return
      if (!response.ok) { setLibraryWarning(`Could not read avatar library: ${response.reason}`); return }
      setModels([BUILTIN, ...response.value.models])
      setLabels(response.value.labels ?? {})
      setLibraryWarning([
        response.value.rejectedCount ? `${response.value.rejectedCount} invalid bundle(s) skipped. Browse and import a complete model3.json bundle to repair them.` : '',
        response.value.labelWarningCount ? `${response.value.labelWarningCount} invalid library label(s) ignored. Select the model and save its name/version to repair.` : '',
      ].filter(Boolean).join(' '))
    } catch { if (mounted.current) setLibraryWarning('Avatar library unavailable. Restart the updated app, then Refresh library.') }
    finally { if (mounted.current && generation === request.current) setBusy(false) }
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; request.current += 1; cancelTest() }
  }, [])
  useEffect(() => {
    if (visible) void refresh()
    else {
      cancelTest(); renderer.current = null; controls.current = null
      setReady(false); setCapabilities(EMPTY); setLoaded(null)
    }
    // Library refresh is tied to page entry, not preview updates.
  }, [visible, bridge])

  const importModel = async () => {
    if (!bridge) return
    setBusy(true); setLibraryWarning('')
    try {
      const response = await bridge.importAvatarModel()
      if (!mounted.current) return
      if (!response.ok) { setLibraryWarning(`Import failed: ${response.fields?.[0]?.message ?? response.reason}`); return }
      const model = response.value
      if (!model) { setMessage('Import cancelled.'); return }
      setModels(items => [...items.filter(item => item.id !== model.id), model])
      setSelectedId(model.id)
      setMessage(`${model.name} imported. Choose Load preview to test it.`)
      await refresh()
    } catch { if (mounted.current) setLibraryWarning('Import failed. Choose a complete local Cubism bundle and try again.') }
    finally { if (mounted.current) setBusy(false) }
  }
  const saveLabel = async () => {
    if (!bridge || !selected || selected.id === BUILTIN.id) return
    const label = parseAvatarLibraryLabel({ name: labelName.trim(), version: labelVersion.trim() })
    if (!label) { setLibraryWarning('Name must be 1–60 characters; version must be blank or 1–16 letters, digits, dots, hyphens, underscores or plus signs.'); return }
    setBusy(true)
    try {
      const response = await bridge.saveAvatarModelLabel({ id: selected.id, ...label })
      if (!mounted.current) return
      if (!response.ok) { setLibraryWarning(`Library label not saved: ${response.reason}`); return }
      setModels(items => items.map(item => item.id === selected.id ? response.value : item))
      setLabels(items => ({ ...items, [selected.id]: label }))
      setLibraryWarning(''); setMessage(`Library label saved: ${response.value.name}. No configuration published.`)
    } catch { if (mounted.current) setLibraryWarning('Library label not saved. Refresh and try again.') }
    finally { if (mounted.current) setBusy(false) }
  }
  const load = () => {
    if (!selected) return
    reset(); renderer.current = null; controls.current = null
    setReady(false); setCapabilities(EMPTY); setObserved({}); setFault(''); setFps(0)
    setMessage(`Loading ${selected.name}…`); setLoaded(selected)
  }
  const writeParameter = (parameter: CubismParameter, value: number) => {
    cancelTest()
    if (!controls.current?.setParameter(parameter.id, value)) { setFault(`Parameter unavailable: ${parameter.id}`); return }
    setValues(current => ({ ...current, [parameter.id]: value }))
    setMessage(`${parameter.id} · ${number(value)}`)
  }
  const testParameter = (parameter: CubismParameter) => {
    reset(); setFault('')
    const testControls = controls.current
    if (!testControls) return
    // Stop/reset, loading another rig, and leaving the page cancel these timers.
    const samples = [parameter.min, parameter.max, parameter.defaultValue]
    samples.forEach((value, index) => {
      const apply = () => {
        if (controls.current !== testControls) return
        if (!testControls.setParameter(parameter.id, value)) { setFault(`Parameter unavailable: ${parameter.id}`); return }
        setValues({ [parameter.id]: value })
        setMessage(`Testing ${parameter.id} · ${['minimum', 'maximum', 'default'][index]} · ${number(value)}`)
      }
      if (index === 0) apply()
      else timers.current.push(setTimeout(apply, index * 1000))
    })
    timers.current.push(setTimeout(() => { if (controls.current === testControls) { testControls.reset(); setValues({}); setMessage(`Range test finished: ${parameter.id}`) } }, 3000))
  }

  return <section className="console__panel cubism-studio" aria-labelledby="cubism-studio-title">
    <h2 id="cubism-studio-title">Live2D Cubism</h2>
    <p>Load a rig and try its motions, expressions, eyes, mouth and movement in the Console preview.</p>
    <div className="cubism-studio__toolbar">
      <label>Avatar model<select aria-label="Cubism avatar model" value={selectedId} disabled={busy} onChange={e => setSelectedId(e.currentTarget.value)}>
        {models.map(model => <option key={model.id} value={model.id}>{modelTitle(model)}</option>)}
      </select></label>
      <button type="button" disabled={!selected || busy || loaded?.id === selected.id} onClick={load}>Load preview</button>
      <button type="button" disabled={!bridge || busy} onClick={() => void importModel()}>Browse & import Cubism…</button>
      <button type="button" disabled={!bridge || busy} onClick={() => void refresh()}>Refresh library</button>
    </div>
    {selected && selected.id !== BUILTIN.id && <fieldset disabled={busy}>
      <legend>Library name and version</legend>
      <div className="console__action-row">
        <label>Name<input aria-label="Avatar library name" maxLength={60} value={labelName} onChange={e => setLabelName(e.currentTarget.value)} /></label>
        <label>Version<input aria-label="Avatar library version" maxLength={16} placeholder="e.g. v10" value={labelVersion} onChange={e => setLabelVersion(e.currentTarget.value)} /></label>
        <button type="button" disabled={!bridge} onClick={() => void saveLabel()}>Save library label</button>
      </div>
      <p className="console__muted">Save before selecting another model. Labels persist across restarts; they do not rename rig files or change the published character.</p>
    </fieldset>}
    <p aria-label="Selected avatar model">Selected: {selected ? modelTitle(selected) : 'Unavailable — refresh the library'}</p>
    <p className="console__muted">Imports stay in your local library. Preview tests are silent and local. To use a rig for conversations, assign it under Avatar / Audio → Appearance and publish that draft.</p>
    {libraryWarning && <p className="console__fault" role="alert">{libraryWarning}</p>}
    <div className="cubism-studio__layout">
      <div className="cubism-studio__preview-panel">
        <strong aria-label="Loaded avatar model">Loaded: {loaded ? modelTitle(models.find(model => model.id === loaded.id) ?? loaded) : 'None'}</strong>
        <div className="cubism-studio__preview">
          {visible && loaded ? <AvatarCanvas embedded preview model={loaded.id === BUILTIN.id ? undefined : loaded} state="Dormant"
            onRenderer={value => {
              renderer.current = value; controls.current = value?.getPreviewControls?.() ?? null
              setReady(controls.current !== null)
              setCapabilities(controls.current?.capabilities ?? EMPTY)
              if (controls.current) { controls.current.reset(); setMessage('Ready · neutral pose') }
            }}
            onMetrics={metrics => { setFps(metrics.fps); if (controls.current) setObserved(controls.current.readParameters()) }}
            onEvent={event => {
              if (event.status === 'failed') { cancelTest(); setFault(event.reason); setReady(false) }
              else if (event.status === 'degraded') setFault(event.reason)
              else if (event.reason.startsWith('avatar_motion_started:')) setMessage(`Motion started: ${event.reason.split(':').slice(1).join(':')}`)
              else if (event.reason.startsWith('avatar_motion_completed:')) setMessage(`Motion finished: ${event.reason.split(':').slice(1).join(':')}`)
            }} /> : <p className="cubism-studio__empty">Select an avatar to begin</p>}
        </div>
        <div className="console__action-row">
          <button type="button" disabled={!ready} onClick={() => { reset(); setMessage('Stopped · neutral pose') }}>Stop / reset</button>
          <button type="button" disabled={!loaded} onClick={() => { reset(); setLoaded(null); setReady(false); setCapabilities(EMPTY); setMessage('Preview unloaded.') }}>Unload</button>
        </div>
        <p role="status" className="cubism-studio__status">{message}</p>
        {fault && <p className="console__fault" role="alert">{fault}</p>}
        <p className="console__muted">{ready ? `Ready · ${Math.round(fps)} FPS` : loaded ? 'Loading / unavailable' : 'No rig loaded'}</p>
      </div>
      <div className="cubism-studio__controls">
        <fieldset disabled={!ready}><legend>Motions · {capabilities.motions.length}</legend>
          <p className="console__muted">Every exported clip, including multiple clips in the same group.</p>
          <div className="cubism-studio__buttons">{capabilities.motions.map(motion => <button type="button" key={`${motion.group}:${motion.index}`}
            title={motion.file} aria-label={`Play motion ${motion.group} ${motion.index + 1}`} onClick={() => {
              reset(); setFault(''); renderer.current?.setState('Dormant'); renderer.current?.clearExpression()
              if (renderer.current?.playMotion(motion.group, motion.index)) setMessage(`Starting ${motion.group} · clip ${motion.index + 1}`)
              else setFault(`Motion unavailable: ${motion.group} ${motion.index + 1}`)
            }}>{motion.group} · {motion.index + 1}</button>)}</div>
        </fieldset>
        <fieldset disabled={!ready}><legend>Expressions · {capabilities.expressions.length}</legend>
          <div className="cubism-studio__buttons">{capabilities.expressions.map(name => <button type="button" key={name} aria-label={`Test expression ${name}`} onClick={() => {
            reset(); setFault(''); renderer.current?.setExpression(name); setMessage(`Expression: ${name}`)
          }}>{name}</button>)}</div>
        </fieldset>
        <fieldset disabled={!ready}><legend>Parameters · {capabilities.parameters.length}</legend>
          <p className="console__muted">Test runs minimum → maximum → default. Stop / reset clears all tests. Speaking clips need a separate mouth / beak input.</p>
          {capabilities.parameters.map(parameter => <div className="cubism-studio__parameter" key={parameter.id}>
            <div><strong>{PARAMETER_NAMES[parameter.id] ?? parameter.id}</strong><small>{parameter.id}</small></div>
            <div className="cubism-studio__parameter-input"><input type="range" aria-label={parameter.id} min={parameter.min} max={parameter.max} step="any"
              value={values[parameter.id] ?? observed[parameter.id] ?? parameter.defaultValue}
              onChange={e => { if (Object.keys(values).length === 0) reset(); writeParameter(parameter, Number(e.currentTarget.value)) }} />
              <output aria-label={`${parameter.id} observed`}>{number(observed[parameter.id] ?? parameter.defaultValue)}</output></div>
            <div className="cubism-studio__buttons">
              {([['Min', parameter.min], ['Default', parameter.defaultValue], ['Max', parameter.max]] as const).map(([label, value]) => <button type="button" key={label} aria-label={`${parameter.id} ${label}`} onClick={() => { reset(); writeParameter(parameter, value) }}>{label}</button>)}
              <button type="button" aria-label={`Test parameter ${parameter.id}`} onClick={() => testParameter(parameter)}>Test</button>
            </div>
          </div>)}
        </fieldset>
      </div>
    </div>
  </section>
}
