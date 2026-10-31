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
  private listed: Promise<void> | undefined
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
    const target = isWebConsole() || this.preferences.outputId || role === 'music' ? '' : speakerphoneOutputId(this.devices, this.preferences.inputId)
    try { await sink.setSinkId(isWebConsole() ? '' : this.preferences.outputId || target) } catch {
      this.reason = 'audio_output_unavailable_using_default'
      try { await sink.setSinkId('') } catch { this.reason = 'audio_output_routing_failed' }
      this.changed()
    }
  }
  async attach(sink: AudioSink, isDisposed: () => boolean = () => false, role: AudioSinkRole = 'voice'): Promise<() => void> {
    await this.ready
    await this.queue
    if (isDisposed()) return () => undefined
    this.sinks.set(sink, role)
    await this.route(sink, role)
    return () => { this.sinks.delete(sink) }
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
      if (this.reason.startsWith('audio_output_') || this.reason === 'audio_device_enumeration_failed') this.reason = 'audio_devices_ready'
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
