import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    // Group levels above 1 (Jabra held at 100%) bring the quieter speakers up to 100%.
    expect(speakerTargetLevel(levels, 'EDIFIER M330', 1.2)).toBe(0.9)
    expect(speakerTargetLevel(levels, 'EDIFIER M330', 1.3)).toBe(1)
    expect(speakerTargetLevel(levels, 'Jabra Speak2 75', 1.3)).toBe(1)
  })

  it('falls back to every speaker at 70% when the file is missing or invalid', () => {
    for (const text of [undefined, 'not json', '{}', JSON.stringify({ normal: { A1: 0.5 } }),
      JSON.stringify({ normal: { 'Jabra Speak2 75': 1.2 } }), JSON.stringify({ normal: { 'Jabra Speak2 75': 0.7, A1: 'loud' } })]) {
      expect(parseSpeakerLevels(text)).toBe(DEFAULT_SPEAKER_LEVELS)
    }
    expect(speakerTargetLevel(DEFAULT_SPEAKER_LEVELS, 'EDIFIER M330', 0.42)).toBe(0.42)
  })

  // The rule lives in four places (Main and three single-file native helpers). This vector is the
  // reference the Swift copies implement; the parity check below fails if one copy drifts.
  it('matches the documented venue vector (owner levels 80/65/50)', () => {
    const levels = parseSpeakerLevels(JSON.stringify({ normal: { 'Jabra Speak2 75': 0.8, A1: 0.65, EDIFIER: 0.5 } }))
    const vector: Array<[name: string, jabra: number, expected: number]> = [
      ['Jabra Speak2 75', 0.8, 0.8], ['A1', 0.8, 0.65], ['EDIFIER M330 Ⅱ 1133', 0.8, 0.5], ['Unlisted', 0.8, 0.8],
      ['A1', 0.9, 0.75], ['EDIFIER M330 Ⅱ 1133', 1, 0.7], ['EDIFIER M330 Ⅱ 1133', 1.3, 1], ['A1', 1.3, 1],
      ['EDIFIER M330 Ⅱ 1133', 0.3, 0.05], ['EDIFIER M330 Ⅱ 1133', 0.04, 0.04], ['A1', 0, 0],
    ]
    for (const [name, jabra, expected] of vector) expect(speakerTargetLevel(levels, name, jabra)).toBe(expected)
  })
  it('keeps the native helpers on the same rule as Main', () => {
    const swift = (name: string) => readFileSync(join(__dirname, '../../deploy/macos', name), 'utf8')
    const block = (text: string) => text.slice(text.indexOf('struct SpeakerLevels {'), text.indexOf('let speakerLevels = SpeakerLevels()'))
      .replace(/^ {2}\/\/\/ The Jabra-equivalent level[^\n]*\n[^\n]*\n/m, '') // music-loop's extra inverse helper
    const stop = block(swift('stop-state.swift')), music = block(swift('music-loop.swift'))
    expect(stop).toContain('min(1, max(0, group + normal(name) - jabra)), floor = min(group, 0.05)')
    expect(stop).toContain('var jabra: Float32 = 0.7')
    expect(music).toBe(stop)
    const qa = swift('qa-output-volume.swift')
    for (const rule of ['return 0.7 }', 'caseInsensitiveCompare("Jabra Speak2 75")', 'sorted { $0.0.count > $1.0.count }', 'hasPrefix($0.0.lowercased())']) expect(qa).toContain(rule)
    expect(DEFAULT_SPEAKER_LEVELS.jabra).toBe(0.7)
  })
})
