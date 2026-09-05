import { DEFAULT_AUDIO_PREFERENCES, type AudioDeviceState, type AudioPreferences } from '../shared/audio-devices'

interface AudioSink { setSinkId(id: string): Promise<void> }

export class AudioDeviceRouter {
  private preferences = DEFAULT_AUDIO_PREFERENCES
  private devices: AudioDeviceState['devices'] = []
  private reason = 'audio_devices_loading'
  private sinks = new Set<AudioSink>()
  private listeners = new Set<(state: AudioDeviceState) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private ready: Promise<void>

  constructor(load: () => Promise<AudioPreferences>, private enumerate: () => Promise<readonly MediaDeviceInfo[]>) {
    this.ready = load().then((preferences) => {
      this.preferences = preferences
      this.reason = 'audio_devices_ready'
    }).catch(() => { this.reason = 'audio_preferences_unreadable_using_default' })
  }

  snapshot(): AudioDeviceState { return { preferences: this.preferences, devices: this.devices, reason: this.reason } }
  subscribe(listener: (state: AudioDeviceState) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private changed(): void { for (const listener of this.listeners) listener(this.snapshot()) }
  async inputConstraints(): Promise<true | MediaTrackConstraints> {
    await this.ready
    await this.queue
    return this.preferences.inputId ? { deviceId: { exact: this.preferences.inputId } } : true
  }
  private async route(sink: AudioSink): Promise<void> {
    try { await sink.setSinkId(this.preferences.outputId) } catch {
      this.reason = 'audio_output_unavailable_using_default'
      try { await sink.setSinkId('') } catch { this.reason = 'audio_output_routing_failed' }
      this.changed()
    }
  }
  async attach(sink: AudioSink, isDisposed: () => boolean = () => false): Promise<() => void> {
    await this.ready
    await this.queue
    if (isDisposed()) return () => undefined
    this.sinks.add(sink)
    await this.route(sink)
    return () => { this.sinks.delete(sink) }
  }
  select(preferences: AudioPreferences): Promise<void> {
    const operation = this.queue.then(async () => {
      await this.ready
      this.preferences = preferences
      this.reason = 'audio_devices_ready'
      await Promise.all([...this.sinks].map((sink) => this.route(sink)))
      this.changed()
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }
  async refresh(): Promise<void> {
    await this.ready
    try {
      this.devices = (await this.enumerate()).filter((device) => device.kind === 'audioinput' || device.kind === 'audiooutput')
        .slice(0, 128).map((device) => ({ deviceId: device.deviceId, label: device.label, kind: device.kind as 'audioinput' | 'audiooutput' }))
      await this.queue
      if (this.reason.startsWith('audio_output_') || this.reason === 'audio_device_enumeration_failed') this.reason = 'audio_devices_ready'
      await Promise.all([...this.sinks].map((sink) => this.route(sink)))
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
