import { REALTIME_PROMPTS } from './realtime-prompts'
import type { ManagedVisualAsset } from './types'

export interface PresentationConfig {
  mode: 'always_visible' | 'emerge' | 'reflective'
  backgroundId: string
  ambienceId: string
  ambienceGain: number
  activeAmbienceGain?: number
  entranceMs: number
  exitMs: number
  entranceVideoId?: string
  exitVideoId?: string
  entranceBlend?: 'screen' | 'normal'
  exitBlend?: 'screen' | 'normal'
  blackHoldMs?: number
  revealStartMs?: number
  wakeGreeting?: string
  sleepFarewell?: string
}
export interface PresentationPayload {
  model?: import('./avatar-profiles').AvatarModelReference
  config: PresentationConfig
  background: Pick<ManagedVisualAsset, 'id' | 'kind'> | null
  entranceVideo?: { id: string; kind: 'video' } | null
  exitVideo?: { id: string; kind: 'video' } | null
}
export const DEFAULT_PRESENTATION: Readonly<PresentationConfig> = Object.freeze({
  mode: 'always_visible', backgroundId: '', ambienceId: '', ambienceGain: 0.25, activeAmbienceGain: 0,
  entranceMs: 1800, exitMs: 1800,
  entranceVideoId: '', exitVideoId: '', entranceBlend: 'screen', exitBlend: 'screen',
  blackHoldMs: 400, revealStartMs: 1500,
  wakeGreeting: REALTIME_PROMPTS.defaults.wakeGreeting, sleepFarewell: REALTIME_PROMPTS.defaults.sleepFarewell,
})

export function parsePresentation(value: unknown): PresentationConfig | null {
  if (value === undefined) return { ...DEFAULT_PRESENTATION }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(k => !Object.hasOwn(DEFAULT_PRESENTATION, k))) return null
  for (const key of ['wakeGreeting', 'sleepFarewell']) {
    if (v[key] !== undefined && (typeof v[key] !== 'string' || (v[key] as string).length > 500
      || key === 'sleepFarewell' && !(v[key] as string).trim())) return null
  }
  if (v.mode !== 'always_visible' && v.mode !== 'emerge' && v.mode !== 'reflective') return null
  for (const key of ['backgroundId', 'ambienceId']) {
    if (typeof v[key] !== 'string' || !/^(?:[a-z0-9][a-z0-9._-]{0,95})?$/.test(v[key] as string)) return null
  }
  if (typeof v.ambienceGain !== 'number' || !Number.isFinite(v.ambienceGain)
    || v.ambienceGain < 0 || v.ambienceGain > 1) return null
  const activeAmbienceGain = v.activeAmbienceGain === undefined ? 0 : v.activeAmbienceGain
  if (typeof activeAmbienceGain !== 'number' || !Number.isFinite(activeAmbienceGain)
    || activeAmbienceGain < 0 || activeAmbienceGain > 1) return null
  for (const key of ['entranceMs', 'exitMs']) {
    if (typeof v[key] !== 'number' || !Number.isSafeInteger(v[key]) || (v[key] as number) < 200 || (v[key] as number) > 10000) return null
  }
  const entranceVideoId = v.entranceVideoId === undefined ? '' : v.entranceVideoId
  const exitVideoId = v.exitVideoId === undefined ? '' : v.exitVideoId
  for (const id of [entranceVideoId, exitVideoId]) {
    if (typeof id !== 'string' || !/^(?:[a-z0-9][a-z0-9._-]{0,95})?$/.test(id)) return null
  }
  const entranceBlend = v.entranceBlend === undefined ? 'screen' : v.entranceBlend
  const exitBlend = v.exitBlend === undefined ? 'screen' : v.exitBlend
  if ((entranceBlend !== 'screen' && entranceBlend !== 'normal') || (exitBlend !== 'screen' && exitBlend !== 'normal')) return null
  const blackHoldMs = v.blackHoldMs === undefined ? 400 : v.blackHoldMs
  const revealStartMs = v.revealStartMs === undefined ? 1500 : v.revealStartMs
  for (const offset of [blackHoldMs, revealStartMs]) {
    if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) return null
  }
  if (v.mode === 'reflective' && ((blackHoldMs as number) > (revealStartMs as number) || (revealStartMs as number) >= (v.entranceMs as number))) return null
  return { mode: v.mode, backgroundId: v.backgroundId as string, ambienceId: v.ambienceId as string,
    ambienceGain: v.ambienceGain, activeAmbienceGain, entranceMs: v.entranceMs as number, exitMs: v.exitMs as number,
    entranceVideoId: entranceVideoId as string, exitVideoId: exitVideoId as string, entranceBlend, exitBlend,
    blackHoldMs: blackHoldMs as number, revealStartMs: revealStartMs as number,
    wakeGreeting: v.wakeGreeting as string | undefined ?? DEFAULT_PRESENTATION.wakeGreeting,
    sleepFarewell: v.sleepFarewell as string | undefined ?? DEFAULT_PRESENTATION.sleepFarewell }
}
