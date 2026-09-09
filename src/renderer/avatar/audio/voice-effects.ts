import { DEFAULT_VOICE_EFFECTS, type VoiceEffects } from '../../../shared/voice-effects'

interface StretchNode extends AudioWorkletNode {
  configure(config: { blockMs: number; intervalMs: number; splitComputation: boolean }): Promise<void>
  schedule(config: Record<string, number | boolean>): Promise<void>
  latency(): Promise<number>
}
type StretchFactory = ((context: AudioContext, options: AudioWorkletNodeOptions) => Promise<StretchNode>) & { moduleUrl: string }
export interface VoiceEffectGraph {
  readonly input: GainNode
  readonly output: GainNode
  readonly speechAnalyser: AnalyserNode
  readonly completionAnalyser: AnalyserNode
  readonly latencySeconds: number
  readonly tailSeconds: number
  update(settings: VoiceEffects): Promise<void>
  setVolume(value: number): void
  setMuted(value: boolean): void
  interrupt(): void
  begin(): Promise<void>
  dispose(): void
}
const ENGINE = { blockMs: 100, intervalMs: 40, splitComputation: true }
function bounded<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('voice_effects_timeout')), 3000)
    promise.then(value => { clearTimeout(timeout); resolve(value) }, error => { clearTimeout(timeout); reject(error) })
  })
}
function curve(grit: number): Float32Array<ArrayBuffer> {
  const values = new Float32Array(4097), drive = 1 + grit * 8
  for (let i = 0; i < values.length; i++) {
    const x = i * 2 / (values.length - 1) - 1
    values[i] = Math.tanh(x * drive) / Math.tanh(drive)
  }
  return values
}
export function roomImpulse(context: BaseAudioContext, size: VoiceEffects['roomSize']): AudioBuffer {
  const length = Math.ceil(context.sampleRate * (size === 'short' ? 0.12 : 0.25))
  const buffer = context.createBuffer(2, length, context.sampleRate)
  let seed = 137
  for (let c = 0; c < 2; c++) {
    const channel = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      channel[i] = (seed / 2147483648) * Math.pow(1 - i / length, 3) * 0.15
    }
  }
  return buffer
}

/** One graph for live output and auditions. No microphone, files or provider state. */
export async function createVoiceEffectGraph(context: AudioContext, initial: VoiceEffects = DEFAULT_VOICE_EFFECTS,
  onDegraded: (reason: string) => void = () => undefined): Promise<VoiceEffectGraph> {
  const input = context.createGain(), output = context.createGain(), direct = context.createGain(), drain = context.createGain()
  drain.gain.value = 0; drain.connect(output)
  const speechAnalyser = context.createAnalyser(), completionAnalyser = context.createAnalyser()
  let warmth = context.createBiquadFilter(), brightness = context.createBiquadFilter()
  warmth.type = 'lowshelf'; warmth.frequency.value = 300
  brightness.type = 'highshelf'; brightness.frequency.value = 3000
  let grit = context.createWaveShaper(), ceiling = context.createWaveShaper()
  grit.oversample = '2x'; ceiling.curve = curve(0); ceiling.oversample = '2x'
  let compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -6; compressor.knee.value = 6; compressor.ratio.value = 12
  compressor.attack.value = 0.003; compressor.release.value = 0.08
  const dry = context.createGain(), wet = context.createGain(), mix = context.createGain(), mouth = context.createGain()
  let room = context.createConvolver()
  let settings = { ...initial }, node: StretchNode | null = null, disposed = false, interrupted = false
  let volume = 1, muted = false, latency = 0, generation = 0, reset: Promise<void> = Promise.resolve()
  let failed = false
  let initializing: Promise<void> | undefined
  const smooth = (param: AudioParam, value: number): void => { param.setTargetAtTime(value, context.currentTime, 0.02) }
  const applyGain = (): void => {
    const gain = disposed || interrupted || muted ? 0 : volume * (settings.enabled && !failed ? Math.pow(10, settings.outputTrimDb / 20) : 1)
    output.gain.cancelScheduledValues(context.currentTime); output.gain.value = gain
    mouth.gain.cancelScheduledValues(context.currentTime); mouth.gain.value = gain
  }
  const wire = (): void => {
    input.disconnect(); direct.disconnect(); mix.disconnect()
    input.connect(drain)
    if (node) node.disconnect()
    if (settings.enabled && node && !failed) {
      if (!interrupted) input.connect(node)
      node.connect(warmth); direct.connect(dry).connect(mix); direct.connect(room)
      mix.connect(compressor).connect(ceiling).connect(output)
    } else {
      if (!interrupted) input.connect(direct)
      direct.connect(output)
    }
    direct.connect(mouth).connect(speechAnalyser)
  }
  warmth.connect(brightness).connect(grit).connect(direct)
  room.connect(wet).connect(mix); output.connect(completionAnalyser)
  const degrade = (): void => {
    if (disposed) return
    failed = true; latency = 0
    wire(); applyGain(); onDegraded('voice_effects_failed_bypassed')
  }
  const disposedNodes = new WeakSet<StretchNode>()
  const disposeNode = (value: StretchNode): void => {
    if (disposedNodes.has(value)) return
    disposedNodes.add(value); value.disconnect(); value.port.close(); value.onprocessorerror = null
  }
  const initializeNode = async (): Promise<void> => {
    const url = new URL('../voice-effects/SignalsmithStretch.mjs', document.baseURI).href
    const module = await import(/* @vite-ignore */ url) as { default: StretchFactory }
    module.default.moduleUrl = url
    const loading = module.default(context, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' })
    let abandoned = false
    loading.then(value => { if (abandoned || disposed) disposeNode(value) }, () => undefined)
    try { node = await bounded(loading) } catch (error) { abandoned = true; throw error }
    if (disposed) { disposeNode(node); node = null; return }
    node.onprocessorerror = degrade
    await bounded(node.configure(ENGINE))
    latency = await bounded(node.latency())
    if (!Number.isFinite(latency) || latency < 0 || latency > 0.18) throw new Error('voice_effects_latency_invalid')
  }
  const ensureNode = (): Promise<void> => {
    if (initializing) return initializing
    if (node || failed) return Promise.resolve()
    initializing = initializeNode().finally(() => { initializing = undefined })
    return initializing
  }
  const schedule = async (): Promise<void> => {
    if (!node || disposed) return
    await bounded(node.schedule({ active: true, semitones: settings.pitchSemitones,
      formantSemitones: settings.formantSemitones, formantCompensation: settings.formantCompensation, formantBaseHz: 0 }))
  }
  const update = async (next: VoiceEffects): Promise<void> => {
    if (disposed) return
    const token = ++generation, old = settings
    settings = { ...next }
    if (old.roomSize !== next.roomSize || !room.buffer) room.buffer = roomImpulse(context, next.roomSize)
    smooth(warmth.gain, next.warmthDb); smooth(brightness.gain, next.brightnessDb)
    grit.curve = next.grit === 0 ? null : curve(next.grit)
    smooth(dry.gain, 1 - next.roomMix); smooth(wet.gain, next.roomMix)
    try {
      if (next.enabled) await ensureNode()
      if (disposed || token !== generation) return
      if (old.enabled !== next.enabled && node) await bounded(node.configure(ENGINE))
      await schedule()
      if (disposed || token !== generation) return
      wire(); applyGain()
    } catch { degrade() }
  }
  await update(initial)
  return {
    input, output, speechAnalyser, completionAnalyser,
    get latencySeconds() { return settings.enabled && !failed ? latency + 0.006 : 0 },
    get tailSeconds() { return settings.enabled && !failed ? latency + 0.006 + (settings.roomMix ? settings.roomSize === 'short' ? 0.12 : 0.25 : 0) + 0.08 : 0 },
    update,
    setVolume(value) { volume = Math.max(0, Math.min(1, value)); applyGain() },
    setMuted(value) { muted = value; applyGain() },
    interrupt() {
      interrupted = true; ++generation; applyGain(); input.disconnect(); input.connect(drain)
      // Reconfigure invokes the upstream WASM reset; disconnect the input so no
      // cancelled remote samples can refill it. Recreate convolution tail only.
      direct.disconnect(); room.disconnect(); room = context.createConvolver()
      room.buffer = roomImpulse(context, settings.roomSize); room.connect(wet)
      // Native filters, oversampling and compressor lookahead also hold samples.
      // Recreate these short stateful stages while muted, not only the worklet.
      mix.disconnect()
      for (const value of [warmth, brightness, grit, compressor, ceiling]) value.disconnect()
      warmth = context.createBiquadFilter(); warmth.type = 'lowshelf'; warmth.frequency.value = 300; warmth.gain.value = settings.warmthDb
      brightness = context.createBiquadFilter(); brightness.type = 'highshelf'; brightness.frequency.value = 3000; brightness.gain.value = settings.brightnessDb
      grit = context.createWaveShaper(); grit.oversample = '2x'; grit.curve = settings.grit === 0 ? null : curve(settings.grit)
      ceiling = context.createWaveShaper(); ceiling.curve = curve(0); ceiling.oversample = '2x'
      compressor = context.createDynamicsCompressor(); compressor.threshold.value = -6; compressor.knee.value = 6
      compressor.ratio.value = 12; compressor.attack.value = 0.003; compressor.release.value = 0.08
      warmth.connect(brightness).connect(grit).connect(direct)
      reset = node ? bounded(node.configure(ENGINE)).then(schedule).catch(degrade) : Promise.resolve()
    },
    async begin() { const token = generation; await reset; if (disposed || token !== generation) return; interrupted = false; wire(); applyGain() },
    dispose() {
      if (disposed) return
      disposed = true; ++generation; applyGain()
      if (node) disposeNode(node)
      for (const value of [input, output, direct, drain, warmth, brightness, grit, ceiling, compressor, dry, wet, mix, mouth, room, speechAnalyser, completionAnalyser]) value.disconnect()
    },
  }
}
