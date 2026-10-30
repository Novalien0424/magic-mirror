/** Appliance display mode; independent of avatar settings and model tools. */
export interface LoopVideoSettings {
  videoId: string
  audioMode: 'embedded' | 'separate'
  audioId: string
  fit: 'contain' | 'cover'
  volume: number
}
export const DEFAULT_LOOP_VIDEO: LoopVideoSettings = { videoId: '', audioMode: 'embedded', audioId: '', fit: 'contain', volume: 0.7 }
export interface OperatorLoopSnapshot {
  mode: 'avatar' | 'loop' | 'desktop' | 'music' | 'dance' | 'black'
  status: 'idle' | 'preparing' | 'playing' | 'recovering' | 'failed'
  reason: string
  generation: number
  settings: LoopVideoSettings
}
export interface LoopVideoView { settings: LoopVideoSettings; snapshot: OperatorLoopSnapshot }
export type LoopVideoCommand = { action: 'get' | 'play' | 'stop' } | { action: 'save'; settings: LoopVideoSettings }
export interface OperatorLoopReport {
  generation: number
  status: 'playing' | 'progress' | 'failed' | 'released'
  videoTimeMs?: number
  audioTimeMs?: number
  frames?: number
  reason?: string
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const mediaId = (v: unknown): v is string => typeof v === 'string' && (v === '' || /^folder-[a-f0-9]{40}$/.test(v))
export function parseOperatorLoopSnapshot(value: unknown): OperatorLoopSnapshot | null {
  if (!record(value) || Object.keys(value).length !== 5 || !['avatar', 'loop', 'desktop', 'music', 'dance', 'black'].includes(value.mode as string)
    || !['idle', 'preparing', 'playing', 'recovering', 'failed'].includes(value.status as string)
    || typeof value.reason !== 'string' || !/^operator_loop_[a-z0-9_]{1,80}$/.test(value.reason)
    || !Number.isSafeInteger(value.generation) || (value.generation as number) < 0) return null
  const settings = parseLoopVideoSettings(value.settings)
  return settings ? { mode: value.mode as OperatorLoopSnapshot['mode'], status: value.status as OperatorLoopSnapshot['status'],
    reason: value.reason, generation: value.generation as number, settings } : null
}
export function parseLoopVideoSettings(value: unknown): LoopVideoSettings | null {
  if (!record(value) || Object.keys(value).length !== 5 || !mediaId(value.videoId) || !mediaId(value.audioId)
    || !['embedded', 'separate'].includes(value.audioMode as string) || !['contain', 'cover'].includes(value.fit as string)
    || typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1) return null
  return { videoId: value.videoId, audioMode: value.audioMode as LoopVideoSettings['audioMode'],
    audioId: value.audioMode === 'embedded' ? '' : value.audioId, fit: value.fit as LoopVideoSettings['fit'], volume: value.volume }
}
export function parseLoopVideoCommand(value: unknown): LoopVideoCommand | null {
  if (!record(value)) return null
  if (Object.keys(value).length === 1 && ['get', 'play', 'stop'].includes(value.action as string)) return value as LoopVideoCommand
  const settings = parseLoopVideoSettings(value.settings)
  return value.action === 'save' && Object.keys(value).length === 2 && settings ? { action: 'save', settings } : null
}
export function parseOperatorLoopReport(value: unknown): OperatorLoopReport | null {
  if (!record(value) || Object.keys(value).some(key => !['generation', 'status', 'videoTimeMs', 'audioTimeMs', 'frames', 'reason'].includes(key))
    || !Number.isSafeInteger(value.generation) || (value.generation as number) < 0
    || !['playing', 'progress', 'failed', 'released'].includes(value.status as string)
    || ['videoTimeMs', 'audioTimeMs', 'frames'].some(key => value[key] !== undefined
      && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || (value[key] as number) < 0))
    || value.reason !== undefined && (typeof value.reason !== 'string' || !/^operator_loop_[a-z0-9_]{1,80}$/.test(value.reason))) return null
  return value as unknown as OperatorLoopReport
}
