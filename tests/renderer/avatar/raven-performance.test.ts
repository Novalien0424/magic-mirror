import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { validateCubismModelBundle } from '../../../src/main/avatar/model-bundle'
import {
  drainMotionQueue,
  lifecycleLoops,
  ownsBlink,
  performanceState,
  PerformanceContinuity,
  readPerformanceProfile,
} from '../../../src/renderer/avatar/cubism-performance'
import { configureMotionPlayback } from '../../../src/renderer/avatar/cubism-preview'
import { CubismIdManager } from '../../../src/vendor/live2d/Framework/dist/id/cubismidmanager'
import type { CubismIdHandle } from '../../../src/vendor/live2d/Framework/dist/id/cubismid'
import { CubismFramework } from '../../../src/vendor/live2d/Framework/dist/live2dcubismframework'
import { CubismEyeBlink } from '../../../src/vendor/live2d/Framework/dist/effect/cubismeyeblink'
import type { CubismModel } from '../../../src/vendor/live2d/Framework/dist/model/cubismmodel'
import { CubismMotion } from '../../../src/vendor/live2d/Framework/dist/motion/cubismmotion'
import { CubismExpressionMotion } from '../../../src/vendor/live2d/Framework/dist/motion/cubismexpressionmotion'
import { CubismMotionManager } from '../../../src/vendor/live2d/Framework/dist/motion/cubismmotionmanager'
import { CubismMotionQueueEntry } from '../../../src/vendor/live2d/Framework/dist/motion/cubismmotionqueueentry'
import { Value } from '../../../src/vendor/live2d/Framework/dist/utils/cubismjson'

const ravenRoot = resolve(import.meta.dirname, '../../../resources/avatar/Raven')
const runtime = resolve(ravenRoot, 'v11/runtime')
const profile = 'raven-calm-v1' as const
const states = ['Dormant', 'Waking', 'Listening', 'Thinking', 'Speaking', 'Scene', 'Suspending'] as const
const loopStates = ['Dormant', 'Listening', 'Thinking', 'Speaking'] as const
const finiteStates = ['Waking', 'Scene', 'Suspending'] as const
const eyes = ['ParamEyeLOpen', 'ParamEyeROpen']

interface MotionCurve {
  Target: string
  Id: string
  FadeOutTime: number
  Segments: number[]
}
interface MotionDocument {
  Meta: {
    Duration: number
    Fps: number
    Loop: boolean
    AreBeziersRestricted: boolean
    CurveCount: number
    TotalSegmentCount: number
    TotalPointCount: number
  }
  Curves: MotionCurve[]
}
interface Manifest {
  Layout: Record<string, number>
  FileReferences: {
    Moc: string
    Textures: string[]
    Expressions: Array<{ File: string }>
    Motions: Record<typeof states[number], Array<{ File: string; FadeInTime: number; FadeOutTime: number }>>
  }
}

function json<T>(path: string): T { return JSON.parse(readFileSync(path, 'utf8')) as T }
function manifest(): Manifest { return json(resolve(runtime, 'raven-lord.model3.json')) }
function motionDocument(state: typeof states[number]): MotionDocument {
  return json(resolve(runtime, manifest().FileReferences.Motions[state][0].File))
}
function parameterCurve(document: MotionDocument, id: string): MotionCurve {
  const curve = document.Curves.find(curve => curve.Target === 'Parameter' && curve.Id === id)
  if (!curve) throw new Error(`Missing authored parameter: ${id}`)
  return curve
}
function controlValues(curve: MotionCurve): number[] {
  const values = [curve.Segments[1]]
  for (let index = 2; index < curve.Segments.length; index += 7) {
    values.push(curve.Segments[index + 2], curve.Segments[index + 4], curve.Segments[index + 6])
  }
  return values
}

/** Real SDK motion evaluation with a parameter sink; this does not render artwork. */
function sdkPlayback(state: typeof states[number]) {
  const reference = manifest().FileReferences.Motions[state][0]
  const document = motionDocument(state)
  const bytes = Uint8Array.from(readFileSync(resolve(runtime, reference.File)))
  const motion = CubismMotion.create(bytes.buffer, bytes.byteLength, undefined, undefined, true)
  if (!motion) throw new Error(`SDK rejected motion: ${state}`)
  const ids = CubismFramework.getIdManager()
  motion.setEffectIds(eyes.map(id => ids.getId(id)), [ids.getId('ParamMouthOpenY')])
  motion.setFadeInTime(reference.FadeInTime)
  motion.setFadeOutTime(reference.FadeOutTime)
  configureMotionPlayback(motion, lifecycleLoops(profile, state))
  const names = document.Curves.filter(curve => curve.Target === 'Parameter').map(curve => curve.Id)
  const values = names.map(name => parameterCurve(document, name).Segments[1])
  const sink = {
    getParameterIndex: (id: CubismIdHandle) => names.indexOf(id.getString()),
    getParameterValueByIndex: (index: number) => values[index],
    setParameterValueByIndex: (index: number, value: number) => { values[index] = value },
    isRepeat: () => false,
  } as unknown as CubismModel
  const manager = new CubismMotionManager()
  const completed = vi.fn()
  motion.setFinishedMotionHandler(completed)
  manager.startMotionPriority(motion, false, 2)
  manager.updateMotion(sink, 0)
  return {
    document, motion, manager, completed,
    update: (deltaSeconds: number) => manager.updateMotion(sink, deltaSeconds),
    value: (name: string) => values[names.indexOf(name)],
  }
}

describe('Raven V11 performance contract', () => {
  beforeAll(() => {
    Value.staticInitializeNotForClientCall()
    vi.spyOn(CubismFramework, 'getIdManager').mockReturnValue(new CubismIdManager())
  })
  afterAll(() => {
    vi.restoreAllMocks()
    Value.staticReleaseNotForClientCall()
  })

  it.each([2, 3])('drains all %i crossfading SDK entries and releases each clone once', count => {
    const manager = new CubismMotionManager()
    const releases = Array.from({ length: count }, () => {
      const motion = new CubismMotion()
      const release = vi.spyOn(motion, 'release')
      manager.startMotionPriority(motion, true, 2)
      return release
    })
    // Reproduce the vendored splice/index bug before checking our boundary.
    manager.stopAllMotions()
    expect(manager.getCubismMotionQueueEntries().length).toBeGreaterThan(0)
    drainMotionQueue(manager)
    expect(manager.getCubismMotionQueueEntries()).toHaveLength(0)
    expect(manager.isFinished()).toBe(true)
    drainMotionQueue(manager)
    for (const release of releases) expect(release).toHaveBeenCalledOnce()
  })

  it('keeps head continuity independent of frame partition and bounded during rapid handoffs', () => {
    const whole = new PerformanceContinuity()
    const split = new PerformanceContinuity()
    whole.sample('ParamAngleX', 0, 0)
    split.sample('ParamAngleX', 0, 0)
    const oneFrame = whole.sample('ParamAngleX', 2.4, 0.1)
    let divided = 0
    for (let frame = 0; frame < 6; frame += 1) divided = split.sample('ParamAngleX', 2.4, 1 / 60)
    expect(divided).toBeCloseTo(oneFrame, 12)
    const reversal = split.sample('ParamAngleX', -0.9, 1 / 60)
    expect(reversal).toBeGreaterThan(-0.9)
    expect(reversal).toBeLessThan(divided)
    const next = split.sample('ParamAngleX', 0.65, 1 / 60)
    expect(next).toBeGreaterThanOrEqual(Math.min(reversal, 0.65))
    expect(next).toBeLessThanOrEqual(Math.max(reversal, 0.65))
    expect(split.sample('ParamAngleX', 5, 0)).toBe(next)
    split.reset()
    expect(split.sample('ParamAngleX', -0.7, 1 / 60)).toBe(-0.7)
  })

  it('preserves exact closed eyelids across entry, repeated frames and reset', () => {
    const continuity = new PerformanceContinuity()
    continuity.sample('ParamEyeLOpen', 1, 1 / 60)
    expect(continuity.sample('ParamEyeLOpen', 0, 1 / 60)).toBe(0)
    for (let frame = 0; frame < 180; frame += 1) {
      expect(continuity.sample('ParamEyeLOpen', 0, 1 / 60)).toBe(0)
    }
    continuity.reset()
    expect(continuity.sample('ParamEyeLOpen', 1, 1 / 60)).toBe(1)
  })

  it('preserves fully closed frames in the actual SDK blink after continuity filtering', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const blink = CubismEyeBlink.create()
    const continuity = new PerformanceContinuity()
    blink.setParameterIds([CubismFramework.getIdManager().getId('ParamEyeLOpen')])
    let raw = 1
    let closedFrames = 0
    const sink = { setParameterValueById: (_id: CubismIdHandle, value: number) => { raw = value } } as unknown as CubismModel
    try {
      for (let frame = 0; frame < 1200; frame += 1) {
        blink.updateParameters(sink, 1 / 60)
        const value = continuity.sample('ParamEyeLOpen', raw, 1 / 60)
        if (raw === 0) {
          closedFrames += 1
          expect(value).toBe(0)
        }
      }
      expect(closedFrames).toBeGreaterThan(0)
    } finally { random.mockRestore() }
  })

  it('requires an explicit supported profile and leaves V10 and unrelated rigs unselected', () => {
    expect(readPerformanceProfile(manifest())).toBe(profile)
    expect(readPerformanceProfile(json(resolve(ravenRoot, 'v10/runtime/raven-lord.model3.json')))).toBeNull()
    for (const value of [null, [], {}, { MagicMirror: null }, { MagicMirror: { Performance: profile } },
      { MagicMirror: { Version: 2, Performance: profile } },
      { MagicMirror: { Version: 1, Performance: 'unknown' } }]) {
      expect(readPerformanceProfile(value)).toBeNull()
    }
  })

  it('validates the new import bundle and preserves the exported rig, artwork and framing', () => {
    const files = new Set((readdirSync(runtime, { recursive: true }) as string[]).map(file => file.replaceAll('\\', '/')))
    expect(validateCubismModelBundle({ model3: manifest(), files }).ok).toBe(true)
    const old = json<Manifest>(resolve(ravenRoot, 'v10/runtime/raven-lord.model3.json'))
    expect(manifest().Layout).toEqual(old.Layout)
    expect(manifest().FileReferences.Moc).toBe(old.FileReferences.Moc)
    expect(manifest().FileReferences.Textures).toEqual(old.FileReferences.Textures)
    for (const file of [old.FileReferences.Moc, ...old.FileReferences.Textures]) {
      expect(readFileSync(resolve(runtime, file)).equals(readFileSync(resolve(ravenRoot, 'v10/runtime', file)))).toBe(true)
    }
  })

  it('keeps the historical V10 runtime byte-identical to its original inventory', () => {
    const inventory = json<{ files: Array<{ file: string; bytes: number; sha256: string }> }>(resolve(ravenRoot, 'v10/MANIFEST-SHA256.json'))
    const files = inventory.files.filter(entry => entry.file.startsWith('runtime/'))
    expect(files.length).toBe(17)
    for (const entry of files) {
      const bytes = readFileSync(resolve(ravenRoot, 'v10', entry.file))
      expect(bytes.length, entry.file).toBe(entry.bytes)
      expect(createHash('sha256').update(bytes).digest('hex'), entry.file).toBe(entry.sha256)
    }
  })

  it.each(states)('keeps %s playback and eye ownership explicit', state => {
    expect(lifecycleLoops(profile, state)).toBe((loopStates as readonly string[]).includes(state))
    expect(lifecycleLoops(null, state)).toBe(true)
    expect(ownsBlink(profile, state)).toBe(['Dormant', 'Waking', 'Suspending'].includes(state))
    expect(ownsBlink(null, state)).toBe(false)
    expect(performanceState('Dormant', state)).toBe(state)
  })

  it('does not treat arbitrary action names as lifecycle states or loop OfflineLoop', () => {
    expect(performanceState('Listening', 'custom-scene')).toBe('Listening')
    expect(performanceState('Listening', null)).toBe('Listening')
    expect(performanceState('Listening', 'OfflineLoop')).toBe('Listening')
    expect(lifecycleLoops(profile, 'OfflineLoop')).toBe(false)
    expect(lifecycleLoops(null, 'OfflineLoop')).toBe(false)
  })

  it.each(states)('%s has internally consistent eased curves and an audio-owned closed mouth', state => {
    const document = motionDocument(state)
    let segmentCount = 0
    let pointCount = 0
    expect(document.Meta.AreBeziersRestricted).toBe(true)
    expect(document.Meta.Loop).toBe(lifecycleLoops(profile, state))
    expect(document.Meta.CurveCount).toBe(document.Curves.length)
    for (const curve of document.Curves) {
      expect(curve.Target).toBe('Parameter')
      expect(curve.FadeOutTime).toBe(0)
      expect(curve.Segments.every(Number.isFinite)).toBe(true)
      expect(curve.Segments[0]).toBe(0)
      expect((curve.Segments.length - 2) % 7).toBe(0)
      let previousTime = curve.Segments[0]
      let previousValue = curve.Segments[1]
      pointCount += 1
      for (let index = 2; index < curve.Segments.length; index += 7) {
        const [kind, time1, value1, time2, value2, end, value] = curve.Segments.slice(index, index + 7)
        expect(kind).toBe(1)
        expect(end).toBeGreaterThan(previousTime)
        expect(time1).toBeCloseTo(previousTime + (end - previousTime) / 3, 5)
        expect(time2).toBeCloseTo(previousTime + 2 * (end - previousTime) / 3, 5)
        expect(value1).toBe(previousValue)
        expect(value2).toBe(value)
        previousTime = end
        previousValue = value
        segmentCount += 1
        pointCount += 3
      }
      expect(previousTime).toBe(document.Meta.Duration)
      if (document.Meta.Loop) expect(previousValue).toBe(curve.Segments[1])
    }
    expect(document.Meta.TotalSegmentCount).toBe(segmentCount)
    expect(document.Meta.TotalPointCount).toBe(pointCount)
    expect(controlValues(parameterCurve(document, 'ParamMouthOpenY')).every(value => value === 0)).toBe(true)
    for (const id of eyes) {
      const curve = parameterCurve(document, id)
      expect(controlValues(curve).every(value => value >= 0 && value <= 1)).toBe(true)
      expect(curve.Segments[1]).toBe(['Dormant', 'Waking'].includes(state) ? 0 : 1)
      expect(curve.Segments.at(-1)).toBe(['Dormant', 'Suspending'].includes(state) ? 0 : 1)
      if (!['Waking', 'Suspending'].includes(state)) {
        expect(new Set(controlValues(curve)).size).toBe(1)
      }
    }
  })

  it.each(['Dormant', 'Waking'] as const)('%s preserves a small authored movement envelope', state => {
    for (const curve of motionDocument(state).Curves) {
      if (!/^Param(?:Body)?Angle[XYZ]$/u.test(curve.Id)) continue
      const values = controlValues(curve)
      const body = curve.Id.startsWith('ParamBody')
      const limit = state === 'Dormant' ? (body ? 1 : 2) : (body ? 3 : 6)
      expect(Math.max(...values) - Math.min(...values), curve.Id).toBeLessThanOrEqual(limit)
    }
  })

  it('keeps expressions from adding head, body, breath or mouth motion', () => {
    const allowed = new Set([...eyes, 'ParamEyeLSmile', 'ParamEyeRSmile'])
    for (const reference of manifest().FileReferences.Expressions) {
      const expression = json<{ Parameters: Array<{ Id: string }> }>(resolve(runtime, reference.File))
      expect(expression.Parameters.every(parameter => allowed.has(parameter.Id)), reference.File).toBe(true)
    }
  })

  it('the SDK expression blend preserves closed blinks and the authored body pose', () => {
    for (const reference of manifest().FileReferences.Expressions) {
      const bytes = Uint8Array.from(readFileSync(resolve(runtime, reference.File)))
      const expression = CubismExpressionMotion.create(bytes.buffer, bytes.byteLength)
      for (const blink of [0, 0.5, 1]) {
        const values = new Map([
          ['ParamEyeLOpen', blink], ['ParamEyeROpen', blink],
          ['ParamEyeLSmile', 0], ['ParamEyeRSmile', 0],
          ['ParamAngleX', 4], ['ParamBodyAngleZ', -2], ['ParamBreath', 0.25], ['ParamMouthOpenY', 0.4],
        ])
        const sink = {
          addParameterValueById: (id: CubismIdHandle, value: number, weight: number) => {
            values.set(id.getString(), (values.get(id.getString()) ?? 0) + value * weight)
          },
          multiplyParameterValueById: (id: CubismIdHandle, value: number, weight: number) => {
            values.set(id.getString(), (values.get(id.getString()) ?? 0) * (1 + (value - 1) * weight))
          },
          setParameterValueById: (id: CubismIdHandle, value: number, weight: number) => {
            const previous = values.get(id.getString()) ?? 0
            values.set(id.getString(), previous + (value - previous) * weight)
          },
        } as unknown as CubismModel
        expression.doUpdateParameters(sink, 1, 1, new CubismMotionQueueEntry())
        for (const id of eyes) {
          expect(values.get(id), reference.File).toBeGreaterThanOrEqual(0)
          expect(values.get(id), reference.File).toBeLessThanOrEqual(blink)
        }
        expect(values.get('ParamAngleX')).toBe(4)
        expect(values.get('ParamBodyAngleZ')).toBe(-2)
        expect(values.get('ParamBreath')).toBe(0.25)
        expect(values.get('ParamMouthOpenY')).toBe(0.4)
      }
    }
  })

  it.each(loopStates)('the real SDK keeps %s active through multiple seamless loops', state => {
    const playback = sdkPlayback(state)
    try {
      expect(playback.motion.getDuration()).toBe(-1)
      expect(playback.motion.getLoopFadeIn()).toBe(false)
      const frames = Math.ceil((playback.document.Meta.Duration + 1 / playback.document.Meta.Fps) * 3 * 60)
      for (let frame = 0; frame < frames; frame += 1) {
        playback.update(1 / 60)
        expect(playback.manager.isFinished()).toBe(false)
        if (state === 'Dormant') for (const id of eyes) expect(playback.value(id)).toBe(0)
        for (const curve of playback.document.Curves) {
          const values = controlValues(curve)
          expect(playback.value(curve.Id)).toBeGreaterThanOrEqual(Math.min(...values) - 1e-6)
          expect(playback.value(curve.Id)).toBeLessThanOrEqual(Math.max(...values) + 1e-6)
        }
      }
    } finally { playback.manager.stopAllMotions() }
  })

  it.each(finiteStates)('the real SDK completes %s once and retains its authored endpoint', state => {
    const playback = sdkPlayback(state)
    try {
      expect(playback.motion.getDuration()).toBe(playback.document.Meta.Duration)
      const frames = Math.ceil((playback.document.Meta.Duration + 0.1) * 60)
      for (let frame = 0; frame < frames; frame += 1) playback.update(1 / 60)
      expect(playback.manager.isFinished()).toBe(true)
      expect(playback.completed).toHaveBeenCalledOnce()
      for (const curve of playback.document.Curves) {
        expect(playback.value(curve.Id), curve.Id).toBeCloseTo(curve.Segments.at(-1)!, 6)
      }
      playback.update(playback.document.Meta.Duration * 2)
      expect(playback.completed).toHaveBeenCalledOnce()
      expect(playback.manager.isFinished()).toBe(true)
      for (const curve of playback.document.Curves) {
        expect(playback.value(curve.Id), curve.Id).toBeCloseTo(curve.Segments.at(-1)!, 6)
      }
    } finally { playback.manager.stopAllMotions() }
  })
})
