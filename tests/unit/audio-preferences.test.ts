import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { getAudioPreferences, initializeAudioPreferences, saveAudioPreferences } from '../../src/main/audio-preferences'
import { DEFAULT_AUDIO_PREFERENCES } from '../../src/shared/audio-devices'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mirror-audio-preferences-test-'))
  directories.push(directory)
  return join(directory, 'audio-devices.json')
}

it('persists only device preferences and restores them across initialization', () => {
  const path = fixture()
  initializeAudioPreferences(path)
  expect(getAudioPreferences().preferences).toEqual(DEFAULT_AUDIO_PREFERENCES)
  const preferences = { inputId: 'synthetic-input', inputLabel: 'Synthetic headset', outputId: 'synthetic-output' }
  saveAudioPreferences(preferences)
  initializeAudioPreferences(path)
  expect(getAudioPreferences().preferences).toEqual(preferences)
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(preferences)
  saveAudioPreferences(DEFAULT_AUDIO_PREFERENCES)
  initializeAudioPreferences(path)
  expect(getAudioPreferences().preferences).toEqual(DEFAULT_AUDIO_PREFERENCES)
})

it('makes unreadable settings visible and rejects malformed saves without overwriting the file', () => {
  const path = fixture()
  writeFileSync(path, 'invalid synthetic settings')
  initializeAudioPreferences(path)
  expect(getAudioPreferences()).toEqual({ preferences: DEFAULT_AUDIO_PREFERENCES, reason: 'audio_preferences_unreadable_using_default' })
  expect(() => saveAudioPreferences({ ...DEFAULT_AUDIO_PREFERENCES, inputId: 'missing-label' })).toThrow('audio_preferences_save_failed')
  expect(readFileSync(path, 'utf8')).toBe('invalid synthetic settings')
})
