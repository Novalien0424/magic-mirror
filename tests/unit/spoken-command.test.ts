import { describe, expect, it } from 'vitest'
import { spokenCommandKey, isSpellAttempt, opensWithSpokenPhrase } from '../../src/shared/spoken-command'
import { createSpellTriggerGuard } from '../../src/main/scenes/spell-trigger'

describe('approved whole-utterance pronunciation folds', () => {
  it.each([
    ['施放咒語點亮銀燈', '施放咒语点亮银灯'],
    ['施放咒語點亮銀燈', '是放咒語點亮營登'],
    ['施放咒語點亮銀燈', '試放咒語點亮銀燈'],
    ['有請渡鴉大人', '有請渡鴨大人'],
    ['施放咒語喚起星光', '施放咒語換起心光'],
    ['施放咒語細雨', '施放咒語細語'],
    ['停止', '庭止'],
  ])('accepts approved fold %s / %s', (expected, actual) => {
    expect(spokenCommandKey(actual)).toBe(spokenCommandKey(expected))
  })
  it.each(['施放咒語點亮銀燈吧', '施放咒語點亮星燈', '施放咒語點銀燈',
    '不要施放咒語點亮銀燈', '如果施放咒語點亮銀燈', '「施放咒語點亮銀燈」', "'施放咒語點亮銀燈'",
    '施放咒語點亮銀燈施放咒語點亮銀燈', '思放咒語點亮銀燈'])('rejects additions, quotes, missing words and held folds: %s', text => {
    expect(spokenCommandKey(text)).not.toBe(spokenCommandKey('施放咒語點亮銀燈'))
  })
  it('keeps unknown characters and phoneme boundaries, and never folds ü into u', () => {
    expect(spokenCommandKey('綠')).not.toBe(spokenCommandKey('路'))
    expect(spokenCommandKey('銀🪄燈')).not.toBe(spokenCommandKey('銀燈'))
    expect(spokenCommandKey('toString')).toBe([...('toString')].map(char => `x:${char}`).join('|'))
  })
  it('excludes sound-alike spell attempts while refusing a quoted or hypothetical prefix', () => {
    expect(isSpellAttempt('是放咒语未知内容')).toBe(true)
    expect(isSpellAttempt('「施放咒語」')).toBe(false)
    expect(isSpellAttempt('如果施放咒語')).toBe(false)
  })
  it('rejects a catalog collision before effects can run', () => {
    expect(() => createSpellTriggerGuard([
      { spellId: 'a', phrase: '施放咒語點亮銀燈' },
      { spellId: 'b', phrase: '是放咒語點亮營登' },
    ])).toThrow('normalized_spell_collision')
  })
})

describe('online search opening phrase (owner ruling 2026-10-14)', () => {
  it.each(['在雲上找找', '在雲上找找。', '在云上找找晴天', '再雲上找找，播放晴天', '在雲上找找 Moonlit Lake'])('opens with the phrase: %s', text => {
    expect(opensWithSpokenPhrase(text, '在雲上找找')).toBe(true)
  })
  it.each(['幫我在雲上找找晴天', '不要在雲上找找', '「在雲上找找」晴天', '在雲上找晴天', '雲上找找', ''])('does not open with the phrase: %s', text => {
    expect(opensWithSpokenPhrase(text, '在雲上找找')).toBe(false)
  })
  it('never matches an empty phrase', () => {
    expect(opensWithSpokenPhrase('晴天', '')).toBe(false)
  })
})
