#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    args[key] = next && !next.startsWith('--') ? next : true
    if (next && !next.startsWith('--')) i += 1
  }
  return args
}

const args = parseArgs(process.argv)
if (args.help === true || !args.output || !args.url) {
  console.error('Usage: node capture-diagnostic-grid.mjs --url <capture-url> --output <dir> [--cdp http://127.0.0.1:4188] [--width <viewport-px>] [--height <viewport-px>] [--canvas-width <px>] [--canvas-height <px>]')
  process.exit(args.help === true ? 0 : 2)
}

const cdpUrl = String(args.cdp || 'http://127.0.0.1:4188')
const pageUrl = String(args.url)
const outputRoot = path.resolve(String(args.output))
const width = Number(args.width || args['canvas-width'] || 941)
const height = Number(args.height || args['canvas-height'] || 1672)
const canvasWidth = Number(args['canvas-width'] || args.width || 941)
const canvasHeight = Number(args['canvas-height'] || args.height || 1672)
if (![width, height, canvasWidth, canvasHeight].every((value) => Number.isFinite(value) && value > 0)) throw new Error('width_and_height_must_be_positive_numbers')
const captureUrl = new URL(pageUrl)
captureUrl.searchParams.set('canvasWidth', String(canvasWidth))
captureUrl.searchParams.set('canvasHeight', String(canvasHeight))
const actualPageUrl = captureUrl.toString()
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await rpc('Page.enable')
await rpc('Runtime.enable')
await rpc('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
await rpc('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
await rpc('Page.navigate', { url: actualPageUrl })
let title = ''
for (let i = 0; i < 150; i += 1) {
  title = await evaluate('document.title')
  if (title.includes('ready') || title.includes('failed')) break
  await sleep(100)
}
if (!title.includes('ready')) throw new Error(`capture_route_not_ready:${title}:${await evaluate('document.getElementById("error")?.textContent')}`)
const actualCanvas = await evaluate('({width:document.getElementById("capture")?.width,height:document.getElementById("capture")?.height,cssWidth:document.getElementById("capture")?.clientWidth,cssHeight:document.getElementById("capture")?.clientHeight})')
if (!actualCanvas || actualCanvas.width !== canvasWidth || actualCanvas.height !== canvasHeight) throw new Error(`capture_canvas_dimensions_mismatch:expected_${canvasWidth}x${canvasHeight}:actual_${actualCanvas?.width}x${actualCanvas?.height}`)
await evaluate('window.__capture.stopLoop()')

const neutral = {
  ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0,
  ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0,
  ParamEyeBallX: 0, ParamEyeBallY: 0,
  ParamEyeLOpen: 1, ParamEyeLSmile: 0, ParamEyeROpen: 1, ParamEyeRSmile: 0,
  ParamMouthOpenY: 0, ParamBreath: 0,
}
const records = []
const states = [
  ...[-30, -24, -18, -15, -12, 0].map((angle) => ({ group: 'head-x', label: `angle-x-${angle}`, values: { ParamAngleX: angle } })),
  ...[-30, 0, 30].flatMap((x) => [-30, 0, 30].map((y) => ({ group: 'head-xy', label: `angle-x-${x}-y-${y}`, values: { ParamAngleX: x, ParamAngleY: y } }))),
  ...[[-30, -30], [30, 30]].map(([x, y]) => ({ group: 'head-xy-mouth', label: `angle-x-${x}-y-${y}-mouth-1`, values: { ParamAngleX: x, ParamAngleY: y, ParamMouthOpenY: 1 } })),
  ...[0, 0.25, 0.5, 0.75, 1].map((mouth) => ({ group: 'mouth-side', label: `angle-x-0-mouth-${String(mouth).replace('.', '_')}`, values: { ParamAngleX: 0, ParamMouthOpenY: mouth } })),
  ...[0, 0.25, 0.5, 0.75, 1].map((mouth) => ({ group: 'mouth-front', label: `angle-x--30-mouth-${String(mouth).replace('.', '_')}`, values: { ParamAngleX: -30, ParamMouthOpenY: mouth } })),
  ...[0, 0.25, 0.5, 0.75, 1].map((mouth) => ({ group: 'mouth-mid', label: `angle-x--15-mouth-${String(mouth).replace('.', '_')}`, values: { ParamAngleX: -15, ParamMouthOpenY: mouth } })),
  ...[0, -30].flatMap((angle) => [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((y) => ({
    group: angle === 0 ? 'gaze-neutral' : 'gaze-front',
    label: `angle-x-${angle}-gaze-${x}-${y}`,
    values: { ParamAngleX: angle, ParamEyeBallX: x, ParamEyeBallY: y },
  })))),
]
for (const state of states) {
  await evaluate(`window.__capture.resetToNeutral(${JSON.stringify(neutral)}); window.__capture.setParameters(${JSON.stringify(state.values)}); window.__capture.tick(0)`)
  const shot = await rpc('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
  const relativePath = `${state.group}/${state.label}.png`
  const absolutePath = path.join(outputRoot, relativePath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, Buffer.from(shot.data, 'base64'))
  const report = await evaluate('({parameters:window.__capture.getAllParameterValues(),alphaInspection:window.__capture.getAlphaInspection()})')
  records.push({ ...state, file: relativePath, ...report })
}
await fs.writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify({ pageUrl: actualPageUrl, cdpUrl, viewport: [width, height], canvas: [canvasWidth, canvasHeight], records }, null, 2))
socket.close()
console.log(JSON.stringify({ outputRoot, count: records.length }))
