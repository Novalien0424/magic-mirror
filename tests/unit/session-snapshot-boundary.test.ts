import { describe, expect, it } from 'vitest'
import type { ConfigSlots } from '../../src/main/config-service'
import {
  createSessionModelSnapshot,
  resolveModelSettings,
} from '../../src/main/model-settings'
import type { MirrorConfig } from '../../src/shared/types'

type Phase1ConfigFixture = MirrorConfig & {
  readonly reasoningEffort: string
  readonly turnDetectionProfile: string
}

type Phase1ConfigSlots = ConfigSlots & {
  readonly active: Phase1ConfigFixture
  readonly draft: Phase1ConfigFixture
  readonly previous: Phase1ConfigFixture
}

function fixtureConfig(
  configVersion: number,
  label: string,
  reasoningEffort: string,
  turnDetectionProfile: string,
): Phase1ConfigFixture {
  return {
    configVersion,
    persona: {
      name: `synthetic-persona-${label}`,
      instructions: `synthetic-instructions-${label}`,
    },
    voice: `synthetic-voice-${label}`,
    idleSeconds: 300,
    aiModels: {
      realtimeDialogue: { modelId: `synthetic-realtime-${label}` },
      inputTranscription: { modelId: `synthetic-transcription-${label}` },
      memoryExtractor: { modelId: `synthetic-memory-${label}` },
    },
    wake: {
      phrase: `synthetic-wake-${label}`,
      modelVersion: `synthetic-wake-model-${label}`,
      packageId: `synthetic-wake-package-${label}`,
    },
    faceModel: {
      detectorId: `synthetic-face-detector-${label}`,
      recognizerId: `synthetic-face-recognizer-${label}`,
    },
    assets: {
      offlineLoopVideo: `synthetic-offline-loop-${label}.mp4`,
      avatarDir: `synthetic-avatar-${label}`,
      musicDir: `synthetic-music-${label}`,
    },
    spells: [],
    scenes: [],
    adapters: {
      lighting: 'mock',
      fog: 'mock',
      music: 'mock',
    },
    reasoningEffort,
    turnDetectionProfile,
  }
}

function initialFixtureSlots(): Phase1ConfigSlots {
  return {
    active: fixtureConfig(7, 'active-v1', 'low', 'semantic-vad-interruptible'),
    draft: fixtureConfig(7, 'draft-v2', 'medium', 'semantic-vad-interruptible'),
    previous: fixtureConfig(6, 'previous-v0', 'low', 'semantic-vad-interruptible'),
  }
}

describe('P1-U1 Published Active session snapshot boundary', () => {
  it('captures and freezes Published Active settings while Draft and later publishes stay at their boundaries', () => {
    const initialSlots = initialFixtureSlots()
    const initialSettings = resolveModelSettings(initialSlots)
    const currentSession = createSessionModelSnapshot(
      initialSettings.active,
      '2026-08-20T01:00:00.000Z',
    )

    expect(currentSession).toMatchObject({
      configVersion: 7,
      fingerprint: initialSettings.active.fingerprint,
      sdkVersion: '0.16.1',
      realtimeDialogue: 'synthetic-realtime-active-v1',
      inputTranscription: 'synthetic-transcription-active-v1',
      memoryExtractor: 'synthetic-memory-active-v1',
      voice: 'synthetic-voice-active-v1',
      reasoningEffort: 'low',
      turnDetectionProfile: 'semantic-vad-interruptible',
      takenAt: '2026-08-20T01:00:00.000Z',
    })
    expect(Object.isFrozen(currentSession)).toBe(true)
    expect(() => Object.defineProperty(currentSession, 'reasoningEffort', { value: 'high' })).toThrow()

    const changedDraftSettings = resolveModelSettings({
      ...initialSlots,
      draft: fixtureConfig(7, 'draft-v3', 'high', 'semantic-vad-strict'),
    })
    expect(changedDraftSettings.draft.realtimeDialogue).toBe('synthetic-realtime-draft-v3')
    expect(currentSession).toMatchObject({
      configVersion: 7,
      realtimeDialogue: 'synthetic-realtime-active-v1',
      inputTranscription: 'synthetic-transcription-active-v1',
      voice: 'synthetic-voice-active-v1',
      reasoningEffort: 'low',
      turnDetectionProfile: 'semantic-vad-interruptible',
    })

    const publishedSlots: Phase1ConfigSlots = {
      active: fixtureConfig(8, 'active-v2', 'medium', 'semantic-vad-strict'),
      draft: fixtureConfig(8, 'active-v2', 'medium', 'semantic-vad-strict'),
      previous: initialSlots.active,
    }
    const publishedSettings = resolveModelSettings(publishedSlots)
    const nextSession = createSessionModelSnapshot(
      publishedSettings.active,
      '2026-08-20T01:05:00.000Z',
    )

    expect(nextSession).toMatchObject({
      configVersion: 8,
      fingerprint: publishedSettings.active.fingerprint,
      sdkVersion: '0.16.1',
      realtimeDialogue: 'synthetic-realtime-active-v2',
      inputTranscription: 'synthetic-transcription-active-v2',
      memoryExtractor: 'synthetic-memory-active-v2',
      voice: 'synthetic-voice-active-v2',
      reasoningEffort: 'medium',
      turnDetectionProfile: 'semantic-vad-strict',
      takenAt: '2026-08-20T01:05:00.000Z',
    })
    expect(Object.isFrozen(nextSession)).toBe(true)
    expect(nextSession.fingerprint).not.toBe(currentSession.fingerprint)
    expect(currentSession.configVersion).toBe(7)
    expect(currentSession.realtimeDialogue).toBe('synthetic-realtime-active-v1')
    expect(currentSession.inputTranscription).toBe('synthetic-transcription-active-v1')

    const invalidDraft = {
      ...publishedSlots.draft,
      aiModels: {
        ...publishedSlots.draft.aiModels,
        inputTranscription: { modelId: '' },
      },
    }
    expect(() => resolveModelSettings({ ...publishedSlots, draft: invalidDraft })).toThrow()

    const missingInputTranscription = {
      ...publishedSlots.active,
      aiModels: {
        realtimeDialogue: publishedSlots.active.aiModels.realtimeDialogue,
        memoryExtractor: publishedSlots.active.aiModels.memoryExtractor,
      },
    } as unknown as Phase1ConfigFixture
    expect(() => resolveModelSettings({
      ...publishedSlots,
      active: missingInputTranscription,
    })).toThrow()

    const unchangedPublishedSettings = resolveModelSettings(publishedSlots)
    expect(unchangedPublishedSettings.active.configVersion).toBe(8)
    expect(unchangedPublishedSettings.previous.configVersion).toBe(7)
    expect(unchangedPublishedSettings.active.realtimeDialogue).toBe('synthetic-realtime-active-v2')
    expect(unchangedPublishedSettings.previous.realtimeDialogue).toBe('synthetic-realtime-active-v1')
  })
})
