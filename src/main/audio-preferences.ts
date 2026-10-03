import { existsSync, readFileSync } from 'node:fs'
const writeFileAtomic = require('write-file-atomic') as { sync(path: string, value: string): void }
import { DEFAULT_AUDIO_PREFERENCES, parseAudioPreferences, type AudioPreferences } from '../shared/audio-devices'

let filePath: string | undefined
let preferences = DEFAULT_AUDIO_PREFERENCES
let reason = 'audio_devices_ready'

export function initializeAudioPreferences(path: string): void {
  filePath = path
  preferences = DEFAULT_AUDIO_PREFERENCES
  reason = 'audio_devices_ready'
  try {
    if (!existsSync(path)) return
    const parsed = parseAudioPreferences(JSON.parse(readFileSync(path, 'utf8')))
    if (!parsed) throw new Error('invalid')
    preferences = parsed
  } catch {
    reason = 'audio_preferences_unreadable_using_default'
  }
}

export function getAudioPreferences(): { preferences: AudioPreferences; reason: string } {
  return { preferences, reason }
}

export function saveAudioPreferences(value: AudioPreferences): void {
  const parsed = parseAudioPreferences(value)
  if (!parsed || !filePath) throw new Error('audio_preferences_save_failed')
  writeFileAtomic.sync(filePath, JSON.stringify(parsed))
  preferences = parsed
  reason = 'audio_devices_ready'
}
