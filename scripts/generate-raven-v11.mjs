import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = join(root, 'resources/avatar/Raven/v10/runtime')
const dest = join(root, 'resources/avatar/Raven/v11/runtime')
await mkdir(dest, { recursive: true })
await cp(source, dest, { recursive: true })
const manifest = JSON.parse(await readFile(join(source, 'raven-lord.model3.json'), 'utf8'))
manifest.MagicMirror = { Version: 1, Performance: 'raven-calm-v1' }
const write = (path, data) => writeFile(join(dest, path), JSON.stringify(data, null, 2) + '\n')
const rest = { ParamAngleY: -0.7, ParamAngleZ: 0.3 }
const pair = (end, value) => [[0, value], [end, value]]
const specs = {
  Dormant: { duration: 16, loop: true, values: {
    ParamAngleY: [[0,-0.7],[5,-0.65],[10,-0.75],[16,-0.7]],
    ParamAngleZ: pair(16,0.3), ParamBreath: [[0,.5],[6,.515],[12,.485],[16,.5]],
    ParamEyeLOpen: pair(16,0), ParamEyeROpen: pair(16,0),
  } },
  Waking: { duration: 2.4, loop: false, values: {
    ParamAngleY: [[0,-.7],[.45,-.7],[1.8,0],[2.4,0]],
    ParamAngleZ: [[0,.3],[1.9,0],[2.4,0]],
    ParamEyeLOpen: [[0,0],[.2,0],[1.4,1],[2.4,1]],
    ParamEyeROpen: [[0,0],[.2,0],[1.4,1],[2.4,1]],
  } },
  Listening: { duration: 14, loop: true, values: {
    ParamAngleX: [[0,0],[3.5,0],[5.5,-.9],[8,-.9],[10.5,0],[14,0]],
    ParamAngleZ: [[0,0],[4,0],[6,.35],[9,.35],[12,0],[14,0]],
    ParamBreath: [[0,.5],[4,.53],[9,.48],[14,.5]],
  } },
  Thinking: { duration: 18, loop: true, values: {
    ParamAngleX: [[0,0],[1,0],[3,2.4],[10,2.4],[13,0],[18,0]],
    ParamAngleY: [[0,0],[2,-.6],[10,-.6],[13,0],[18,0]],
    ParamAngleZ: [[0,0],[2.6,.8],[10,.8],[13,0],[18,0]],
    ParamBreath: [[0,.5],[5,.525],[11,.48],[18,.5]],
  } },
  Speaking: { duration: 11, loop: true, values: {
    ParamAngleY: [[0,0],[1.8,0],[2.6,.65],[4.2,0],[7.6,0],[8.6,.3],[9.8,0],[11,0]],
    ParamAngleZ: [[0,0],[3,.25],[5,0],[11,0]],
    ParamBreath: [[0,.5],[3.5,.53],[7,.48],[11,.5]],
  } },
  Scene: { duration: 4, loop: false, values: {
    ParamAngleX: [[0,0],[1.4,-1.5],[2,-1.5],[3.5,0],[4,0]],
    ParamAngleZ: [[0,0],[1.6,.6],[3.5,0],[4,0]],
  } },
  Suspending: { duration: 2.8, loop: false, values: {
    ParamAngleY: [[0,0],[.5,0],[2.2,rest.ParamAngleY],[2.8,rest.ParamAngleY]],
    ParamAngleZ: [[0,0],[2.2,rest.ParamAngleZ],[2.8,rest.ParamAngleZ]],
    ParamEyeLOpen: [[0,1],[.3,1],[1.9,0],[2.8,0]],
    ParamEyeROpen: [[0,1],[.3,1],[1.9,0],[2.8,0]],
  } },
}
const defaults = {
  ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0,
  ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0,
  ParamBreath: .5, ParamEyeLOpen: 1, ParamEyeROpen: 1, ParamMouthOpenY: 0,
}
for (const [state, spec] of Object.entries(specs)) {
  let segments = 0
  const curves = Object.entries(defaults).map(([Id, value]) => {
    const points = spec.values[Id] ?? pair(spec.duration, value)
    const Segments = [...points[0]]
    for (let i = 1; i < points.length; i++) {
      const [t0,v0] = points[i-1], [t1,v1] = points[i]
      const third = (t1-t0)/3
      // Restricted cubic with horizontal tangents: a real hold/ease, not a
      // piecewise linear reversal. Every loop seam has zero endpoint velocity.
      Segments.push(1, t0+third, v0, t1-third, v1, t1, v1)
      segments++
    }
    return { Target: 'Parameter', Id, FadeOutTime: 0, Segments }
  })
  const entry = manifest.FileReferences.Motions[state][0]
  entry.FadeInTime = state === 'Dormant' ? .6 : .45
  entry.FadeOutTime = .45
  await write(entry.File, { Version: 3, Meta: {
    Duration: spec.duration, Fps: 30, Loop: spec.loop, AreBeziersRestricted: true,
    CurveCount: curves.length, TotalSegmentCount: segments,
    TotalPointCount: curves.length + 3*segments, UserDataCount: 0, TotalUserDataSize: 0,
  }, Curves: curves })
}
// Manual expressions only. Lifecycle eye performance is authored in motions,
// so no expression can offset the head, body, breath or audio-driven beak.
for (const [i, smile, openness] of [[1,0,1],[2,.12,1],[3,0,0],[4,.18,.95],[5,0,.92]]) {
  await write(`motions/exp_0${i}.exp3.json`, {
    Type: 'Live2D Expression', FadeInTime: .35, FadeOutTime: .35,
    Parameters: [
      { Id: 'ParamEyeLSmile', Value: smile, Blend: 'Add' },
      { Id: 'ParamEyeRSmile', Value: smile, Blend: 'Add' },
      { Id: 'ParamEyeLOpen', Value: openness, Blend: 'Multiply' },
      { Id: 'ParamEyeROpen', Value: openness, Blend: 'Multiply' },
    ],
  })
}
await write('raven-lord.model3.json', manifest)
