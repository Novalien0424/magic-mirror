import { Microphone } from 'decibri'
import { matchMicrophoneName } from '../../shared/audio-devices'

export interface WakeCapture {
  stop(): void
}

export async function openWakeCapture(input: {
  readonly inputLabel?: string
  readonly onSamples: (samples: Int16Array) => void
  readonly onError: () => void
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
  microphone.on('data', (chunk) => {
    if (chunk.length % 2 !== 0) {
      input.onError()
      return
    }
    const samples = new Int16Array(chunk.length / 2)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = chunk.readInt16LE(index * 2)
    }
    input.onSamples(samples)
  })
  microphone.once('error', () => input.onError())
  return {
    stop: () => microphone.stop(),
  }
}
