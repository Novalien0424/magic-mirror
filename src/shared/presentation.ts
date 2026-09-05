import type { ManagedVisualAsset } from './types'

export interface PresentationConfig {
  mode: 'always_visible' | 'emerge'
  backgroundId: string
  ambienceId: string
  ambienceGain: number
  entranceMs: number
  exitMs: number
  wakeGreeting?: string
  sleepFarewell?: string
}
export interface PresentationPayload {
  config: PresentationConfig
  background: Pick<ManagedVisualAsset, 'id' | 'kind'> | null
}
export const DEFAULT_PRESENTATION: Readonly<PresentationConfig> = Object.freeze({
  mode: 'always_visible', backgroundId: '', ambienceId: '', ambienceGain: 0.25,
  entranceMs: 1800, exitMs: 1800,
  wakeGreeting: '我在，請說。', sleepFarewell: '如你所願，再會',
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
  if (v.mode !== 'always_visible' && v.mode !== 'emerge') return null
  for (const key of ['backgroundId', 'ambienceId']) {
    if (typeof v[key] !== 'string' || !/^(?:[a-z0-9][a-z0-9._-]{0,95})?$/.test(v[key] as string)) return null
  }
  if (typeof v.ambienceGain !== 'number' || !Number.isFinite(v.ambienceGain)
    || v.ambienceGain < 0 || v.ambienceGain > 1) return null
  for (const key of ['entranceMs', 'exitMs']) {
    if (typeof v[key] !== 'number' || !Number.isSafeInteger(v[key]) || (v[key] as number) < 200 || (v[key] as number) > 10000) return null
  }
  return { mode: v.mode, backgroundId: v.backgroundId as string, ambienceId: v.ambienceId as string,
    ambienceGain: v.ambienceGain, entranceMs: v.entranceMs as number, exitMs: v.exitMs as number,
    wakeGreeting: v.wakeGreeting as string | undefined ?? DEFAULT_PRESENTATION.wakeGreeting,
    sleepFarewell: v.sleepFarewell as string | undefined ?? DEFAULT_PRESENTATION.sleepFarewell }
}
