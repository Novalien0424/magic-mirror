export interface DanceSettings {
  track: string
  intensity: number
  volume: number
  offsetMs: number
  welcome: boolean
  language: 'zh-TW' | 'en'
}
export const DEFAULT_DANCE: DanceSettings = { track: '', intensity: 1, volume: 1, offsetMs: 0, welcome: true, language: 'zh-TW' }
export interface DanceBeat { timeMs: number; periodMs: number; strength: number; confidence: number; index: number }
export interface DanceAnalysis { version: 1; durationMs: number; beats: DanceBeat[]; energy: number[]; energyStepMs: number }
export interface DanceFrame {
  generation: number; trackId: number; positionMs: number; sentAt: number; rate: number
  beats: DanceBeat[]; energy: number; settings: DanceSettings
  status: 'idle' | 'preparing' | 'welcome' | 'playing' | 'failed'
  reason: string
}
export interface DanceView {
  settings: DanceSettings
  tracks: { id: string; name: string; bytes: number }[]
  frame: DanceFrame
  outputs: { count: number; controlled: number; verified: boolean }
}
export type DanceCommand = { action: 'get' | 'start' | 'stop' | 'refresh' } | { action: 'save'; settings: DanceSettings }
export interface DanceWelcomeBundle {
  generation: number
  snapshot: Readonly<import('./types').SessionModelSnapshot>
  clientSecret: string
  avatar: { name: string; personality: string; speakingStyle: string }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown, low: number, high: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high
export function parseDanceSettings(v: unknown): DanceSettings | null {
  return record(v) && Object.keys(v).length === 6 && typeof v.track === 'string' && (v.track === '' || /^[a-f0-9]{40}$/.test(v.track))
    && finite(v.intensity, 0, 1) && finite(v.volume, 0, 1) && finite(v.offsetMs, -500, 500)
    && typeof v.welcome === 'boolean' && ['zh-TW', 'en'].includes(v.language as string) ? v as unknown as DanceSettings : null
}
export function parseDanceCommand(v: unknown): DanceCommand | null {
  if (!record(v)) return null
  if (Object.keys(v).length === 1 && ['get', 'start', 'stop', 'refresh'].includes(v.action as string)) return v as unknown as DanceCommand
  const settings = parseDanceSettings(v.settings)
  return v.action === 'save' && Object.keys(v).length === 2 && settings ? { action: 'save', settings } : null
}
export function parseDanceFrame(v: unknown): DanceFrame | null {
  if (!record(v) || Object.keys(v).length !== 10 || !Number.isSafeInteger(v.generation) || (v.generation as number) < 0
    || !Number.isSafeInteger(v.trackId) || (v.trackId as number) < 0 || !finite(v.positionMs, 0, 86_400_000)
    || !finite(v.sentAt, 0, 9e15) || !finite(v.rate, 0, 1) || !finite(v.energy, 0, 1)
    || !['idle', 'preparing', 'welcome', 'playing', 'failed'].includes(v.status as string)
    || typeof v.reason !== 'string' || !/^dance_[a-z_]+$/.test(v.reason) || !parseDanceSettings(v.settings)
    || !Array.isArray(v.beats) || v.beats.length > 32 || !v.beats.every(b => record(b) && Object.keys(b).length === 5
      && finite(b.timeMs, 0, 86_400_000) && finite(b.periodMs, 200, 1500) && finite(b.strength, 0, 1)
      && finite(b.confidence, 0, 1) && Number.isSafeInteger(b.index) && (b.index as number) >= 0)) return null
  return v as unknown as DanceFrame
}
