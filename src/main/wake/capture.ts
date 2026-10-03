import { Microphone } from 'decibri'
import { matchMicrophoneName } from '../../shared/audio-devices'

export interface WakeCapture {
  stop(): void
}

/** Only fixed diagnostic codes cross the worker boundary, never native messages. */
export function wakeMicrophoneFailureReason(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const reasons: Record<string, string> = {
    DEVICE_FAILED: 'wake_microphone_device_failed',
    STREAM_OPEN_FAILED: 'wake_microphone_open_failed',
    STREAM_START_FAILED: 'wake_microphone_start_failed',
    PERMISSION_DENIED: 'wake_microphone_permission_denied',
    MICROPHONE_STREAM_CLOSED: 'wake_microphone_stream_closed',
    NO_MICROPHONE_FOUND: 'wake_microphone_not_found',
    MICROPHONE_NOT_FOUND: 'wake_microphone_not_found',
    RESAMPLE_FAILED: 'wake_microphone_resample_failed',
  }
  return typeof code === 'string' && Object.hasOwn(reasons, code)
    ? reasons[code] : 'wake_microphone_failed'
}

export async function openWakeCapture(input: {
  readonly inputLabel?: string
  readonly onSamples: (samples: Int16Array) => void
  readonly onError: (reason?: string) => void
}): Promise<WakeCapture> {
  let device: { id: string } | number | undefined
  if (input.inputLabel) {
    const devices = Microphone.devices()
    const name = matchMicrophoneName(input.inputLabel, devices.map((entry) => entry.name))
    const selected = devices.find((entry) => entry.name === name)
    if (!selected) throw new Error('wake_microphone_selection_unavailable')
    device = selected.id ? { id: selected.id } : selected.index
  }
  const microphone = await Microphone.open({
    ...(device === undefined ? {} : { device }),
    sampleRate: 16_000,
    channels: 1,
    framesPerBuffer: 1_600,
    dtype: 'int16',
    vad: false,
    dcRemoval: true,
    highpass: 80,
  })
  let stopped = false
  let failed = false
  const fail = (reason: string): void => {
    if (stopped || failed) return
    failed = true
    input.onError(reason)
  }
  microphone.once('error', (error) => fail(wakeMicrophoneFailureReason(error)))
  microphone.once('end', () => fail('wake_microphone_stream_closed'))
  microphone.once('close', () => fail('wake_microphone_stream_closed'))
  microphone.on('data', (chunk) => {
    if (stopped || failed) return
    if (chunk.length % 2 !== 0) {
      fail('wake_microphone_invalid_pcm')
      return
    }
    const samples = new Int16Array(chunk.length / 2)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = chunk.readInt16LE(index * 2)
    }
    input.onSamples(samples)
  })
  return {
    stop: () => {
      if (stopped) return
      stopped = true
      microphone.stop()
    },
  }
}
