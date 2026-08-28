/// <reference path="../../vendor/live2d/Core/live2dcubismcore.d.ts" />

import { CubismModelSettingJson } from '../../vendor/live2d/Framework/dist/cubismmodelsettingjson'
import { CubismDefaultParameterId } from '../../vendor/live2d/Framework/dist/cubismdefaultparameterid'
import {
  BreathParameterData,
  CubismBreath,
} from '../../vendor/live2d/Framework/dist/effect/cubismbreath'
import { CubismEyeBlink } from '../../vendor/live2d/Framework/dist/effect/cubismeyeblink'
import { CubismFramework, Option } from '../../vendor/live2d/Framework/dist/live2dcubismframework'
import { CubismMatrix44 } from '../../vendor/live2d/Framework/dist/math/cubismmatrix44'
import { CubismUserModel } from '../../vendor/live2d/Framework/dist/model/cubismusermodel'
import type { ACubismMotion } from '../../vendor/live2d/Framework/dist/motion/acubismmotion'
import type { CubismMotion } from '../../vendor/live2d/Framework/dist/motion/cubismmotion'
import type { CubismIdHandle } from '../../vendor/live2d/Framework/dist/id/cubismid'
import { CubismWebGLOffscreenManager } from '../../vendor/live2d/Framework/dist/rendering/cubismoffscreenmanager'
import {
  renExpressionForState,
  resolveAvatarModelSource,
} from './avatar-model-source'
import type { AvatarState } from './avatar-state'

const CUBISM_MEMORY_BYTES = 1024 * 1024 * 32
const STATE_PRIORITY = 2
const FPS_SAMPLE_COUNT = 120
const METRICS_INTERVAL_MS = 500
const SHADER_BASE_URL = '/live2d/Framework/Shaders/WebGL/'

export type CubismAvatarFailureReason =
  | 'avatar_core_unavailable'
  | 'avatar_webgl_unavailable'
  | 'avatar_software_renderer'
  | 'avatar_model_load_failed'
  | 'avatar_texture_load_failed'
  | 'avatar_frame_setup_failed'
  | 'avatar_parameter_load_failed'
  | 'avatar_motion_start_failed'
  | 'avatar_motion_update_failed'
  | 'avatar_parameter_save_failed'
  | 'avatar_effect_update_failed'
  | 'avatar_lip_update_failed'
  | 'avatar_model_update_failed'
  | 'avatar_draw_failed'

export interface CubismAvatarEvent {
  readonly status: 'ready' | 'degraded' | 'failed'
  readonly reason: string
}

export interface CubismAvatarMetrics {
  readonly fps: number
  readonly mouthOpen: number
  readonly state: AvatarState
}

export interface CubismAvatarRenderer {
  initialize(): Promise<void>
  setState(state: AvatarState): void
  setExpression(name: string): void
  setMouthOpen(value: number): void
  stopSpeakingMotion(): void
  clearExpression(): void
  resize(width: number, height: number): void
  dispose(): void
}

export interface CreateCubismAvatarRendererInput {
  readonly canvas: HTMLCanvasElement
  readonly assetBaseUrl?: string
  readonly manifestFileName?: string
  readonly eventSink: (event: CubismAvatarEvent) => void
  readonly metricsSink: (metrics: CubismAvatarMetrics) => void
}

function unit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function report(
  sink: (event: CubismAvatarEvent) => void,
  event: CubismAvatarEvent,
): void {
  try {
    sink(Object.freeze(event))
  } catch {
    // Console visibility cannot gate the local renderer.
  }
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('asset_fetch_failed')
  return response.arrayBuffer()
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = url
  if (typeof image.decode === 'function') {
    await image.decode()
  } else {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('image_decode_failed'))
    })
  }
  return image
}

function ensureFramework(): void {
  if (typeof Live2DCubismCore === 'undefined') {
    throw new Error('avatar_core_unavailable')
  }
  if (!CubismFramework.isStarted()) CubismFramework.startUp(new Option())
  if (!CubismFramework.isInitialized()) CubismFramework.initialize(CUBISM_MEMORY_BYTES)
}

class MagicMirrorCubismModel extends CubismUserModel {
  readonly #canvas: HTMLCanvasElement
  readonly #gl: WebGLRenderingContext | WebGL2RenderingContext
  readonly #assetBaseUrl: string
  readonly #manifestUrl: string
  readonly #motions = new Map<Exclude<AvatarState, 'OfflineLoop'>, CubismMotion>()
  readonly #expressions = new Map<string, ACubismMotion>()
  readonly #textures: WebGLTexture[] = []
  readonly #eyeBlinkIds: CubismIdHandle[] = []
  readonly #lipSyncIds: CubismIdHandle[] = []
  #setting: CubismModelSettingJson | null = null
  #state: AvatarState = 'Dormant'
  #mouthOpen = 0

  constructor(
    canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    assetBaseUrl: string,
    manifestUrl: string,
  ) {
    super()
    this.#canvas = canvas
    this.#gl = gl
    this.#assetBaseUrl = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`
    this.#manifestUrl = manifestUrl
  }

  async load(): Promise<void> {
    const model3 = await fetchBuffer(this.#manifestUrl)
    const setting = new CubismModelSettingJson(model3, model3.byteLength)
    this.#setting = setting
    for (let index = 0; index < setting.getEyeBlinkParameterCount(); index += 1) {
      this.#eyeBlinkIds.push(setting.getEyeBlinkParameterId(index))
    }
    for (let index = 0; index < setting.getLipSyncParameterCount(); index += 1) {
      this.#lipSyncIds.push(setting.getLipSyncParameterId(index))
    }

    const moc = await fetchBuffer(`${this.#assetBaseUrl}${setting.getModelFileName()}`)
    this.loadModel(moc, true)
    if (this._model == null) throw new Error('model_create_failed')

    const layout = new Map<string, number>()
    setting.getLayoutMap(layout)
    this._modelMatrix.setupFromLayout(layout)

    await Promise.all([
      this.#loadPhysics(setting),
      this.#loadPose(setting),
      this.#loadExpressions(setting),
      this.#loadMotions(setting),
    ])

    this._eyeBlink = CubismEyeBlink.create(setting)
    this._eyeBlink?.setBlinkingInterval(4)
    this.#configureBreath()

    this.createRenderer(this.#canvas.width, this.#canvas.height)
    this.getRenderer().startUp(this.#gl)
    await this.#loadTextures(setting)
    this.getRenderer().setIsPremultipliedAlpha(true)

    this._model.saveParameters()
    this.setInitialized(true)
    this.setUpdating(false)
    this.setState('Dormant')
  }

  async #loadPhysics(setting: CubismModelSettingJson): Promise<void> {
    const file = setting.getPhysicsFileName()
    if (file.length === 0) return
    const buffer = await fetchBuffer(`${this.#assetBaseUrl}${file}`)
    this.loadPhysics(buffer, buffer.byteLength)
  }

  async #loadPose(setting: CubismModelSettingJson): Promise<void> {
    const file = setting.getPoseFileName()
    if (file.length === 0) return
    const buffer = await fetchBuffer(`${this.#assetBaseUrl}${file}`)
    this.loadPose(buffer, buffer.byteLength)
  }

  async #loadExpressions(setting: CubismModelSettingJson): Promise<void> {
    const tasks: Promise<void>[] = []
    for (let index = 0; index < setting.getExpressionCount(); index += 1) {
      tasks.push((async () => {
        const name = setting.getExpressionName(index)
        const file = setting.getExpressionFileName(index)
        const buffer = await fetchBuffer(`${this.#assetBaseUrl}${file}`)
        const expression = this.loadExpression(buffer, buffer.byteLength, name)
        if (expression != null) this.#expressions.set(name, expression)
      })())
    }
    await Promise.all(tasks)
  }

  async #loadMotions(setting: CubismModelSettingJson): Promise<void> {
    const tasks: Promise<void>[] = []
    for (let groupIndex = 0; groupIndex < setting.getMotionGroupCount(); groupIndex += 1) {
      const group = setting.getMotionGroupName(groupIndex) as Exclude<AvatarState, 'OfflineLoop'>
      if (setting.getMotionCount(group) === 0) continue
      tasks.push((async () => {
        const file = setting.getMotionFileName(group, 0)
        const buffer = await fetchBuffer(`${this.#assetBaseUrl}${file}`)
        const motion = this.loadMotion(
          buffer,
          buffer.byteLength,
          group,
          undefined,
          undefined,
          setting,
          group,
          0,
          true,
        )
        if (motion != null) {
          motion.setEffectIds(this.#eyeBlinkIds, this.#lipSyncIds)
          this.#motions.set(group, motion)
        }
      })())
    }
    await Promise.all(tasks)
  }

  #configureBreath(): void {
    const ids = CubismFramework.getIdManager()
    this._breath = CubismBreath.create()
    this._breath.setParameters([
      new BreathParameterData(ids.getId(CubismDefaultParameterId.ParamAngleX), 0, 15, 6.53, 0.5),
      new BreathParameterData(ids.getId(CubismDefaultParameterId.ParamAngleY), 0, 8, 3.53, 0.5),
      new BreathParameterData(ids.getId(CubismDefaultParameterId.ParamAngleZ), 0, 10, 5.53, 0.5),
      new BreathParameterData(ids.getId(CubismDefaultParameterId.ParamBodyAngleX), 0, 4, 15.53, 0.5),
      new BreathParameterData(ids.getId(CubismDefaultParameterId.ParamBreath), 0.5, 0.5, 3.23, 1),
    ])
  }

  async #loadTextures(setting: CubismModelSettingJson): Promise<void> {
    for (let index = 0; index < setting.getTextureCount(); index += 1) {
      const file = setting.getTextureFileName(index)
      const image = await loadImage(`${this.#assetBaseUrl}${file}`)
      const texture = this.#gl.createTexture()
      if (texture === null) throw new Error('texture_create_failed')

      this.#gl.bindTexture(this.#gl.TEXTURE_2D, texture)
      this.#gl.pixelStorei(this.#gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
      this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MIN_FILTER, this.#gl.LINEAR_MIPMAP_LINEAR)
      this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MAG_FILTER, this.#gl.LINEAR)
      this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_S, this.#gl.CLAMP_TO_EDGE)
      this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_T, this.#gl.CLAMP_TO_EDGE)
      this.#gl.texImage2D(
        this.#gl.TEXTURE_2D,
        0,
        this.#gl.RGBA,
        this.#gl.RGBA,
        this.#gl.UNSIGNED_BYTE,
        image,
      )
      this.#gl.generateMipmap(this.#gl.TEXTURE_2D)
      this.#gl.bindTexture(this.#gl.TEXTURE_2D, null)
      this.#textures.push(texture)
      this.getRenderer().bindTexture(index, texture)
    }
  }

  setState(state: AvatarState): void {
    this.#state = state
    this._expressionManager.stopAllMotions()
    if (state === 'OfflineLoop') {
      this._motionManager.stopAllMotions()
      return
    }
    const expressionName = renExpressionForState(state)
    if (expressionName !== null) this.setExpression(expressionName)
    const motion = this.#motions.get(state)
    if (motion === undefined) return
    this._motionManager.stopAllMotions()
    this._motionManager.startMotionPriority(motion, false, STATE_PRIORITY)
  }

  setExpression(name: string): void {
    const expression = this.#expressions.get(name)
    if (expression !== undefined) this._expressionManager.startMotion(expression, false)
  }

  clearExpression(): void {
    this._expressionManager.stopAllMotions()
  }

  stopSpeakingMotion(): void {
    if (this.#state === 'Speaking') this._motionManager.stopAllMotions()
  }

  setMouthOpen(value: number): void {
    this.#mouthOpen = unit(value)
  }

  update(deltaSeconds: number): void {
    if (!this.isInitialized()) return
    try { this._model.loadParameters() } catch { throw new Error('avatar_parameter_load_failed') }
    try {
      if (this._motionManager.isFinished() && this.#state !== 'OfflineLoop') {
        const motion = this.#motions.get(this.#state)
        if (motion !== undefined) {
          this._motionManager.startMotionPriority(motion, false, STATE_PRIORITY)
        }
      }
    } catch {
      throw new Error('avatar_motion_start_failed')
    }
    try {
      this._motionManager.updateMotion(this._model, deltaSeconds)
    } catch {
      throw new Error('avatar_motion_update_failed')
    }
    try { this._model.saveParameters() } catch { throw new Error('avatar_parameter_save_failed') }

    try {
      this._physics?.evaluate(this._model, deltaSeconds)
      this._breath?.updateParameters(this._model, deltaSeconds)
      this._eyeBlink?.updateParameters(this._model, deltaSeconds)
      this._expressionManager.updateMotion(this._model, deltaSeconds)
      this._pose?.updateParameters(this._model, deltaSeconds)
    } catch {
      throw new Error('avatar_effect_update_failed')
    }

    const setting = this.#setting
    try {
      if (setting !== null) {
        for (let index = 0; index < setting.getLipSyncParameterCount(); index += 1) {
          this._model.setParameterValueById(
            setting.getLipSyncParameterId(index),
            this.#mouthOpen,
            0.8,
          )
        }
      }
    } catch {
      throw new Error('avatar_lip_update_failed')
    }
    try {
      this._model.update()
    } catch {
      throw new Error('avatar_model_update_failed')
    }
  }

  draw(): void {
    if (!this.isInitialized()) return
    const width = this.#canvas.width
    const height = this.#canvas.height
    const projection = new CubismMatrix44()
    if (this._model.getCanvasWidth() > 1 && width < height) {
      this._modelMatrix.setWidth(2)
      projection.scale(1, width / height)
    } else {
      projection.scale(height / width, 1)
    }
    projection.multiplyByMatrix(this._modelMatrix)
    this.getRenderer().setMvpMatrix(projection)
    this.getRenderer().setRenderState(
      this.#gl.getParameter(this.#gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer,
      [0, 0, width, height],
    )
    this.getRenderer().drawModel(SHADER_BASE_URL)
  }

  override release(): void {
    for (const texture of this.#textures) this.#gl.deleteTexture(texture)
    this.#textures.length = 0
    super.release()
  }
}

export function createCubismAvatarRenderer(
  input: CreateCubismAvatarRendererInput,
): CubismAvatarRenderer {
  const modelSource = resolveAvatarModelSource(input)
  let model: MagicMirrorCubismModel | null = null
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  let frameId: number | null = null
  let disposed = false
  let previousTimestamp = 0
  let lastMetricsTimestamp = 0
  let state: AvatarState = 'Dormant'
  let mouthOpen = 0
  const frameTimes: number[] = []
  let softwareRenderer = false

  const fail = (reason: CubismAvatarFailureReason): void => {
    report(input.eventSink, { status: 'failed', reason })
  }

  const frame = (timestamp: number): void => {
    frameId = null
    if (disposed || model === null || gl === null) return
    const deltaMs = previousTimestamp === 0 ? 16.67 : Math.min(100, timestamp - previousTimestamp)
    previousTimestamp = timestamp

    try {
      gl.viewport(0, 0, input.canvas.width, input.canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      CubismWebGLOffscreenManager.getInstance().beginFrameProcess(gl)
    } catch {
      fail('avatar_frame_setup_failed')
      return
    }
    try {
      model.update(deltaMs / 1000)
    } catch (error) {
      const reason = error instanceof Error && (
        error.message === 'avatar_parameter_load_failed'
        || error.message === 'avatar_motion_start_failed'
        || error.message === 'avatar_motion_update_failed'
        || error.message === 'avatar_parameter_save_failed'
        || error.message === 'avatar_effect_update_failed'
        || error.message === 'avatar_lip_update_failed'
        || error.message === 'avatar_model_update_failed'
      ) ? error.message as CubismAvatarFailureReason : 'avatar_model_update_failed'
      fail(reason)
      return
    }
    try {
      model.draw()
      CubismWebGLOffscreenManager.getInstance().endFrameProcess(gl)
      CubismWebGLOffscreenManager.getInstance().releaseStaleRenderTextures(gl)
    } catch {
      fail('avatar_draw_failed')
      return
    }

    frameTimes.push(timestamp)
    if (frameTimes.length > FPS_SAMPLE_COUNT) frameTimes.shift()
    if (timestamp - lastMetricsTimestamp >= METRICS_INTERVAL_MS) {
      const elapsed = frameTimes.length < 2 ? 0 : frameTimes.at(-1)! - frameTimes[0]!
      const fps = elapsed <= 0 ? 0 : ((frameTimes.length - 1) * 1000) / elapsed
      try {
        input.metricsSink(Object.freeze({ fps, mouthOpen, state }))
      } catch {
        // Metrics are observational and cannot stop animation.
      }
      lastMetricsTimestamp = timestamp
    }
    frameId = requestAnimationFrame(frame)
  }

  return Object.freeze({
    initialize: async (): Promise<void> => {
      if (disposed) throw new Error('avatar_renderer_disposed')
      try {
        ensureFramework()
      } catch {
        fail('avatar_core_unavailable')
        throw new Error('avatar_core_unavailable')
      }

      gl = input.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
      if (gl === null) {
        fail('avatar_webgl_unavailable')
        throw new Error('avatar_webgl_unavailable')
      }
      const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info') as {
        readonly UNMASKED_RENDERER_WEBGL: number
      } | null
      if (rendererInfo !== null) {
        const rendererName = gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
        softwareRenderer = typeof rendererName === 'string' && /swiftshader/iu.test(rendererName)
      }

      model = new MagicMirrorCubismModel(
        input.canvas,
        gl,
        modelSource.assetBaseUrl,
        modelSource.manifestUrl,
      )
      try {
        await model.load()
      } catch (error) {
        const reason = error instanceof Error && error.message.includes('texture')
          ? 'avatar_texture_load_failed'
          : 'avatar_model_load_failed'
        fail(reason)
        model.release()
        model = null
        throw new Error(reason)
      }

      report(input.eventSink, softwareRenderer
        ? { status: 'degraded', reason: 'avatar_software_renderer' }
        : { status: 'ready', reason: 'cubism_avatar_ready' })
      frameId = requestAnimationFrame(frame)
    },
    setState: (next: AvatarState): void => {
      state = next
      model?.setState(next)
    },
    setExpression: (name: string): void => model?.setExpression(name),
    setMouthOpen: (value: number): void => {
      mouthOpen = unit(value)
      model?.setMouthOpen(mouthOpen)
    },
    stopSpeakingMotion: (): void => model?.stopSpeakingMotion(),
    clearExpression: (): void => model?.clearExpression(),
    resize: (width: number, height: number): void => {
      if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
        return
      }
      input.canvas.width = width
      input.canvas.height = height
      model?.setRenderTargetSize(width, height)
    },
    dispose: (): void => {
      if (disposed) return
      disposed = true
      if (frameId !== null) cancelAnimationFrame(frameId)
      frameId = null
      model?.release()
      model = null
      gl = null
    },
  })
}
