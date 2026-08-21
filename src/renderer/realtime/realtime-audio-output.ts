export interface RealtimeAudioOutputDependencies {
  readonly createAudioElement: () => HTMLAudioElement
  readonly createAudioContext: () => AudioContext
}

export interface CreateRealtimeAudioOutputInput {
  readonly dependencies?: Partial<RealtimeAudioOutputDependencies>
}

export interface RealtimeAudioOutput {
  readonly audioElement: HTMLAudioElement
  readonly analyser: AnalyserNode
  attachAnalyserTap(): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
}

function createDefaultAudioElement(): HTMLAudioElement {
  return document.createElement('audio')
}

function createDefaultAudioContext(): AudioContext {
  return new AudioContext()
}

export function createRealtimeAudioOutput(
  input: CreateRealtimeAudioOutputInput = {},
): RealtimeAudioOutput {
  const createAudioElement =
    input.dependencies?.createAudioElement ?? createDefaultAudioElement
  const createAudioContext =
    input.dependencies?.createAudioContext ?? createDefaultAudioContext
  const audioElement = createAudioElement()

  audioElement.muted = false
  audioElement.volume = 1

  const audioContext = createAudioContext()
  const analyser = audioContext.createAnalyser()
  let analyserTapAttached = false

  const attachAnalyserTap = (): void => {
    if (analyserTapAttached) return

    const remoteStream = audioElement.srcObject
    if (remoteStream == null) {
      throw new Error('Realtime audio analyser tap requires a MediaStream')
    }

    const source = audioContext.createMediaStreamSource(remoteStream as MediaStream)
    source.connect(analyser)
    analyserTapAttached = true
  }

  return Object.freeze({
    audioElement,
    analyser,
    attachAnalyserTap,
    setVolume: (volume: number): void => {
      audioElement.volume = volume
    },
    setMuted: (muted: boolean): void => {
      audioElement.muted = muted
    },
  })
}
