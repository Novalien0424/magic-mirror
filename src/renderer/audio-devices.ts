import { DEFAULT_AUDIO_PREFERENCES, DEFAULT_AUDIO_VOLUMES, type AudioDeviceState, type AudioPreferences, type AudioVolumes } from '../shared/audio-devices'
import { isWebConsole } from './shared/media-url'

interface AudioSink { setSinkId(id: string): Promise<void> }
/** Voice and cues stay on the speakerphone that owns the microphone: its echo
 * canceller hears only its own output. Music follows the system default, which the
 * venue Mac points at every speaker while Magic Mirror runs. An explicit operator
 * output choice applies to both. */
export type AudioSinkRole = 'voice' | 'music'

/** Output with the same device name as the selected (or default) microphone, or '' for the system default. */
export function speakerphoneOutputId(devices: AudioDeviceState['devices'], inputId: string): string {
  const name = (label: string) => label.replace(/^Default - /, '')
  const input = devices.find(d => d.kind === 'audioinput' && d.deviceId === (inputId || 'default'))
  if (!input?.label) return ''
  return devices.find(d => d.kind === 'audiooutput' && !['default', 'communications'].includes(d.deviceId)
    && name(d.label) === name(input.label))?.deviceId ?? ''
}

export class AudioDeviceRouter {
  private preferences = DEFAULT_AUDIO_PREFERENCES
  private devices: AudioDeviceState['devices'] = []
  private reason = 'audio_devices_loading'
  private sinks = new Map<AudioSink, AudioSinkRole>()
  // Per attached sink, so a sink that later routes (or detaches) clears its own failure.
  private failures = new Map<AudioSink, 'audio_output_unavailable_using_default' | 'audio_output_routing_failed'>()
  private listed: Promise<void> | undefined
  private listeners = new Set<(state: AudioDeviceState) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private ready: Promise<void>

  constructor(load: () => Promise<AudioPreferences>, private enumerate: () => Promise<readonly MediaDeviceInfo[]>,
    private wait: (ms: number) => Promise<void> = ms => new Promise(done => setTimeout(done, ms))) {
    this.ready = load().then((preferences) => {
      this.preferences = preferences
      this.reason = 'audio_devices_ready'
    }).catch(() => { this.reason = 'audio_preferences_unreadable_using_default' })
  }

  snapshot(): AudioDeviceState {
    const failures = [...this.failures.values()]
    const reason = failures.includes('audio_output_routing_failed') ? 'audio_output_routing_failed' : failures[0] ?? this.reason
    return { preferences: this.preferences, devices: this.devices, reason }
  }
  subscribe(listener: (state: AudioDeviceState) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  watchVolumes(listener: (volumes: AudioVolumes) => void): () => void {
    let disposed = false
    const notify = (): void => { if (!disposed) listener(this.preferences.volumes ?? DEFAULT_AUDIO_VOLUMES) }
    const unsubscribe = this.subscribe(notify)
    void this.ready.then(notify)
    return () => { disposed = true; unsubscribe() }
  }
  private changed(): void { for (const listener of this.listeners) listener(this.snapshot()) }
  async inputConstraints(): Promise<true | MediaTrackConstraints> {
    await this.ready
    await this.queue
    return this.preferences.inputId ? { deviceId: { exact: this.preferences.inputId } } : true
  }
  private async list(): Promise<void> {
    this.devices = (await this.enumerate()).filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
      .slice(0, 128).map((device) => ({ deviceId: device.deviceId, label: device.label, kind: device.kind as 'audioinput' | 'audiooutput' }))
  }
  private async route(sink: AudioSink, role: AudioSinkRole): Promise<void> {
    // Mac device IDs are not browser device IDs. Remote previews use that
    // computer's default output; device settings still control the Mirror.
    if (isWebConsole() && typeof sink.setSinkId !== 'function') return
    if (!isWebConsole() && role === 'voice' && !this.preferences.outputId) {
      try { await (this.listed ??= this.list()) } catch { this.listed = undefined }
    }
    const selected = this.sinkIdFor(role)
    const attempt = async (id: string) => { try { await sink.setSinkId(id); return true } catch { return false } }
    let failure: 'audio_output_unavailable_using_default' | 'audio_output_routing_failed' | undefined
    let routed = await attempt(selected)
    if (!routed && selected) { failure = 'audio_output_unavailable_using_default'; routed = await attempt('') }
    // The default briefly refuses while macOS switches it to the venue's shared
    // speakers at app start (a cold VIDEO LOOP press); one delayed retry.
    if (!routed) { await this.wait(1000); routed = await attempt('') }
    if (!routed) failure = 'audio_output_routing_failed'
    const before = this.failures.get(sink)
    // A sink detached during the retry must not leave a failure behind.
    if (failure && this.sinks.has(sink)) this.failures.set(sink, failure)
    else this.failures.delete(sink)
    if (failure || before) this.changed()
  }
  /** The output a graph of this role uses, from the cached device list ('' = system default). */
  sinkIdFor(role: AudioSinkRole = 'voice'): string {
    if (isWebConsole()) return ''
    return this.preferences.outputId || (role === 'music' ? '' : speakerphoneOutputId(this.devices, this.preferences.inputId))
  }
  async attach(sink: AudioSink, isDisposed: () => boolean = () => false, role: AudioSinkRole = 'voice'): Promise<() => void> {
    await this.ready
    await this.queue
    if (isDisposed()) return () => undefined
    this.sinks.set(sink, role)
    await this.route(sink, role)
    return () => {
      this.sinks.delete(sink)
      if (this.failures.delete(sink)) this.changed()
    }
  }
  select(preferences: AudioPreferences): Promise<void> {
    const operation = this.queue.then(async () => {
      await this.ready
      const outputChanged = this.preferences.outputId !== preferences.outputId
      this.preferences = preferences
      if (outputChanged) {
        this.reason = 'audio_devices_ready'
        await Promise.all([...this.sinks].map(([sink, role]) => this.route(sink, role)))
      }
      this.changed()
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }
  async refresh(): Promise<void> {
    await this.ready
    try {
      const listing = this.list()
      this.listed = listing
      await listing
      await this.queue
      if (this.reason === 'audio_device_enumeration_failed') this.reason = 'audio_devices_ready'
      await Promise.all([...this.sinks].map(([sink, role]) => this.route(sink, role)))
    } catch { this.reason = 'audio_device_enumeration_failed' }
    this.changed()
  }
}

let router: AudioDeviceRouter | undefined
export function getAudioDeviceRouter(): AudioDeviceRouter {
  return router ??= new AudioDeviceRouter(async () => {
    const bridge = window.magicMirror
    if (bridge && 'getAvatarRuntime' in bridge) {
      const result = await bridge.getAvatarRuntime()
      if (!result.ok) throw new Error('audio_preferences_unavailable')
      return result.value.audioDevices?.preferences ?? DEFAULT_AUDIO_PREFERENCES
    }
    if (!bridge || !('getAudioPreferences' in bridge) || !bridge.getAudioPreferences) return DEFAULT_AUDIO_PREFERENCES
    const result = await bridge.getAudioPreferences()
    if (result.reason !== 'audio_devices_ready') throw new Error(result.reason)
    return result.preferences
  }, () => navigator.mediaDevices.enumerateDevices())
}
