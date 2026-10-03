#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    args[key] = value && !value.startsWith('--') ? value : true
    if (value && !value.startsWith('--')) index += 1
  }
  return args
}
function curveValues(segments = []) {
  const values = []
  for (let index = 0; index + 1 < segments.length; index += 3) values.push(Number(segments[index + 1]))
  return values.filter(Number.isFinite)
}
const args = parseArgs(process.argv)
if (args.help === true) {
  console.log('Usage: node audit-motion-design.mjs --model-root <runtime> --output <qa-dir> [--baseline <qa-dir>] [--min-head-abs <n>] [--min-body-abs <n>]')
  process.exit(0)
}
if (!args['model-root'] || args['model-root'] === true) throw new Error('--model-root is required; refusing to inspect an implicit runtime')
if (!args.output || args.output === true) throw new Error('--output is required; refusing to write to a shared directory')
const modelRoot = path.resolve(String(args['model-root']))
const outputRoot = path.resolve(String(args.output))
const baselineRoot = args.baseline ? path.resolve(String(args.baseline)) : null
const thresholds = {
  head: Number(args['min-head-abs'] || 6),
  tilt: Number(args['min-tilt-abs'] || 6),
  body: Number(args['min-body-abs'] || 3),
  breath: Number(args['min-breath-abs'] || 0.3),
  eyeSmile: Number(args['min-eye-smile-abs'] || 0.25),
}
const motionDir = path.join(modelRoot, 'motions')
const files = (await fs.readdir(motionDir)).filter((file) => file.endsWith('.motion3.json')).sort()
const expressions = (await fs.readdir(motionDir)).filter((file) => file.endsWith('.exp3.json')).sort()
const motionCurves = []
const authoredIds = new Set()
for (const file of files) {
  const data = JSON.parse(await fs.readFile(path.join(motionDir, file), 'utf8'))
  for (const curve of data.Curves || []) {
    if (curve.Target !== 'Parameter') continue
    const values = curveValues(curve.Segments)
    authoredIds.add(curve.Id)
    motionCurves.push({ file, id: curve.Id, min: Math.min(...values), max: Math.max(...values), maxAbs: Math.max(...values.map((value) => Math.abs(value))), values })
  }
}
const expressionCurves = []
for (const file of expressions) {
  const data = JSON.parse(await fs.readFile(path.join(motionDir, file), 'utf8'))
  for (const parameter of data.Parameters || []) {
    authoredIds.add(parameter.Id)
    expressionCurves.push({ file, id: parameter.Id, value: Number(parameter.Value), blend: parameter.Blend || 'Add' })
  }
}
const byId = new Map()
for (const curve of motionCurves) {
  const item = byId.get(curve.id) || { id: curve.id, motionFiles: [], expressionFiles: [], motionMaxAbs: 0, expressionMaxAbs: 0, motionMin: Infinity, motionMax: -Infinity }
  item.motionFiles.push(curve.file); item.motionMaxAbs = Math.max(item.motionMaxAbs, curve.maxAbs); item.motionMin = Math.min(item.motionMin, curve.min); item.motionMax = Math.max(item.motionMax, curve.max); byId.set(curve.id, item)
}
for (const curve of expressionCurves) {
  const item = byId.get(curve.id) || { id: curve.id, motionFiles: [], expressionFiles: [], motionMaxAbs: 0, expressionMaxAbs: 0, motionMin: Infinity, motionMax: -Infinity }
  item.expressionFiles.push(curve.file); item.expressionMaxAbs = Math.max(item.expressionMaxAbs, Math.abs(curve.value)); byId.set(curve.id, item)
}
const rules = {
  ParamAngleX: { label: 'head turn X', threshold: thresholds.head },
  ParamAngleY: { label: 'head pitch Y', threshold: thresholds.head },
  ParamAngleZ: { label: 'head tilt Z', threshold: thresholds.tilt },
  ParamBodyAngleX: { label: 'body lean X', threshold: thresholds.body },
  ParamBodyAngleY: { label: 'body lean Y', threshold: thresholds.body },
  ParamBodyAngleZ: { label: 'body lean Z', threshold: thresholds.body },
  ParamEyeLSmile: { label: 'eye smile', threshold: thresholds.eyeSmile },
  ParamBreath: { label: 'breath', threshold: thresholds.breath },
}
const observability = Object.entries(rules).map(([id, rule]) => {
  const item = byId.get(id)
  if (!item) return { id, label: rule.label, status: 'no_motion_or_expression_author', threshold: rule.threshold, motionMaxAbs: 0, expressionMaxAbs: 0 }
  const effectiveMax = Math.max(item.motionMaxAbs, item.expressionMaxAbs)
  return { ...item, label: rule.label, threshold: rule.threshold, effectiveMaxAbs: effectiveMax, status: effectiveMax < rule.threshold ? 'underamplitude_suspect' : 'authored_amplitude_requires_runtime_visual_check' }
})
const report = {
  schema: 'live2d-avatar-motion-design-audit', generatedAt: new Date().toISOString(), modelRoot, baselineRoot, thresholds,
  motionFiles: files, expressionFiles: expressions, authoredParameterIds: [...authoredIds].sort(), observability,
  note: 'This static audit deliberately does not claim a model is visually correct. Runtime captures at display scale and human review remain required.',
}
await fs.mkdir(outputRoot, { recursive: true })
await fs.writeFile(path.join(outputRoot, 'motion-design-audit.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ output: path.join(outputRoot, 'motion-design-audit.json'), observability }, null, 2))
