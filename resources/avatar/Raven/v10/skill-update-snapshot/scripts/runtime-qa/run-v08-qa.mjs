#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    args[key] = next && !next.startsWith('--') ? next : true
    if (next && !next.startsWith('--')) index += 1
  }
  return args
}

function usage(message = null) {
  if (message) console.error(`ERROR: ${message}`)
  console.error('Usage: node run-v08-qa.mjs --model-root <runtime> --output <capture-dir> [--only all|expressions] [--baseline <capture-dir>] [--cdp <url>] [--url <capture-url>] [--width <viewport-px>] [--height <viewport-px>] [--canvas-width <px>] [--canvas-height <px>]')
  process.exitCode = message ? 2 : 0
  return message ? false : true
}

const args = parseArgs(process.argv)
if (args.help === true) { usage(); process.exit(0) }
const only = args.only || 'all'
if (!['all', 'expressions'].includes(only)) { usage('--only must be all or expressions'); process.exit(2) }
if (!Object.hasOwn(args, 'model-root') || args['model-root'] === true) { usage('--model-root is required; refusing to default to an old runtime'); process.exit(2) }
if (!Object.hasOwn(args, 'output') || args.output === true) { usage('--output is required; refusing to default to a shared capture directory'); process.exit(2) }
const modelRoot = path.resolve(String(args['model-root']))
const outputRoot = path.resolve(String(args.output))
const baselineRoot = args.baseline ? path.resolve(String(args.baseline)) : null
const cdpUrl = String(args.cdp || 'http://127.0.0.1:4188')
const pageUrl = String(args.url || 'http://127.0.0.1:4177/capture.html')
const width = Number(args.width || args['canvas-width'] || 941)
const height = Number(args.height || args['canvas-height'] || 1672)
const canvasWidth = Number(args['canvas-width'] || args.width || 941)
const canvasHeight = Number(args['canvas-height'] || args.height || 1672)
if (![width, height, canvasWidth, canvasHeight].every((value) => Number.isFinite(value) && value > 0)) throw new Error('width_and_height_must_be_positive_numbers')
const captureUrl = new URL(pageUrl)
captureUrl.searchParams.set('canvasWidth', String(canvasWidth))
captureUrl.searchParams.set('canvasHeight', String(canvasHeight))
const actualPageUrl = captureUrl.toString()

try {
  const modelStat = await fs.stat(modelRoot)
  if (!modelStat.isDirectory()) throw new Error('not_a_directory')
} catch (error) {
  console.error(`ERROR: model-root is not a directory: ${modelRoot}`)
  process.exit(2)
}

await fs.mkdir(outputRoot, { recursive: true })

const pages = await (await fetch(`${cdpUrl}/json/list`)).json()
const page = pages.find((item) => item.type === 'page')
if (!page) throw new Error(`no_cdp_page:${cdpUrl}`)
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let messageId = 0
const pending = new Map()
socket.onmessage = (event) => {
  const result = JSON.parse(event.data)
  const entry = pending.get(result.id)
  if (!entry) return
  pending.delete(result.id)
  if (result.error) entry.reject(result.error)
  else entry.resolve(result.result)
}
const rpc = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const result = await rpc('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result?.value
}
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

await rpc('Page.enable')
await rpc('Runtime.enable')
await rpc('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
await rpc('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
await rpc('Page.navigate', { url: actualPageUrl })
let title = ''
for (let attempt = 0; attempt < 150; attempt += 1) {
  title = await evaluate('document.title')
  if (title.includes('ready') || title.includes('failed')) break
  await wait(200)
}
if (!title.includes('ready')) throw new Error(`capture_route_not_ready:${title}:${await evaluate('document.getElementById("error")?.textContent')}`)
const actualCanvas = await evaluate('({width:document.getElementById("capture")?.width,height:document.getElementById("capture")?.height,cssWidth:document.getElementById("capture")?.clientWidth,cssHeight:document.getElementById("capture")?.clientHeight})')
if (!actualCanvas || actualCanvas.width !== canvasWidth || actualCanvas.height !== canvasHeight) throw new Error(`capture_canvas_dimensions_mismatch:expected_${canvasWidth}x${canvasHeight}:actual_${actualCanvas?.width}x${actualCanvas?.height}`)
await evaluate('window.__capture.stopLoop()')

const initialReport = await evaluate('window.__capture.getReport()')
const initialParameters = await evaluate('window.__capture.getAllParameterValues()')
const initialById = new Map(initialParameters.map((parameter) => [parameter.id, parameter]))
const neutral = {
  ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0,
  ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0,
  ParamEyeBallX: 0, ParamEyeBallY: 0,
  ParamEyeLOpen: 1, ParamEyeLSmile: 0, ParamEyeROpen: 1, ParamEyeRSmile: 0,
  ParamMouthOpenY: 0, ParamBreath: 0,
}
const captureIndex = []
async function capture(name, kind, extra = {}) {
  const state = await evaluate(`({parameters:window.__capture.getAllParameterValues(),drawables:window.__capture.getDrawableSnapshot(),alphaInspection:window.__capture.getAlphaInspection()})`)
  const shot = await rpc('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  const relativePath = `${kind}/${name}.png`
  const absolutePath = path.join(outputRoot, relativePath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, Buffer.from(shot.data, 'base64'))
  const record = { name, kind, file: relativePath, parameters: state.parameters, drawables: state.drawables, alphaInspection: state.alphaInspection, ...extra }
  captureIndex.push(record)
  return record
}
async function reset() {
  await evaluate(`window.__capture.resetToNeutral(${JSON.stringify(neutral)})`)
}
async function setAndCapture(name, values, kind = 'controls', extra = {}) {
  await evaluate(`window.__capture.resetToNeutral(${JSON.stringify(neutral)}); window.__capture.setParameters(${JSON.stringify(values)}); window.__capture.tick(0)`)
  return capture(name, kind, { requested: values, ...extra })
}
function range(id, fallbackMin, fallbackMax) {
  const parameter = initialById.get(id)
  return parameter ? [parameter.min, parameter.max] : [fallbackMin, fallbackMax]
}
function safeEndpoint(id, fallbackMin, fallbackMax) {
  const [min, max] = range(id, fallbackMin, fallbackMax)
  return { [id]: min }
}
function safeEndpointMax(id, fallbackMin, fallbackMax) {
  const [min, max] = range(id, fallbackMin, fallbackMax)
  return { [id]: max }
}
function safeValue(id, requested, fallbackMin, fallbackMax) {
  const [min, max] = range(id, fallbackMin, fallbackMax)
  return Math.min(max, Math.max(min, requested))
}
function formatValue(value) {
  return `${value >= 0 ? '+' : ''}${Number(value.toFixed(2))}`.replaceAll('.', '_')
}

await setAndCapture('neutral', neutral, 'controls', { role: 'baseline' })
const controls = [
  ['head-angle-x-min', safeEndpoint('ParamAngleX', -30, 30), 'head-turn'],
  ['head-angle-x-max', safeEndpointMax('ParamAngleX', -30, 30), 'head-turn'],
  ['head-angle-y-min', safeEndpoint('ParamAngleY', -30, 30), 'head-pitch'],
  ['head-angle-y-max', safeEndpointMax('ParamAngleY', -30, 30), 'head-pitch'],
  ['head-angle-z-min', safeEndpoint('ParamAngleZ', -30, 30), 'head-tilt'],
  ['head-angle-z-max', safeEndpointMax('ParamAngleZ', -30, 30), 'head-tilt'],
  ['body-angle-x-min', safeEndpoint('ParamBodyAngleX', -10, 10), 'body-lean'],
  ['body-angle-x-max', safeEndpointMax('ParamBodyAngleX', -10, 10), 'body-lean'],
  ['body-angle-y-min', safeEndpoint('ParamBodyAngleY', -10, 10), 'body-lean'],
  ['body-angle-y-max', safeEndpointMax('ParamBodyAngleY', -10, 10), 'body-lean'],
  ['body-angle-z-min', safeEndpoint('ParamBodyAngleZ', -10, 10), 'body-lean'],
  ['body-angle-z-max', safeEndpointMax('ParamBodyAngleZ', -10, 10), 'body-lean'],
  ['eye-look-left-up', { ParamEyeBallX: safeValue('ParamEyeBallX', -1, -1, 1), ParamEyeBallY: safeValue('ParamEyeBallY', -1, -1, 1) }, 'gaze'],
  ['eye-look-right-up', { ParamEyeBallX: safeValue('ParamEyeBallX', 1, -1, 1), ParamEyeBallY: safeValue('ParamEyeBallY', -1, -1, 1) }, 'gaze'],
  ['eye-look-left-down', { ParamEyeBallX: safeValue('ParamEyeBallX', -1, -1, 1), ParamEyeBallY: safeValue('ParamEyeBallY', 1, -1, 1) }, 'gaze'],
  ['eye-look-right-down', { ParamEyeBallX: safeValue('ParamEyeBallX', 1, -1, 1), ParamEyeBallY: safeValue('ParamEyeBallY', 1, -1, 1) }, 'gaze'],
  ['blink-closed', { ParamEyeLOpen: 0 }, 'blink'],
  ['blink-half', { ParamEyeLOpen: 0.5 }, 'blink'],
  ['blink-open', { ParamEyeLOpen: 1 }, 'blink'],
  ['eye-smile-off', { ParamEyeLSmile: 0 }, 'eye-smile'],
  ['eye-smile-on', { ParamEyeLSmile: 1 }, 'eye-smile'],
  ['blink-right-closed', { ParamEyeROpen: 0 }, 'blink-right'],
  ['blink-right-half', { ParamEyeROpen: 0.5 }, 'blink-right'],
  ['blink-right-open', { ParamEyeROpen: 1 }, 'blink-right'],
  ['eye-smile-right-off', { ParamEyeRSmile: 0 }, 'eye-smile-right'],
  ['eye-smile-right-on', { ParamEyeRSmile: 1 }, 'eye-smile-right'],
  ['beak-closed', { ParamMouthOpenY: 0 }, 'beak'],
  ['beak-quarter', { ParamMouthOpenY: 0.25 }, 'beak'],
  ['beak-half', { ParamMouthOpenY: 0.5 }, 'beak'],
  ['beak-three-quarter', { ParamMouthOpenY: 0.75 }, 'beak'],
  ['beak-open', { ParamMouthOpenY: 1 }, 'beak'],
  ['breath-rest', { ParamBreath: 0 }, 'breath'],
  ['breath-max', { ParamBreath: 1 }, 'breath'],
]
if (only === 'all') for (const [name, values, kind] of controls) await setAndCapture(name, values, kind)

/*
  A true turn must be readable through the whole path, not only at two
  endpoints. ParamAngleX=0 is the supplied three-quarter neutral; the
  negative endpoint is the audience-facing candidate. These are direct
  parameter states so a double beak/four-eye ghost can be inspected at every
  transition frame.
*/
const [angleXMin, angleXMax] = range('ParamAngleX', -30, 30)
const turnMarks = [-30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30]
const turnTransitionRecords = []
for (let index = 0; only === 'all' && index < turnMarks.length; index += 1) {
  const requested = turnMarks[index]
  const value = Math.min(angleXMax, Math.max(angleXMin, requested))
  const endpoint = requested < 0 ? 'front-candidate' : requested === 0 ? 'neutral' : 'opposite-profile'
  turnTransitionRecords.push(await setAndCapture(`head-turn-transition-x-${formatValue(value)}`, { ParamAngleX: value }, 'turn-transition', {
    axis: 'ParamAngleX', requestedMark: requested, actualValue: value, step: index, endpoint,
  }))
}

/* Combined states exercise the new front art with the overlays and mouth. */
const frontTurn = Math.min(angleXMax, Math.max(angleXMin, -30))
const combinedControls = [
  ['front-turn-beak-closed', { ParamAngleX: frontTurn, ParamMouthOpenY: 0 }, 'front-turn-mouth'],
  ['front-turn-blink-closed', { ParamAngleX: frontTurn, ParamEyeLOpen: 0 }, 'front-turn-blink'],
  ['front-turn-eye-smile', { ParamAngleX: frontTurn, ParamEyeLSmile: 1 }, 'front-turn-smile'],
  ['front-turn-beak-open', { ParamAngleX: frontTurn, ParamMouthOpenY: 1 }, 'front-turn-mouth'],
  ['front-turn-blink-smile-mouth', { ParamAngleX: frontTurn, ParamEyeLOpen: 0, ParamEyeLSmile: 1, ParamMouthOpenY: 1 }, 'front-turn-combined'],
  ['front-turn-far-eye-blink-closed', { ParamAngleX: frontTurn, ParamEyeROpen: 0 }, 'front-turn-far-eye-blink'],
  ['front-turn-far-eye-smile', { ParamAngleX: frontTurn, ParamEyeRSmile: 1 }, 'front-turn-far-eye-smile'],
  ['front-turn-far-eye-blink-smile-mouth', { ParamAngleX: frontTurn, ParamEyeROpen: 0, ParamEyeRSmile: 1, ParamMouthOpenY: 1 }, 'front-turn-far-eye-combined'],
  ['front-turn-gaze-left-up', { ParamAngleX: frontTurn, ParamEyeBallX: safeValue('ParamEyeBallX', -1, -1, 1), ParamEyeBallY: safeValue('ParamEyeBallY', -1, -1, 1) }, 'front-turn-gaze'],
  ['front-turn-gaze-right-down', { ParamAngleX: frontTurn, ParamEyeBallX: safeValue('ParamEyeBallX', 1, -1, 1), ParamEyeBallY: safeValue('ParamEyeBallY', 1, -1, 1) }, 'front-turn-gaze'],
]
const combinedRecords = []
if (only === 'all') for (const [name, values, kind] of combinedControls) combinedRecords.push(await setAndCapture(name, values, kind, { axis: 'combined', frontTurn }))

const modelRootMotionDir = path.join(modelRoot, 'motions')
const modelGroups = Array.from(new Set(initialReport.model3.motionGroups || []))
const motionRecords = []
for (const group of only === 'all' ? modelGroups : []) {
  const entries = (await fs.readdir(modelRootMotionDir)).filter((file) => file.endsWith('.motion3.json'))
  const candidate = entries.find((file) => file.toLowerCase().includes(group.toLowerCase()))
  const motion = candidate ? JSON.parse(await fs.readFile(path.join(modelRootMotionDir, candidate), 'utf8')) : null
  const duration = Number(motion?.Meta?.Duration || 4)
  const samples = Array.from(new Set([0, duration * 0.125, duration * 0.25, duration * 0.5, duration * 0.75, duration * 0.9])).sort((a, b) => a - b)
  await reset()
  await evaluate(`window.__capture.playMotion(${JSON.stringify(group)})`)
  let previous = 0
  for (const time of samples) {
    await evaluate(`window.__capture.tick(${Math.max(0, time - previous)})`)
    const record = await capture(`${group.toLowerCase()}-t${time.toFixed(3)}`, 'motions', { group, time, duration, sourceFile: candidate || null })
    motionRecords.push(record)
    previous = time
  }
  await reset()
  await capture(`${group.toLowerCase()}-neutral-after`, 'motions', { group, role: 'neutral-after', resetMethod: 'hard-reset', provesNaturalCompletion: false })
}

const expressionNames = Array.from(new Set(initialReport.model3.expressions || []))
const expressionRecords = []
for (const name of expressionNames) {
  await reset()
  await evaluate(`window.__capture.setExpression(${JSON.stringify(name)})`)
  const fadeInTime = Math.max(0, Number(await evaluate(`window.__capture.model.expressionByName.get(${JSON.stringify(name)}).getFadeInTime()`)))
  if (!Number.isFinite(fadeInTime)) throw new Error(`invalid_expression_fade:${name}`)
  const samples = Array.from(new Set([0, 0.1, 0.25, 0.5, 0.9, fadeInTime, Math.max(1.5, fadeInTime + 0.5)])).sort((a, b) => a - b)
  const clockStart = await evaluate('window.__capture.model._expressionManager._userTimeSeconds')
  let previous = 0
  for (const time of samples) {
    const delta = time - previous
    // Update physics and the SDK timeline at <= 1/60s; render only the sample.
    // Uneven sample labels must not each advance by a fixed 0.1 seconds.
    await evaluate(`{ const n = Math.ceil(${delta} * 60); for (let i=0; i<n; i++) window.__capture.model.update(${delta}/n); window.__capture.tick(0); }`)
    const clockElapsedSeconds = (await evaluate('window.__capture.model._expressionManager._userTimeSeconds')) - clockStart
    if (Math.abs(clockElapsedSeconds - time) > 1e-6) throw new Error(`expression_clock_mismatch:${name}:${time}:${clockElapsedSeconds}`)
    const record = await capture(`${name}-t${time.toFixed(3)}`, 'expressions', { expression: name, time, clockElapsedSeconds, fadeInTime, phase: time >= fadeInTime ? 'settled' : 'fade-in', maxUpdateStepSeconds: 1/60 })
    expressionRecords.push(record)
    previous = time
  }
  await reset()
  await capture(`${name}-neutral-after`, 'expressions', { expression: name, role: 'neutral-after', resetMethod: 'hard-reset', provesNaturalCompletion: false })
}

const sourceAngleChecklist = [
  { id: 'source-neutral', file: 'controls/neutral.png', expectation: 'supplied three-quarter / approximately 45-degree pose remains the neutral silhouette' },
  { id: 'head-turn-min', file: 'head-turn/head-angle-x-min.png', expectation: 'head and beak turn as one readable volume; endpoint must not read as beak-only protrusion; verify direction against this character\'s documented mapping' },
  { id: 'head-turn-max', file: 'head-turn/head-angle-x-max.png', expectation: 'verify the opposite endpoint against this character\'s documented mapping; a positive value does not universally mean audience-facing' },
  { id: 'head-pitch-endpoints', files: ['head-pitch/head-angle-y-min.png', 'head-pitch/head-angle-y-max.png'], expectation: 'up/down pitch changes the face and neck relationship, not only a small translation' },
  { id: 'head-tilt-endpoints', files: ['head-tilt/head-angle-z-min.png', 'head-tilt/head-angle-z-max.png'], expectation: 'roll is visibly distinct and aesthetically bounded' },
  { id: 'body-lean-endpoints', files: ['body-lean/body-angle-x-min.png', 'body-lean/body-angle-x-max.png', 'body-lean/body-angle-y-min.png', 'body-lean/body-angle-y-max.png', 'body-lean/body-angle-z-min.png', 'body-lean/body-angle-z-max.png'], expectation: 'at least one body or shoulder mass visibly leans; missing IDs are a failed rig coverage item' },
  { id: 'gaze', files: ['gaze/eye-look-left-up.png', 'gaze/eye-look-right-up.png', 'gaze/eye-look-left-down.png', 'gaze/eye-look-right-down.png'], expectation: 'pupil remains visible at all four endpoints' },
  { id: 'far-eye-copied-rig', files: ['blink-right/blink-right-closed.png', 'eye-smile-right/eye-smile-right-on.png', 'front-turn-far-eye-combined/front-turn-far-eye-blink-smile-mouth.png'], expectation: 'right-eye remap changes only the intended far eye; pupil stays inside its socket and the copied clipping ID does not reveal the near eye' },
  { id: 'mouth-transparency', files: ['beak/beak-closed.png', 'beak/beak-open.png'], expectation: 'beak opening has no unintended opaque black background; inspect light/checker composite' },
]
await fs.writeFile(path.join(outputRoot, 'capture-matrix.json'), JSON.stringify({
  schema: 'live2d-avatar-runtime-qa', generatedAt: new Date().toISOString(),
  inputs: { modelRoot, baselineRoot, pageUrl: actualPageUrl, cdpUrl, viewport: [width, height], canvas: [canvasWidth, canvasHeight], core: initialReport.core, moc: initialReport.moc },
  parameters: initialParameters, missingRequestedParameters: ['ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ', 'ParamEyeLSmile', 'ParamEyeROpen', 'ParamEyeRSmile'].filter((id) => !initialById.has(id)),
  counts: { controls: only === 'all' ? controls.length + 1 : 1, turnTransitions: turnTransitionRecords.length, combined: combinedRecords.length, motions: motionRecords.length, expressions: expressionRecords.length },
  turnTransitions: turnTransitionRecords.map((record) => ({ name: record.name, file: record.file, requestedMark: record.requestedMark, actualValue: record.actualValue, step: record.step, endpoint: record.endpoint })),
  combined: combinedRecords.map((record) => ({ name: record.name, file: record.file, requested: record.requested, kind: record.kind })),
  scope: only, sourceAngleChecklist: only === 'all' ? sourceAngleChecklist : [], captures: captureIndex,
}, null, 2))
console.log(JSON.stringify({ outputRoot, modelRoot, scope: only, controls: only === 'all' ? controls.length + 1 : 1, turnTransitions: turnTransitionRecords.length, combined: combinedRecords.length, motionFrames: motionRecords.length, expressionFrames: expressionRecords.length, missingRequestedParameters: ['ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ', 'ParamEyeLSmile', 'ParamEyeROpen', 'ParamEyeRSmile'].filter((id) => !initialById.has(id)) }, null, 2))
socket.close()
