/**
 * Calibrated normal speaker levels (owner 2026-11-07), machine-local
 * `ops/music-device/speaker-levels.json`: `{"normal": {"Jabra Speak2 75": 0.7, "A1": 0.55, "EDIFIER": 0.4}}`.
 * The Jabra is the reference. A speaker whose name starts with another key (case-insensitive,
 * longest key first) keeps that key's offset from the Jabra; unlisted speakers follow the Jabra.
 * A missing or invalid file means every speaker 70% (uncalibrated). Same rule in the native
 * helpers stop-state.swift, music-loop.swift and qa-output-volume.swift.
 */
export const JABRA_OUTPUT = 'Jabra Speak2 75'
export const SPEAKER_LEVEL_FLOOR = 0.05

export interface SpeakerLevels { jabra: number; others: Array<[prefix: string, level: number]>; calibrated: boolean }

export const DEFAULT_SPEAKER_LEVELS: SpeakerLevels = Object.freeze({ jabra: 0.7, others: [], calibrated: false })

export function parseSpeakerLevels(text: string | undefined): SpeakerLevels {
  if (text === undefined) return DEFAULT_SPEAKER_LEVELS
  let root: unknown
  try { root = JSON.parse(text) } catch { return DEFAULT_SPEAKER_LEVELS }
  const normal = (root as { normal?: unknown } | null)?.normal
  if (!normal || typeof normal !== 'object' || Array.isArray(normal)) return DEFAULT_SPEAKER_LEVELS
  let jabra: number | undefined
  const others: Array<[string, number]> = []
  for (const [key, value] of Object.entries(normal)) {
    if (!key || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return DEFAULT_SPEAKER_LEVELS
    if (key.toLowerCase() === JABRA_OUTPUT.toLowerCase()) jabra = value
    else others.push([key, value])
  }
  if (jabra === undefined) return DEFAULT_SPEAKER_LEVELS
  return { jabra, others: others.sort((a, b) => b[0].length - a[0].length), calibrated: true }
}

export function normalSpeakerLevel(levels: SpeakerLevels, name: string): number {
  if (name.toLowerCase().includes(JABRA_OUTPUT.toLowerCase())) return levels.jabra
  return levels.others.find(([prefix]) => name.toLowerCase().startsWith(prefix.toLowerCase()))?.[1] ?? levels.jabra
}

/** A speaker's level for a Jabra level: its normal offset, clamped; a quieter speaker never goes
 * silent while the Jabra plays (5% floor). */
export function speakerTargetLevel(levels: SpeakerLevels, name: string, jabraLevel: number): number {
  const value = Math.min(1, Math.max(0, jabraLevel + normalSpeakerLevel(levels, name) - levels.jabra))
  const floor = Math.min(jabraLevel, SPEAKER_LEVEL_FLOOR)
  return Math.round((jabraLevel > 0 && value < floor ? floor : value) * 1000) / 1000
}
