import { describe, expect, it, vi } from 'vitest'

import type {
  ClientSecretIssueResult,
  ClientSecretIssueRequest,
} from '../../src/main/realtime/client-secret-broker'
import {
  createRealtimeSessionStartBundleIssuer,
} from '../../src/main/realtime/session-start-bundle'
import type { SessionModelSnapshot } from '../../src/shared/types'

const CONFIGURED_REALTIME_MODEL = 'configured-realtime-model-v7'
const SHORT_CLIENT_SECRET = 'ek_synthetic-session-start-secret'

function mutableSnapshot(
  configVersion: number,
  realtimeDialogue: string,
): SessionModelSnapshot {
  return {
    configVersion,
    fingerprint: `synthetic-fingerprint-${configVersion}`,
    sdkVersion: '0.16.1',
    realtimeDialogue,
    inputTranscription: `synthetic-transcription-${configVersion}`,
    memoryExtractor: `synthetic-memory-${configVersion}`,
    voice: `synthetic-voice-${configVersion}`,
    reasoningEffort: 'low',
    turnDetectionProfile: 'semantic-vad-interruptible',
    takenAt: `2026-08-22T01:0${configVersion}:00.000Z`,
  }
}

describe('P1-U7C1 atomic Realtime session-start bundle issuer', () => {
  it('copies caller and broker results across the deferred credential boundary', async () => {
    const callerSnapshot = mutableSnapshot(7, CONFIGURED_REALTIME_MODEL)
    const callerIdentity = {
      realtimeSessionId: 'synthetic-realtime-session-v7',
      sessionGeneration: 7,
    }

    let currentSnapshot = callerSnapshot
    let currentIdentity = callerIdentity
    let releaseBroker!: (result: ClientSecretIssueResult) => void
    const brokerResult = new Promise<ClientSecretIssueResult>((resolve) => {
      releaseBroker = resolve
    })
    const callOrder: string[] = []
    let brokerRequest: ClientSecretIssueRequest | undefined
    const issue = vi.fn((request: ClientSecretIssueRequest) => {
      callOrder.push('broker')
      brokerRequest = request
      return brokerResult
    })

    const issuer = createRealtimeSessionStartBundleIssuer({
      getPublishedSessionModelSnapshot: () => {
        callOrder.push('snapshot')
        return currentSnapshot
      },
      getRealtimeSessionIdentity: () => {
        callOrder.push('identity')
        return currentIdentity
      },
      broker: { issue },
    })

    const bundlePromise = issuer.issue()

    expect(callOrder).toEqual(['snapshot', 'identity', 'broker'])
    expect(brokerRequest).toEqual({ modelId: CONFIGURED_REALTIME_MODEL })

    callerSnapshot.configVersion = 99
    callerSnapshot.realtimeDialogue = 'mutated-realtime-model-v99'
    callerIdentity.realtimeSessionId = 'mutated-realtime-session-v99'
    callerIdentity.sessionGeneration = 99
    currentSnapshot = mutableSnapshot(8, 'published-realtime-model-v8')
    currentIdentity = {
      realtimeSessionId: 'synthetic-realtime-session-v8',
      sessionGeneration: 8,
    }
    const returnedClientSecret = {
      value: SHORT_CLIENT_SECRET,
      expiresAt: 1_700_000_600,
    }
    releaseBroker(returnedClientSecret)

    const bundle = await bundlePromise

    returnedClientSecret.value = 'ek_mutated-after-return'
    returnedClientSecret.expiresAt = 1_700_000_700

    expect(bundle.snapshot).toEqual({
      configVersion: 7,
      fingerprint: 'synthetic-fingerprint-7',
      sdkVersion: '0.16.1',
      realtimeDialogue: CONFIGURED_REALTIME_MODEL,
      inputTranscription: 'synthetic-transcription-7',
      memoryExtractor: 'synthetic-memory-7',
      voice: 'synthetic-voice-7',
      reasoningEffort: 'low',
      turnDetectionProfile: 'semantic-vad-interruptible',
      takenAt: '2026-08-22T01:07:00.000Z',
    })
    expect(bundle.identity).toEqual({
      realtimeSessionId: 'synthetic-realtime-session-v7',
      sessionGeneration: 7,
    })
    expect(bundle.clientSecret).toEqual({
      value: SHORT_CLIENT_SECRET,
      expiresAt: 1_700_000_600,
    })
    expect(bundle.snapshot).not.toBe(callerSnapshot)
    expect(bundle.identity).not.toBe(callerIdentity)
    expect(bundle.clientSecret).not.toBe(returnedClientSecret)
    expect(bundle).toEqual({
      snapshot: {
        configVersion: 7,
        fingerprint: 'synthetic-fingerprint-7',
        sdkVersion: '0.16.1',
        realtimeDialogue: CONFIGURED_REALTIME_MODEL,
        inputTranscription: 'synthetic-transcription-7',
        memoryExtractor: 'synthetic-memory-7',
        voice: 'synthetic-voice-7',
        reasoningEffort: 'low',
        turnDetectionProfile: 'semantic-vad-interruptible',
        takenAt: '2026-08-22T01:07:00.000Z',
      },
      identity: {
        realtimeSessionId: 'synthetic-realtime-session-v7',
        sessionGeneration: 7,
      },
      clientSecret: {
        value: SHORT_CLIENT_SECRET,
        expiresAt: 1_700_000_600,
      },
    })
    expect(Object.isFrozen(bundle)).toBe(true)
    expect(Object.isFrozen(bundle.snapshot)).toBe(true)
    expect(Object.isFrozen(bundle.identity)).toBe(true)
    expect(Object.isFrozen(bundle.clientSecret)).toBe(true)
    expect(Object.keys(bundle).sort()).toEqual(['clientSecret', 'identity', 'snapshot'])
    expect(issue).toHaveBeenCalledTimes(1)
  })
})
