import type { AvatarProfile } from './avatar-profiles'
import { DEFAULT_VOICE_EFFECTS, type VoiceEffects } from './voice-effects'

export interface VoiceProfile {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly voice: string
  readonly voiceSpeed: number
  readonly speakingStyle: string
  readonly voiceEffects: Readonly<VoiceEffects>
}

// Reference-inspired starting points, not speaker clones. Settings use the
// existing processed speech path; no reference recording ships with the app.
export const VOICE_PROFILES: readonly VoiceProfile[] = Object.freeze([
  Object.freeze({
    id: 'talos-priestess', name: 'Priestess',
    description: 'Talos reference, before 0:40: warm feminine delivery, measured pace and a light room, without distinct echo repeats. Audition and fine-tune against the reference.',
    voice: 'marin', voiceSpeed: 0.9,
    speakingStyle: 'Speak in a warm, low feminine register with composed, ceremonial delivery. Use measured phrasing, smooth connected vowels, gentle falling intonation and clear consonants. Keep the voice natural and intimate, with restrained breathiness and subtle emotion. Avoid a bright chirpy tone, exaggerated pitch changes, whispering or singing.',
    voiceEffects: Object.freeze({ ...DEFAULT_VOICE_EFFECTS, enabled: true, pitchSemitones: -0.8,
      formantSemitones: -0.3, warmthDb: 0.8, brightnessDb: 0.2, roomMix: 0.12, roomSize: 'medium' as const }),
  }),
  Object.freeze({
    id: 'talos-god', name: 'God',
    description: 'Talos reference, after 0:42: deep masculine delivery, deliberate pacing, a 1.2-second hall and three fading echoes 230 ms apart. Audition and fine-tune against the reference.',
    voice: 'cedar', voiceSpeed: 0.85,
    speakingStyle: 'Speak in a deep, resonant masculine bass register with calm authority and solemn, deliberate phrasing. Sustain rounded vowels and use controlled chest resonance, clear consonants and firm downward phrase endings. Leave natural pauses between clauses. Keep emotion restrained and speech intelligible; do not shout, growl, whisper or sing.',
    voiceEffects: Object.freeze({ ...DEFAULT_VOICE_EFFECTS, enabled: true, pitchSemitones: -3,
      formantSemitones: -1.5, warmthDb: 1.8, brightnessDb: 0.4, grit: 0.02,
      roomMix: 0.16, roomSize: 'hall' as const, echoMix: 0.22, echoDelayMs: 230, echoRepeats: 3, outputTrimDb: -5.5 }),
  }),
])

export function applyVoiceProfile(avatar: AvatarProfile, profile: VoiceProfile): AvatarProfile {
  return { ...avatar, voice: profile.voice, voiceSpeed: profile.voiceSpeed,
    speakingStyle: profile.speakingStyle, voiceEffects: { ...profile.voiceEffects } }
}

export function matchingVoiceProfile(avatar: AvatarProfile): VoiceProfile | undefined {
  const effects = avatar.voiceEffects ?? DEFAULT_VOICE_EFFECTS
  return VOICE_PROFILES.find(profile => profile.voice === avatar.voice
    && profile.voiceSpeed === (avatar.voiceSpeed ?? 1) && profile.speakingStyle === avatar.speakingStyle
    && (Object.keys(DEFAULT_VOICE_EFFECTS) as (keyof VoiceEffects)[]).every(key => effects[key] === profile.voiceEffects[key]))
}
