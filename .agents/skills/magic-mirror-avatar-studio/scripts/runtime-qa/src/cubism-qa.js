import { CubismFramework, Option } from '@cubism/live2dcubismframework.js'
import { CubismModelSettingJson } from '@cubism/cubismmodelsettingjson.js'
import { CubismMatrix44 } from '@cubism/math/cubismmatrix44.js'
import { CubismUserModel } from '@cubism/model/cubismusermodel.js'
import { CubismShaderManager_WebGL } from '@cubism/rendering/cubismshader_webgl.js'
import { CubismWebGLOffscreenManager } from '@cubism/rendering/cubismoffscreenmanager.js'

const DEFAULT_MODEL_URL = '/runtime/model3.json'
const DEFAULT_SHADER_PATH = '/live2d/Framework/Shaders/WebGL/'
const CORE_MEMORY_BYTES = 32 * 1024 * 1024
export const OBSERVABLE_PARAMETER_SPECS = [
  { id: 'ParamAngleX', label: 'Head turn X', fallbackMin: -30, fallbackMax: 30 },
  { id: 'ParamAngleY', label: 'Head up/down Y', fallbackMin: -30, fallbackMax: 30 },
  { id: 'ParamAngleZ', label: 'Head tilt Z', fallbackMin: -30, fallbackMax: 30 },
  { id: 'ParamBodyAngleX', label: 'Body lean X', fallbackMin: -10, fallbackMax: 10 },
  { id: 'ParamBodyAngleY', label: 'Body lean Y', fallbackMin: -10, fallbackMax: 10 },
  { id: 'ParamBodyAngleZ', label: 'Body lean Z', fallbackMin: -10, fallbackMax: 10 },
  { id: 'ParamEyeBallX', label: 'Eye look X', fallbackMin: -1, fallbackMax: 1 },
  { id: 'ParamEyeBallY', label: 'Eye look Y', fallbackMin: -1, fallbackMax: 1 },
  { id: 'ParamEyeLOpen', label: 'Blink / eye open', fallbackMin: 0, fallbackMax: 1 },
  { id: 'ParamEyeLSmile', label: 'Eye smile', fallbackMin: 0, fallbackMax: 1 },
  { id: 'ParamMouthOpenY', label: 'Beak open', fallbackMin: 0, fallbackMax: 1 },
  { id: 'ParamBreath', label: 'Breath', fallbackMin: 0, fallbackMax: 1 },
]
const STANDARD_PARAMS = [
  { id: 'ParamAngleX', label: 'Angle X', fallbackMin: -30, fallbackMax: 30 },
  { id: 'ParamAngleY', label: 'Angle Y', fallbackMin: -30, fallbackMax: 30 },
  { id: 'ParamAngleZ', label: 'Angle Z', fallbackMin: -30, fallbackMax: 30 },
  { id: 'ParamEyeBallX', label: 'EyeBall X', fallbackMin: -1, fallbackMax: 1 },
  { id: 'ParamEyeBallY', label: 'EyeBall Y', fallbackMin: -1, fallbackMax: 1 },
  { id: 'ParamEyeLOpen', label: 'EyeL Open', fallbackMin: 0, fallbackMax: 1 },
  { id: 'ParamMouthOpenY', label: 'Mouth Open Y', fallbackMin: 0, fallbackMax: 1 },
  { id: 'ParamBreath', label: 'Breath', fallbackMin: 0, fallbackMax: 1 },
]

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)) }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
async function fetchBuffer(url) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`asset_fetch_failed:${response.status}:${url}`)
  return response.arrayBuffer()
}
function formatCoreVersion(value) {
  return `${(value >>> 24) & 0xff}.${(value >>> 16) & 0xff}.${value & 0xffff}`
}
const MOC_VERSION_LABELS = new Map([
  [0, 'unknown'],
  [1, '3.0'],
  [2, '3.3'],
  [3, '4.0'],
  [4, '4.2'],
  [5, '5.0'],
  [6, '5.3'],
])
function formatMocVersion(value) {
  return MOC_VERSION_LABELS.get(value) ?? `enum-${value}`
}
function maxArrayDelta(left, right) {
  const count = Math.min(left.length, right.length)
  let max = 0
  for (let index = 0; index < count; index += 1) max = Math.max(max, Math.abs(left[index] - right[index]))
  return max
}
function drawableBounds(vertices) {
  if (!vertices || vertices.length < 2) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let index = 0; index + 1 < vertices.length; index += 2) {
    const x = vertices[index]
    const y = vertices[index + 1]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY } : null
}
function uvBounds(uvs) {
  if (!uvs || uvs.length < 2) return null
  let minU = Infinity
  let minV = Infinity
  let maxU = -Infinity
  let maxV = -Infinity
  for (let index = 0; index + 1 < uvs.length; index += 2) {
    const u = uvs[index]
    const v = uvs[index + 1]
    minU = Math.min(minU, u)
    minV = Math.min(minV, v)
    maxU = Math.max(maxU, u)
    maxV = Math.max(maxV, v)
  }
  return Number.isFinite(minU) ? { minU, minV, maxU, maxV, width: maxU - minU, height: maxV - minV } : null
}
function snapshotModel(model) {
  const drawables = []
  const masks = model.getDrawableMasks?.() ?? []
  const maskCounts = model.getDrawableMaskCounts?.() ?? []
  for (let index = 0; index < model.getDrawableCount(); index += 1) {
    const vertices = Array.from(model.getDrawableVertexPositions(index))
    const uvs = Array.from(model.getDrawableVertexUvs?.(index) ?? [])
    const indices = Array.from(model.getDrawableVertexIndices?.(index) ?? [])
    const drawableMasks = Array.from(masks[index] ?? []).map((maskIndex) => ({ index: maskIndex, id: model.getDrawableId(maskIndex)?.getString?.() ?? null }))
    drawables.push({
      id: model.getDrawableId(index).getString(),
      vertices,
      bounds: drawableBounds(vertices),
      uvs,
      uvBounds: uvBounds(uvs),
      indices,
      opacity: model.getDrawableOpacity(index),
      visible: model.getDrawableDynamicFlagIsVisible?.(index) ?? null,
      textureIndex: model.getDrawableTextureIndex?.(index) ?? null,
      vertexCount: model.getDrawableVertexCount?.(index) ?? vertices.length / 2,
      indexCount: model.getDrawableVertexIndexCount?.(index) ?? null,
      parentPartIndex: model.getDrawableParentPartIndex?.(index) ?? null,
      maskCount: maskCounts[index] ?? drawableMasks.length,
      masks: drawableMasks,
      invertedMask: model.getDrawableInvertedMaskBit?.(index) ?? null,
      blendMode: model.getDrawableBlendMode?.(index) ?? null,
    })
  }
  return drawables
}
function compareSnapshots(base, candidate) {
  let maxVertexDelta = 0
  let maxOpacityDelta = 0
  let changedDrawableCount = 0
  const byId = new Map(candidate.map((drawable) => [drawable.id, drawable]))
  for (const drawable of base) {
    const other = byId.get(drawable.id)
    if (!other) continue
    const vertexDelta = maxArrayDelta(drawable.vertices, other.vertices)
    const opacityDelta = Math.abs(drawable.opacity - other.opacity)
    maxVertexDelta = Math.max(maxVertexDelta, vertexDelta)
    maxOpacityDelta = Math.max(maxOpacityDelta, opacityDelta)
    if (vertexDelta > 1e-6 || opacityDelta > 1e-6) changedDrawableCount += 1
  }
  return { maxVertexDelta, maxOpacityDelta, changedDrawableCount, changed: changedDrawableCount > 0 }
}

class RavenQaModel extends CubismUserModel {
  constructor(canvas, onEvent, options = {}) {
    super()
    this.canvas = canvas
    this.gl = null
    this.setting = null
    this.onEvent = onEvent
    this.modelUrl = options.modelUrl || DEFAULT_MODEL_URL
    this.shaderPath = options.shaderPath || DEFAULT_SHADER_PATH
    this.coreUrl = options.coreUrl || '/live2d/Core/live2dcubismcore.min.js'
    this.motionByGroup = new Map()
    this.motionLoadFailures = []
    this.motionLoadWarnings = []
    this.expressionByName = new Map()
    this.eyeBlinkIds = []
    this.lipSyncIds = []
    this.manualOverrides = new Map()
    this.renderFrames = 0
    this.lastPixelCount = 0
    this.lastCapturePixels = null
    this.initialized = false
    this.report = null
  }

  assetUrl(file) {
    return new URL(file, new URL(this.modelUrl, window.location.href)).toString()
  }

  async load() {
    if (typeof Live2DCubismCore === 'undefined') throw new Error('avatar_core_unavailable')
    if (!CubismFramework.isStarted()) CubismFramework.startUp(new Option())
    if (!CubismFramework.isInitialized()) CubismFramework.initialize(CORE_MEMORY_BYTES)
    const model3Buffer = await fetchBuffer(this.modelUrl)
    this.setting = new CubismModelSettingJson(model3Buffer, model3Buffer.byteLength)
    for (let index = 0; index < this.setting.getEyeBlinkParameterCount(); index += 1) this.eyeBlinkIds.push(this.setting.getEyeBlinkParameterId(index))
    for (let index = 0; index < this.setting.getLipSyncParameterCount(); index += 1) this.lipSyncIds.push(this.setting.getLipSyncParameterId(index))
    const mocBuffer = await fetchBuffer(this.assetUrl(this.setting.getModelFileName()))
    this.loadModel(mocBuffer, true)
    if (this._model == null || this._moc == null) throw new Error('model_create_failed')
    const layout = new Map()
    this.setting.getLayoutMap(layout)
    this._modelMatrix.setupFromLayout(layout)
    await this.loadPhysicsFile()
    await this.loadExpressions()
    await this.loadMotions()
    this.gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true })
    if (this.gl === null) throw new Error('webgl2_unavailable')
    this.createRenderer(this.canvas.width, this.canvas.height)
    this.getRenderer().startUp(this.gl)
    this.getRenderer().loadShaders(this.shaderPath)
    const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl)
    const deadline = Date.now() + 8000
    while (!shader._isShaderLoaded && Date.now() < deadline) await sleep(40)
    if (!shader._isShaderLoaded) throw new Error('cubism_shader_load_failed')
    await this.loadTextures()
    this.getRenderer().setIsPremultipliedAlpha(true)
    this._model.saveParameters()
    this.initialized = true
    this.report = this.buildStaticReport()
    this.onEvent({ kind: 'ready', message: 'Core loaded, MOC consistency checked, shaders ready, texture bound' })
    return this.report
  }

  async loadPhysicsFile() {
    const file = this.setting.getPhysicsFileName()
    if (!file) return
    const buffer = await fetchBuffer(this.assetUrl(file))
    this.loadPhysics(buffer, buffer.byteLength)
  }

  async loadExpressions() {
    for (let index = 0; index < this.setting.getExpressionCount(); index += 1) {
      const name = this.setting.getExpressionName(index)
      const file = this.setting.getExpressionFileName(index)
      const buffer = await fetchBuffer(this.assetUrl(file))
      const expression = this.loadExpression(buffer, buffer.byteLength, name)
      if (expression) this.expressionByName.set(name, expression)
    }
  }

  async loadMotions() {
    for (let groupIndex = 0; groupIndex < this.setting.getMotionGroupCount(); groupIndex += 1) {
      const group = this.setting.getMotionGroupName(groupIndex)
      const count = this.setting.getMotionCount(group)
      if (!group || count < 1) continue
      const file = this.setting.getMotionFileName(group, 0)
      try {
        const buffer = await fetchBuffer(this.assetUrl(file))
        let motion = this.loadMotion(buffer, buffer.byteLength, group, undefined, undefined, this.setting, group, 0, true)
        if (!motion) {
          // Keep the strict result visible, but also test whether the JSON is
          // otherwise parseable. A fallback can explain why an otherwise
          // valid motion is absent without silently marking it verified.
          motion = this.loadMotion(buffer, buffer.byteLength, group, undefined, undefined, this.setting, group, 0, false)
          if (motion) this.motionLoadWarnings.push({ group, file, warning: 'strict_motion_consistency_failed; loaded_only_for_diagnostic' })
        }
        if (!motion) {
          this.motionLoadFailures.push({ group, file, reason: 'loadMotion_returned_null' })
          continue
        }
        motion.setEffectIds(this.eyeBlinkIds, this.lipSyncIds)
        this.motionByGroup.set(group, motion)
      } catch (error) {
        this.motionLoadFailures.push({ group, file, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  async loadTextures() {
    for (let index = 0; index < this.setting.getTextureCount(); index += 1) {
      const image = new Image()
      image.src = this.assetUrl(this.setting.getTextureFileName(index))
      await image.decode()
      const texture = this.gl.createTexture()
      if (!texture) throw new Error('texture_create_failed')
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture)
      this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image)
      this.gl.generateMipmap(this.gl.TEXTURE_2D)
      this.gl.bindTexture(this.gl.TEXTURE_2D, null)
      this.getRenderer().bindTexture(index, texture)
    }
  }

  buildStaticReport() {
    const coreVersion = Live2DCubismCore.Version.csmGetVersion()
    const parameters = []
    const parameterIndexById = new Map()
    for (let index = 0; index < this._model.getParameterCount(); index += 1) {
      const id = this._model.getParameterId(index).getString()
      parameterIndexById.set(id, index)
      parameters.push({ id, min: this._model.getParameterMinimumValue(index), max: this._model.getParameterMaximumValue(index), default: this._model.getParameterDefaultValue(index), value: this._model.getParameterValueByIndex(index) })
    }
    this.parameterIndexById = parameterIndexById
    return {
      generatedAt: new Date().toISOString(),
      core: {
        versionNumber: coreVersion,
        version: formatCoreVersion(coreVersion),
        latestMocVersionNumber: Live2DCubismCore.Version.csmGetLatestMocVersion(),
        latestMocVersion: formatMocVersion(Live2DCubismCore.Version.csmGetLatestMocVersion()),
        framework: this.shaderPath,
        core: this.coreUrl,
      },
      moc: { loaded: true, consistencyChecked: true, versionNumber: this._moc.getMocVersion(), version: formatMocVersion(this._moc.getMocVersion()), drawableCount: this._model.getDrawableCount(), parameterCount: this._model.getParameterCount() },
      model3: {
        url: this.modelUrl,
        eyeBlinkIds: this.eyeBlinkIds.map((id) => id.getString()),
        lipSyncIds: this.lipSyncIds.map((id) => id.getString()),
        motionGroups: Array.from(this.motionByGroup.keys()),
        motionLoadFailures: this.motionLoadFailures,
        motionLoadWarnings: this.motionLoadWarnings,
        expressions: Array.from(this.expressionByName.keys()),
        physicsFile: this.setting.getPhysicsFileName(),
      },
      parameters,
      standardParameterQa: [],
      render: { frameCount: 0, nonTransparentPixels: 0, status: 'waiting' },
    }
  }

  async runStandardParameterQa() {
    if (!this.initialized) throw new Error('model_not_initialized')
    this.stopMotions()
    const baseline = snapshotModel(this._model)
    const results = []
    for (const contract of STANDARD_PARAMS) {
      const index = this.parameterIndexById.get(contract.id)
      if (index === undefined) {
        results.push({ id: contract.id, exists: false, changed: false, reason: 'parameter_id_missing' })
        continue
      }
      const min = this._model.getParameterMinimumValue(index)
      const max = this._model.getParameterMaximumValue(index)
      const defaultValue = this._model.getParameterDefaultValue(index)
      this._model.loadParameters()
      this._model.setParameterValueByIndex(index, min, 1)
      this._model.update()
      const minDelta = compareSnapshots(baseline, snapshotModel(this._model))
      this._model.loadParameters()
      this._model.setParameterValueByIndex(index, max, 1)
      this._model.update()
      const maxDelta = compareSnapshots(baseline, snapshotModel(this._model))
      results.push({ id: contract.id, exists: true, min, default: defaultValue, max, changed: minDelta.changed || maxDelta.changed, minDelta, maxDelta })
    }
    this._model.loadParameters()
    this._model.update()
    this.report.standardParameterQa = results
    this.report.generatedAt = new Date().toISOString()
    this.onEvent({ kind: 'qa', message: `8 standard parameter checks complete: ${results.filter((item) => item.exists).length}/8 IDs present` })
    return results
  }

  async runMotionExpressionQa() {
    if (!this.initialized) throw new Error('model_not_initialized')
    this.stopMotions()
    const motionQa = []
    for (const group of this.motionByGroup.keys()) {
      this._model.loadParameters()
      this._model.update()
      const baseline = snapshotModel(this._model)
      const started = this.playMotion(group)
      for (let step = 0; step < 3; step += 1) this.update(0.5)
      const delta = compareSnapshots(baseline, snapshotModel(this._model))
      motionQa.push({ group, loaded: true, started, changed: delta.changed, maxVertexDelta: delta.maxVertexDelta, maxOpacityDelta: delta.maxOpacityDelta, changedDrawableCount: delta.changedDrawableCount })
    }
    this.stopMotions()
    const expressionQa = []
    for (const name of this.expressionByName.keys()) {
      this._model.loadParameters()
      this._model.update()
      const baseline = snapshotModel(this._model)
      const started = this.setExpression(name)
      for (let step = 0; step < 3; step += 1) this.update(0.1)
      const delta = compareSnapshots(baseline, snapshotModel(this._model))
      expressionQa.push({ name, loaded: true, started, changed: delta.changed, maxVertexDelta: delta.maxVertexDelta, maxOpacityDelta: delta.maxOpacityDelta, changedDrawableCount: delta.changedDrawableCount })
    }
    this.stopMotions()
    this._model.loadParameters()
    this._model.update()
    this.report.motionQa = motionQa
    this.report.expressionQa = expressionQa
    this.report.generatedAt = new Date().toISOString()
    this.onEvent({ kind: 'qa', message: `Motion/expression checks complete: ${motionQa.length} motions, ${expressionQa.length} expressions` })
    return { motionQa, expressionQa }
  }

  stopMotions() {
    this._motionManager.stopAllMotions()
    this._expressionManager.stopAllMotions()
  }

  setParameter(id, value) {
    const index = this.parameterIndexById?.get(id)
    if (index === undefined) return false
    const min = this._model.getParameterMinimumValue(index)
    const max = this._model.getParameterMaximumValue(index)
    this.manualOverrides.set(id, clamp(value, min, max))
    return true
  }

  setParameters(values) {
    this.stopMotions()
    for (const [id, value] of Object.entries(values)) this.setParameter(id, value)
  }

  playMotion(group) {
    const motion = this.motionByGroup.get(group)
    if (!motion) return false
    this.manualOverrides.clear()
    this._expressionManager.stopAllMotions()
    this._motionManager.stopAllMotions()
    this._motionManager.startMotionPriority(motion, false, 3)
    return true
  }

  setExpression(name) {
    const expression = this.expressionByName.get(name)
    if (!expression) return false
    // resetToNeutral() installs manual overrides so a capture can hold its
    // baseline. Clear them before an expression; otherwise the following
    // update reapplies every neutral value after the expression manager and
    // all expression filmstrips look identical.
    this.manualOverrides.clear()
    this._motionManager.stopAllMotions()
    this._expressionManager.startMotion(expression, false)
    return true
  }

  applyManualOverrides() {
    for (const [id, value] of this.manualOverrides.entries()) {
      const index = this.parameterIndexById.get(id)
      if (index !== undefined) this._model.setParameterValueByIndex(index, value, 1)
    }
  }

  update(deltaSeconds) {
    if (!this.initialized) return
    this._model.loadParameters()
    this._motionManager.updateMotion(this._model, deltaSeconds)
    if (this._physics) this._physics.evaluate(this._model, deltaSeconds)
    this._expressionManager.updateMotion(this._model, deltaSeconds)
    this.applyManualOverrides()
    this._model.update()
  }

  draw() {
    const width = this.canvas.width
    const height = this.canvas.height
    const projection = new CubismMatrix44()
    // Match the application's height + authored Layout framing. Never mutate
    // the model matrix here: export PPU/canvas width must not select width-fit.
    projection.scale(height / width, 1)
    projection.multiplyByMatrix(this._modelMatrix)
    const renderer = this.getRenderer()
    renderer.setMvpMatrix(projection)
    renderer.setRenderState(this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING), [0, 0, width, height])
    renderer.drawModel(this.shaderPath)
  }

  renderFrame(deltaSeconds, forcePixelRead = false) {
    this.update(deltaSeconds)
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    const offscreen = CubismWebGLOffscreenManager.getInstance()
    offscreen.beginFrameProcess(this.gl)
    this.draw()
    offscreen.endFrameProcess(this.gl)
    offscreen.releaseStaleRenderTextures(this.gl)
    this.renderFrames += 1
    if (forcePixelRead || this.renderFrames === 1 || this.renderFrames % 30 === 0) {
      const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4)
      this.gl.readPixels(0, 0, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
      this.lastCapturePixels = pixels
      let count = 0
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) count += 1
      this.lastPixelCount = count
      if (this.report) {
        this.report.render = { frameCount: this.renderFrames, nonTransparentPixels: count, status: count > 0 ? 'rendered' : 'empty' }
        this.report.generatedAt = new Date().toISOString()
      }
    }
  }

  renderWithoutUpdate(forcePixelRead = true) {
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    const offscreen = CubismWebGLOffscreenManager.getInstance()
    offscreen.beginFrameProcess(this.gl)
    this.draw()
    offscreen.endFrameProcess(this.gl)
    offscreen.releaseStaleRenderTextures(this.gl)
    if (!forcePixelRead) return
    const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4)
    this.gl.readPixels(0, 0, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels)
    this.lastCapturePixels = pixels
    let count = 0
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) count += 1
    this.lastPixelCount = count
  }

  alphaInspection() {
    const pixels = this.lastCapturePixels
    if (!pixels) return { status: 'not_captured', width: this.canvas.width, height: this.canvas.height }
    const width = this.canvas.width
    const height = this.canvas.height
    let nonTransparentPixels = 0
    let opaquePixels = 0
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    let minAlpha = 255
    let maxAlpha = 0
    let alphaSum = 0
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const alpha = pixels[(row * width + column) * 4 + 3]
        minAlpha = Math.min(minAlpha, alpha)
        maxAlpha = Math.max(maxAlpha, alpha)
        alphaSum += alpha
        if (alpha === 0) continue
        nonTransparentPixels += 1
        minX = Math.min(minX, column)
        minY = Math.min(minY, row)
        maxX = Math.max(maxX, column)
        maxY = Math.max(maxY, row)
        if (alpha >= 250) opaquePixels += 1
      }
    }
    return {
      status: nonTransparentPixels > 0 ? 'rendered' : 'empty',
      width,
      height,
      nonTransparentPixels,
      opaquePixels,
      alphaCoverage: nonTransparentPixels / (width * height),
      opaqueCoverage: opaquePixels / (width * height),
      alphaMean: alphaSum / (width * height),
      alphaRange: { min: minAlpha === 255 && nonTransparentPixels === 0 ? 0 : minAlpha, max: maxAlpha },
      alphaBounds: nonTransparentPixels > 0 ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
      source: 'WebGL readPixels RGBA alpha; drawable opacity and masks are reported separately',
    }
  }

  currentParameterValues() {
    return STANDARD_PARAMS.map(({ id }) => {
      const index = this.parameterIndexById.get(id)
      return index === undefined ? { id, value: null } : { id, value: this._model.getParameterValueByIndex(index) }
    })
  }

  allParameterValues() {
    const values = []
    for (let index = 0; index < this._model.getParameterCount(); index += 1) {
      values.push({
        id: this._model.getParameterId(index).getString(),
        min: this._model.getParameterMinimumValue(index),
        max: this._model.getParameterMaximumValue(index),
        default: this._model.getParameterDefaultValue(index),
        value: this._model.getParameterValueByIndex(index),
      })
    }
    return values
  }

  drawableSnapshot() { return snapshotModel(this._model) }

  captureDrawablePngDataUrl(id) {
    const drawables = snapshotModel(this._model)
    const targetIndex = drawables.findIndex((drawable) => drawable.id === id)
    if (targetIndex < 0) throw new Error(`drawable_not_found:${id}`)
    const coreDrawables = this._model?._model?.drawables
    if (!coreDrawables?.opacities) throw new Error('core_drawable_opacity_array_unavailable')
    this.update(0)
    const savedOpacities = new Float32Array(coreDrawables.opacities)
    const keep = new Set([targetIndex, ...Array.from(this._model.getDrawableMasks?.(targetIndex) ?? [])])
    for (let index = 0; index < coreDrawables.opacities.length; index += 1) coreDrawables.opacities[index] = keep.has(index) ? savedOpacities[index] : 0
    try {
      this.renderWithoutUpdate(true)
      const dataUrl = this.pixelsToPngDataUrl(this.lastCapturePixels)
      return { id, targetIndex, keptDrawableIds: Array.from(keep, (index) => drawables[index]?.id ?? null), dataUrl }
    } finally {
      coreDrawables.opacities.set(savedOpacities)
      this._model.update()
    }
  }

  drawableInspection() {
    return {
      generatedAt: new Date().toISOString(),
      source: 'Live2D Cubism Core model after CubismModel.update()',
      masking: {
        usingMasking: this._model.isUsingMasking?.() ?? null,
        usingMaskingForOffscreen: this._model.isUsingMaskingForOffscreen?.() ?? null,
      },
      drawables: snapshotModel(this._model),
      alpha: this.alphaInspection(),
    }
  }

  pixelsToPngDataUrl(pixels) {
    if (!pixels) throw new Error('capture_pixels_unavailable')
    const width = this.canvas.width
    const height = this.canvas.height
    const capture = document.createElement('canvas')
    capture.width = width
    capture.height = height
    const context = capture.getContext('2d')
    const imageData = context.createImageData(width, height)
    const stride = width * 4
    for (let row = 0; row < height; row += 1) {
      const sourceStart = (height - row - 1) * stride
      const targetStart = row * stride
      for (let offset = 0; offset < stride; offset += 4) {
        const alpha = pixels[sourceStart + offset + 3]
        imageData.data[targetStart + offset] = alpha === 0 ? 0 : Math.min(255, Math.round(pixels[sourceStart + offset] * 255 / alpha))
        imageData.data[targetStart + offset + 1] = alpha === 0 ? 0 : Math.min(255, Math.round(pixels[sourceStart + offset + 1] * 255 / alpha))
        imageData.data[targetStart + offset + 2] = alpha === 0 ? 0 : Math.min(255, Math.round(pixels[sourceStart + offset + 2] * 255 / alpha))
        imageData.data[targetStart + offset + 3] = alpha
      }
    }
    context.putImageData(imageData, 0, 0)
    return capture.toDataURL('image/png')
  }

  capturePngDataUrl() {
    this.renderFrame(0, true)
    return this.pixelsToPngDataUrl(this.lastCapturePixels)
  }
}

export async function createRavenQa(canvas, onEvent, options = {}) {
  const model = new RavenQaModel(canvas, onEvent, options)
  const report = await model.load()
  let previous = performance.now()
  let raf = null
  let loopRunning = true
  const frame = (timestamp) => {
    const delta = Math.min(0.1, Math.max(0.001, (timestamp - previous) / 1000))
    previous = timestamp
    if (!loopRunning) return
    try {
      model.renderFrame(delta)
    } catch (error) {
      onEvent({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      return
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return {
    model,
    report,
    runStandardParameterQa: () => model.runStandardParameterQa(),
    runMotionExpressionQa: () => model.runMotionExpressionQa(),
    setParameter: (id, value) => model.setParameters({ [id]: value }),
    setParameters: (values) => model.setParameters(values),
    playMotion: (group) => model.playMotion(group),
    setExpression: (name) => model.setExpression(name),
    stopLoop: () => { loopRunning = false; if (raf !== null) cancelAnimationFrame(raf); raf = null },
    startLoop: () => { if (loopRunning) return; loopRunning = true; previous = performance.now(); raf = requestAnimationFrame(frame); },
    tick: (deltaSeconds = 1 / 60) => model.renderFrame(deltaSeconds, true),
  resetToNeutral: (values = { ParamAngleX: 0, ParamAngleY: 0, ParamAngleZ: 0, ParamBodyAngleX: 0, ParamBodyAngleY: 0, ParamBodyAngleZ: 0, ParamEyeBallX: 0, ParamEyeBallY: 0, ParamEyeLOpen: 1, ParamEyeLSmile: 0, ParamEyeROpen: 1, ParamEyeRSmile: 0, ParamMouthOpenY: 0, ParamBreath: 0 }) => { model.stopMotions(); model.setParameters(values); model.renderFrame(0, true) },
    getReport: () => model.report,
    getCurrentParameterValues: () => model.currentParameterValues(),
    getAllParameterValues: () => model.allParameterValues(),
    getDrawableSnapshot: () => model.drawableSnapshot(),
    captureDrawablePngDataUrl: (id) => model.captureDrawablePngDataUrl(id),
    getDrawableInspection: () => model.drawableInspection(),
    getAlphaInspection: () => model.alphaInspection(),
    capturePngDataUrl: () => model.capturePngDataUrl(),
    dispose: () => { if (raf !== null) cancelAnimationFrame(raf); model.release() },
  }
}
