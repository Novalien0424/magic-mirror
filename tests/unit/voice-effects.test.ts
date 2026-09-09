import { describe, expect, it } from 'vitest'
import { avatarCatalogSchema } from '../../src/main/avatar/avatar-config'
import {
  DEFAULT_VOICE_EFFECTS,
  VOICE_EFFECT_PRESETS,
  parseVoiceEffects,
} from '../../src/shared/voice-effects'
import { createRealtimeSessionStartBundleIssuer } from '../../src/main/realtime/session-start-bundle'
import { createSessionModelSnapshot, type ActiveModelSettings } from '../../src/main/model-settings'
import { createRealtimeIpcContract } from '../../src/main/ipc'
import type { SessionModelSnapshot } from '../../src/shared/types'

const profile = {
  id: 'guide', name: 'Guide', personality: 'A patient guide.', speakingStyle: 'Calm',
  voice: 'cedar', idleSeconds: 300, modelId: 'builtin-ren',
  presentation: { mode: 'always_visible' as const, backgroundId: '', ambienceId: '', ambienceGain: 0.25, entranceMs: 1800, exitMs: 1800 },
  scenes: [], spells: [],
}

function snapshot(): SessionModelSnapshot {
  return {
    configVersion: 1, fingerprint: 'fingerprint', sdkVersion: '0.16.1',
    realtimeDialogue: 'realtime', inputTranscription: 'transcription', memoryExtractor: 'memory',
    voice: 'cedar', reasoningEffort: 'low', turnDetectionProfile: 'semantic-vad-interruptible',
    voiceSpeed: 0.9, voiceEffects: { ...VOICE_EFFECT_PRESETS.darkOracle }, takenAt: '2026-09-09T00:00:00.000Z',
  }
}

describe('voice effects settings contract', () => {
  it('defaults absent profile fields through the Main avatar schema', () => {
    const parsed = avatarCatalogSchema.parse({ activeAvatarId: 'guide', avatars: [profile], locks: [], models: [] })
    expect(parsed.avatars[0]).toMatchObject({ voiceSpeed: 1, voiceEffects: DEFAULT_VOICE_EFFECTS })
  })

  it('rejects present invalid effect values while accepting undefined', () => {
    expect(parseVoiceEffects(undefined)).toEqual(DEFAULT_VOICE_EFFECTS)
    expect(parseVoiceEffects(null)).toBeNull()
    expect(parseVoiceEffects({ ...DEFAULT_VOICE_EFFECTS, roomSize: 'long' })).toBeNull()
    expect(parseVoiceEffects({ ...DEFAULT_VOICE_EFFECTS, grit: 0.31 })).toBeNull()
    expect(parseVoiceEffects({ ...DEFAULT_VOICE_EFFECTS, extra: true })).toBeNull()
    expect(() => avatarCatalogSchema.parse({
      activeAvatarId: 'guide', avatars: [{ ...profile, voiceSpeed: 1.6 }], locks: [], models: [],
    })).toThrow()
  })

  it('deeply clones and freezes voice settings at the session start boundary', async () => {
    const original = snapshot()
    const issuer = createRealtimeSessionStartBundleIssuer({
      getPublishedSessionModelSnapshot: () => original,
      getRealtimeSessionIdentity: () => ({ realtimeSessionId: 'session', sessionGeneration: 1 }),
      broker: { issue: async () => ({ value: 'ek_synthetic' }) },
    })

    const bundle = await issuer.issue()
    ;(original.voiceEffects as { pitchSemitones: number }).pitchSemitones = 99
    expect(bundle.snapshot.voiceEffects!.pitchSemitones).toBe(-3)
    expect(Object.isFrozen(bundle.snapshot)).toBe(true)
    expect(Object.isFrozen(bundle.snapshot.voiceEffects)).toBe(true)
    expect(Object.isFrozen(bundle.snapshot.voiceEffects!)).toBe(true)
  })

  it('copies optional voice settings into a deeply frozen model snapshot', () => {
    const active: ActiveModelSettings = {
      slot: 'active', configVersion: 1, fingerprint: 'fingerprint',
      realtimeDialogue: 'realtime', inputTranscription: 'transcription', memoryExtractor: 'memory',
      voice: 'cedar', voiceSpeed: 0.9, voiceEffects: { ...VOICE_EFFECT_PRESETS.darkOracle },
      reasoningEffort: 'low', turnDetectionProfile: 'semantic-vad-interruptible',
    }
    const result = createSessionModelSnapshot(active, '2026-09-09T00:00:00.000Z')
    expect(result.voiceSpeed).toBe(0.9)
    expect(result.voiceEffects).toEqual(VOICE_EFFECT_PRESETS.darkOracle)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.voiceEffects)).toBe(true)
    ;(active.voiceEffects as { pitchSemitones: number }).pitchSemitones = 100
    expect(result.voiceEffects!.pitchSemitones).toBe(-3)
  })

  it('accepts optional snapshot fields at the existing Main IPC boundary', async () => {
    const contract = createRealtimeIpcContract({
      issueRealtimeSessionStartBundle: async () => ({
        snapshot: snapshot(),
        identity: { realtimeSessionId: 'session', sessionGeneration: 1 },
        clientSecret: { value: 'ek_synthetic' },
      }),
    })
    const accepted = await contract.handleTransientSecretRequest({ sender: { identity: 'mirror' } })
    expect(accepted.status).toBe('accepted')
  })
})
