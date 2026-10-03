import { OpenAIRealtimeWebRTC } from '@openai/agents/realtime'
import { ScriptedRealtimeTransport } from '@openai/agents/realtime/testing'
import type { RealtimeTransportLayer } from '@openai/agents/realtime'

export interface RealtimeMediaBoundary {
  readonly mediaStream: MediaStream
  readonly audioElement: HTMLAudioElement
}

export function createWebRtcRealtimeTransport(
  boundary: RealtimeMediaBoundary,
): OpenAIRealtimeWebRTC {
  return new OpenAIRealtimeWebRTC({
    mediaStream: boundary.mediaStream,
    audioElement: boundary.audioElement,
  })
}

export function createDeterministicRealtimeTransport(): ScriptedRealtimeTransport {
  return new ScriptedRealtimeTransport()
}

export const DETERMINISTIC_REALTIME_TRANSPORT_METADATA = Object.freeze({
  deterministic: true,
  live: false,
} as const)

export type RealtimeTransportFactory = (
  boundary: RealtimeMediaBoundary,
) => RealtimeTransportLayer
