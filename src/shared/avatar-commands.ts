import { REALTIME_PROMPTS } from './realtime-prompts'
export const DEFAULT_WAKE_PHRASE = REALTIME_PROMPTS.commandDefaults.wakePhrase
export const LEGACY_SLEEP_PHRASE = REALTIME_PROMPTS.commandDefaults.legacySleepPhrase
export const DEFAULT_SLEEP_PHRASE = REALTIME_PROMPTS.commandDefaults.sleepPhrase
/** Hidden phrase that must open a request before online media search (2026-10-14). */
export const DEFAULT_CLOUD_SEARCH_PHRASE = REALTIME_PROMPTS.commandDefaults.cloudSearchPhrase

export function validSpokenPhrase(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 96
    && !/[\u0000-\u001f\u007f]/u.test(value)
}
