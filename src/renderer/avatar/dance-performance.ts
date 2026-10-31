import type { DanceFrame } from '../../shared/dance-floor'
export interface DancePose { parameters: Record<string, number>; beatIndex: number | null; impactTimeMs: number | null; positionMs: number; synchronized: boolean }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Pure player-clock choreography. Extremum is exactly at the beat timestamp.
 * No accumulation, free-running oscillator, microphone or calm-profile low-pass. */
export function dancePose(frame: DanceFrame, now = Date.now()): DancePose {
  const age = Math.max(0, now - frame.sentAt)
  const live = frame.status === 'playing' && frame.rate > 0 && age < 450
  const positionMs = frame.positionMs + (live ? age * frame.rate : 0) + frame.settings.offsetMs
  let selected = frame.beats.reduce<typeof frame.beats[number] | undefined>((best, beat) =>
    !best || Math.abs(beat.timeMs - positionMs) < Math.abs(best.timeMs - positionMs) ? beat : best, undefined)
  if (selected && (selected.confidence < 0.35 || Math.abs(selected.timeMs - positionMs) > selected.periodMs * 0.6)) selected = undefined
  const amplitude = live ? frame.settings.intensity * Math.sqrt(frame.energy) : 0
  const synchronized = !!selected && live
  const phrase = selected ? Math.floor(selected.index / 16) % 3 : 0
  const direction = selected && Math.floor(selected.index / 2) % 2 ? -1 : 1
  const phase = selected ? (positionMs - selected.timeMs) / selected.periodMs : 0
  const hit = synchronized ? Math.exp(-((phase / 0.16) ** 2)) : 0
  const anticipation = synchronized ? Math.exp(-(((phase + 0.35) / 0.14) ** 2)) : 0
  const accent = selected && selected.index % 4 === 0 ? 1 : 0.78
  const power = amplitude * accent
  // Groove between hits: one side-to-side lean per two-beat group, matching the hit
  // direction, peaking between its two nods and crossing centre as the group changes side.
  // A function of the beat clock only, so it cannot drift; AngleY nod timing is untouched.
  const sway = synchronized ? Math.cos(Math.PI * (selected!.index + phase - 0.5) / 2) * amplitude : 0
  // Ranges are below Core extrema; combined-pose audition owns final limits.
  // The head/torso counter-rotate; loudness scales an already timed gesture.
  const parameters: Record<string, number> = {
    ParamAngleX: direction * power * (phrase === 1 ? 21 : 10) * hit + 3 * sway,
    ParamAngleY: power * (8 * anticipation - 24 * hit),
    ParamAngleZ: direction * power * (phrase === 2 ? 20 : 9) * hit + 5 * sway,
    ParamBodyAngleX: -direction * power * (phrase === 1 ? 8 : 4) * hit - 2 * sway,
    ParamBodyAngleY: power * (6.5 * hit - 2 * anticipation),
    ParamBodyAngleZ: -direction * power * (phrase === 2 ? 7 : 3) * hit - 3 * sway,
    ParamBreath: clamp(0.2 + amplitude * 0.5 * hit, 0, 1),
    ParamEyeBallX: direction * 0.25 * hit, ParamEyeBallY: -0.15 * hit,
    ParamEyeLOpen: live ? 1 - 0.25 * hit * power : 1, ParamEyeROpen: 1,
  }
  return { parameters, beatIndex: synchronized ? selected!.index : null, impactTimeMs: synchronized ? selected!.timeMs : null, positionMs, synchronized }
}
