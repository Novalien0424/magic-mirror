export interface RealtimeAudioOutputDependencies {
  readonly createAudioElement: () => HTMLAudioElement
  readonly createAudioContext: () => AudioContext
}

export interface CreateRealtimeAudioOutputInput {
  readonly dependencies?: Partial<RealtimeAudioOutputDependencies>
}

export type RealtimeAudioOutputDisposalResource =
  | 'audio_element'
  | 'analyser_source'
  | 'audio_context'

export type RealtimeAudioOutputDisposalReason =
  | 'pause_failed'
  | 'detach_failed'
  | 'disconnect_failed'
  | 'close_failed'

export type RealtimeAudioOutputStateReason =
  | 'output_disposing'
  | 'output_disposed'

export class RealtimeAudioOutputStateError extends Error {
  readonly reason: RealtimeAudioOutputStateReason

  constructor(reason: RealtimeAudioOutputStateReason) {
    super()
    Object.defineProperty(this, 'name', {
      configurable: true,
      value: 'RealtimeAudioOutputStateError',
    })
    this.reason = reason
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

interface RealtimeAudioOutputDisposalFailure {
  readonly resource: RealtimeAudioOutputDisposalResource
  readonly reason: RealtimeAudioOutputDisposalReason
}

export class RealtimeAudioOutputDisposalError extends Error {
  readonly resource: RealtimeAudioOutputDisposalResource
  readonly reason: RealtimeAudioOutputDisposalReason
  readonly resources: readonly RealtimeAudioOutputDisposalResource[]
  readonly reasons: readonly RealtimeAudioOutputDisposalReason[]
  readonly count: number

  constructor(failures: readonly RealtimeAudioOutputDisposalFailure[]) {
    super('Realtime audio output disposal failed')
    this.name = 'RealtimeAudioOutputDisposalError'
    const resources = failures.map(({ resource }) => resource)
    const reasons = failures.map(({ reason }) => reason)
    this.resource = resources[0] as RealtimeAudioOutputDisposalResource
    this.reason = reasons[0] as RealtimeAudioOutputDisposalReason
    this.resources = Object.freeze(resources)
    this.reasons = Object.freeze(reasons)
    this.count = failures.length
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface RealtimeAudioOutput {
  readonly audioElement: HTMLAudioElement
  readonly analyser: AnalyserNode
  attachAnalyserTap(): void
  setVolume(volume: number): void
  setMuted(muted: boolean): void
  dispose(): Promise<void>
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
  let analyserSource: MediaStreamAudioSourceNode | null = null
  let audioElementPaused = false
  let audioElementDetached = false
  let analyserSourceDisconnected = false
  let audioContextClosed = false
  let disposeComplete = false
  let disposeInFlight: Promise<void> | null = null

  const attachAnalyserTap = (): void => {
    if (disposeComplete) {
      throw new RealtimeAudioOutputStateError('output_disposed')
    }
    if (disposeInFlight !== null) {
      throw new RealtimeAudioOutputStateError('output_disposing')
    }
    if (analyserTapAttached || analyserSource !== null) return

    const remoteStream = audioElement.srcObject
    if (remoteStream == null) {
      throw new Error('Realtime audio analyser tap requires a MediaStream')
    }

    const source = audioContext.createMediaStreamSource(remoteStream as MediaStream)
    analyserSource = source
    source.connect(analyser)
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined)
    }
    analyserTapAttached = true
  }

  const dispose = (): Promise<void> => {
    if (disposeComplete) return Promise.resolve()
    if (disposeInFlight !== null) return disposeInFlight

    const performDispose = async (): Promise<void> => {
      const failures: RealtimeAudioOutputDisposalFailure[] = []

      if (!audioElementPaused) {
        try {
          audioElement.pause()
          audioElementPaused = true
        } catch {
          failures.push({ resource: 'audio_element', reason: 'pause_failed' })
        }
      }

      if (!audioElementDetached) {
        try {
          audioElement.srcObject = null
          audioElementDetached = true
        } catch {
          failures.push({ resource: 'audio_element', reason: 'detach_failed' })
        }
      }

      if (analyserSource === null) {
        analyserSourceDisconnected = true
      } else if (!analyserSourceDisconnected) {
        try {
          analyserSource.disconnect()
          analyserSourceDisconnected = true
        } catch {
          failures.push({ resource: 'analyser_source', reason: 'disconnect_failed' })
        }
      }

      if (!audioContextClosed) {
        try {
          await audioContext.close()
          audioContextClosed = true
        } catch {
          failures.push({ resource: 'audio_context', reason: 'close_failed' })
        }
      }

      if (failures.length > 0) {
        throw new RealtimeAudioOutputDisposalError(failures)
      }

      disposeComplete = true
    }

    let resolveOperation!: () => void
    let rejectOperation!: (reason: unknown) => void
    const operation = new Promise<void>((resolve, reject) => {
      resolveOperation = resolve
      rejectOperation = reject
    })
    disposeInFlight = operation
    void performDispose().then(
      () => {
        if (disposeInFlight === operation) disposeInFlight = null
        resolveOperation()
      },
      (error: unknown) => {
        if (disposeInFlight === operation) disposeInFlight = null
        rejectOperation(error)
      },
    )
    return operation
  }

  return Object.freeze({
    audioElement,
    analyser,
    attachAnalyserTap,
    dispose,
    setVolume: (volume: number): void => {
      audioElement.volume = volume
    },
    setMuted: (muted: boolean): void => {
      audioElement.muted = muted
    },
  })
}
