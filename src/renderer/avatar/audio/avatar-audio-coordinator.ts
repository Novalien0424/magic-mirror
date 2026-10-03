import type { AvatarConversationState } from '../avatar-state'
import {
  createAvatarRuntimeController,
  type AvatarRenderPort,
  type AvatarRuntimeController,
} from '../avatar-runtime-controller'
import {
  createLipSyncDriver,
  type CreateLipSyncDriverInput,
  type LipSyncAnalyser,
  type LipSyncDriver,
  type LipSyncDriverEvent,
} from './lip-sync-driver'

export type AvatarAudioActivity =
  | 'speech_started'
  | 'speech_stopped'
  | 'output_started'
  | 'output_stopped'
  | 'interrupted'

export interface AvatarAudioOutput {
  readonly analyser: LipSyncAnalyser
  attachAnalyserTap(): void
}

export interface AvatarAudioCoordinatorEvent {
  readonly status: 'degraded'
  readonly reason: string
}

export interface AvatarAudioCoordinator {
  setRenderer(renderer: AvatarRenderPort | null): void
  setAudioOutput(output: AvatarAudioOutput | null): void
  handleActivity(activity: AvatarAudioActivity): void
  dispose(): void
}

export interface CreateAvatarAudioCoordinatorInput {
  readonly createDriver?: (input: CreateLipSyncDriverInput) => LipSyncDriver
  readonly onConversationState: (state: AvatarConversationState) => void
  readonly eventSink: (event: AvatarAudioCoordinatorEvent | LipSyncDriverEvent) => void
  readonly onMouthOpen?: (value: number) => void
}

const ENVELOPE = Object.freeze({
  silenceThreshold: 0.015,
  gain: 5,
  attackMs: 35,
  releaseMs: 90,
})

function scheduler(): CreateLipSyncDriverInput['scheduler'] {
  return Object.freeze({
    request: (callback: (timestampMs: number) => void): number => requestAnimationFrame(callback),
    cancel: (id: number): void => cancelAnimationFrame(id),
  })
}

export function createAvatarAudioCoordinator(
  input: CreateAvatarAudioCoordinatorInput,
): AvatarAudioCoordinator {
  const driverFactory = input.createDriver ?? createLipSyncDriver
  let renderer: AvatarRenderPort | null = null
  let controller: AvatarRuntimeController | null = null
  let output: AvatarAudioOutput | null = null
  let driver: LipSyncDriver | null = null
  let outputPlaying = false
  let tapAttached = false
  let disposed = false

  const emit = (event: AvatarAudioCoordinatorEvent | LipSyncDriverEvent): void => {
    try {
      input.eventSink(Object.freeze(event))
    } catch {
      // Metadata delivery cannot gate audio or animation.
    }
  }

  const project = (state: AvatarConversationState): void => {
    try {
      input.onConversationState(state)
    } catch {
      emit({ status: 'degraded', reason: 'avatar_state_projection_failed' })
    }
  }

  const stopDriver = (): void => {
    driver?.stop()
    driver = null
    controller?.setMouthOpen(0)
  }

  const startDriver = (): void => {
    if (disposed || !outputPlaying || output === null || controller === null) return
    stopDriver()
    if (!tapAttached) {
      try {
        output.attachAnalyserTap()
        tapAttached = true
      } catch {
        emit({ status: 'degraded', reason: 'avatar_analyser_attach_failed' })
        controller.setMouthOpen(0)
        return
      }
    }
    try {
      driver = driverFactory({
        analyser: output.analyser,
        mouth: { setMouthOpen: (value) => controller?.setMouthOpen(value) },
        scheduler: scheduler(),
        envelope: ENVELOPE,
        eventSink: emit,
        onMouthOpen: input.onMouthOpen,
      })
      driver.start()
    } catch {
      driver = null
      controller.setMouthOpen(0)
      emit({ status: 'degraded', reason: 'avatar_lip_sync_start_failed' })
    }
  }

  const interrupt = (): void => {
    outputPlaying = false
    stopDriver()
    controller?.interrupt()
    project('listening')
  }

  return Object.freeze({
    setRenderer: (next: AvatarRenderPort | null): void => {
      stopDriver()
      renderer = next
      controller = renderer === null ? null : createAvatarRuntimeController(renderer)
      if (outputPlaying) startDriver()
    },
    setAudioOutput: (next: AvatarAudioOutput | null): void => {
      stopDriver()
      output = next
      tapAttached = false
      if (outputPlaying) startDriver()
    },
    handleActivity: (activity: AvatarAudioActivity): void => {
      if (disposed) return
      switch (activity) {
        case 'speech_started':
          if (outputPlaying) interrupt()
          else project('listening')
          return
        case 'speech_stopped':
          project('thinking')
          return
        case 'output_started':
          outputPlaying = true
          project('speaking')
          startDriver()
          return
        case 'output_stopped':
          outputPlaying = false
          stopDriver()
          project('listening')
          return
        case 'interrupted':
          interrupt()
          return
      }
    },
    dispose: (): void => {
      if (disposed) return
      disposed = true
      outputPlaying = false
      stopDriver()
      output = null
      renderer = null
      controller = null
    },
  })
}
