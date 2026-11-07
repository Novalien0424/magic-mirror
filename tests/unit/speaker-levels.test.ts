import { describe, expect, it } from 'vitest'
import { DEFAULT_SPEAKER_LEVELS, normalSpeakerLevel, parseSpeakerLevels, speakerTargetLevel } from '../../src/main/speaker-levels'

const CALIBRATED = JSON.stringify({ measuredAt: '2026-11-07', normal: { 'Jabra Speak2 75': 0.7, A1: 0.55, EDIFIER: 0.4 } })

describe('calibrated speaker levels', () => {
  it('reads normal levels with the Jabra as reference and name-prefix matching', () => {
    const levels = parseSpeakerLevels(CALIBRATED)
    expect(levels.calibrated).toBe(true)
    expect(normalSpeakerLevel(levels, 'Jabra Speak2 75')).toBe(0.7)
    expect(normalSpeakerLevel(levels, 'A1')).toBe(0.55)
    expect(normalSpeakerLevel(levels, 'EDIFIER M330 Ⅱ 8D58')).toBe(0.4)
    expect(normalSpeakerLevel(levels, 'edifier m330 Ⅱ 1133')).toBe(0.4)
    // An unlisted speaker follows the Jabra.
    expect(normalSpeakerLevel(levels, 'New Speaker')).toBe(0.7)
  })

  it('keeps each offset from the Jabra level, clamped, and never silences a speaker while the Jabra plays', () => {
    const levels = parseSpeakerLevels(CALIBRATED)
    expect(speakerTargetLevel(levels, 'A1', 0.8)).toBe(0.65)
    expect(speakerTargetLevel(levels, 'EDIFIER M330', 0.8)).toBe(0.5)
    expect(speakerTargetLevel(levels, 'EDIFIER M330', 0.2)).toBe(0.05)
    expect(speakerTargetLevel(levels, 'EDIFIER M330', 0.03)).toBe(0.03)
    expect(speakerTargetLevel(levels, 'EDIFIER M330', 0)).toBe(0)
    const louder = parseSpeakerLevels(JSON.stringify({ normal: { 'Jabra Speak2 75': 0.7, A1: 0.9 } }))
    expect(speakerTargetLevel(louder, 'A1', 0.9)).toBe(1)
  })

  it('falls back to every speaker at 70% when the file is missing or invalid', () => {
    for (const text of [undefined, 'not json', '{}', JSON.stringify({ normal: { A1: 0.5 } }),
      JSON.stringify({ normal: { 'Jabra Speak2 75': 1.2 } }), JSON.stringify({ normal: { 'Jabra Speak2 75': 0.7, A1: 'loud' } })]) {
      expect(parseSpeakerLevels(text)).toBe(DEFAULT_SPEAKER_LEVELS)
    }
    expect(speakerTargetLevel(DEFAULT_SPEAKER_LEVELS, 'EDIFIER M330', 0.42)).toBe(0.42)
  })
})
