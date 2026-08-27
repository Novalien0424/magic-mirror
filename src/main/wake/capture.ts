import { Microphone } from 'decibri'

export interface WakeCapture {
  stop(): void
}

export async function openWakeCapture(input: {
  readonly onSamples: (samples: Int16Array) => void
  readonly onError: () => void
}): Promise<WakeCapture> {
  const microphone = await Microphone.open({
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
