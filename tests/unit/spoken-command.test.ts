import { describe, expect, it } from 'vitest'
import { spokenCommandKey, isSpellAttempt, matchPlayRequest, matchSearchPhrase, opensWithSpokenPhrase } from '../../src/shared/spoken-command'
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

describe('online search phrase, not strict (owner rulings 2026-10-14, 2026-11-07)', () => {
  it.each([
    ['幫我在雲上找 周杰倫青花瓷撥放', 'request'], ['幫我在雲上找周深的組曲撥放', 'request'], ['在雲上找找晴天', 'request'],
    ['再雲上找找，播放晴天', 'request'], ['在云上找找 Moonlit Lake', 'request'], ['在雲上找晴天', 'request'], ['請幫我雲上找晴天', 'request'],
    ['可不可以幫我在雲上找晴天', 'request'], ['有沒有辦法在雲上找晴天', 'request'], ['Raven 幫我在雲上找晴天', 'request'],
    ['在雲上找找', 'alone'], ['在雲上找找。', 'alone'], ['幫我在雲上找一下', 'alone'], ['雲上找找', 'alone'],
    // Any natural "look it up online" wording (owner 2026-11-07).
    ['幫我再網路上找周杰倫青花瓷', 'request'], ['幫我上網找青花瓷', 'request'], ['幫我在網上搜尋周深', 'request'],
    ['在YouTube上找青花瓷', 'request'], ['請幫我搜尋網路上的晴天', 'request'],
    ['幫我在線上查一下', 'alone'], ['幫我用網路查一下', 'alone'],
    ['在 YouTube 上找青花瓷', 'request'], ['幫我上網查查青花瓷', 'request'], ['Raven 可以幫我在網路上找晴天', 'request'], ['播放YouTube上的晴天', 'request'],
  ])('unlocks: %s', (text, kind) => {
    expect(matchSearchPhrase(text, '在雲上找找')).toBe(kind)
  })
  it.each(['不要在雲上找找', '別在雲上找晴天', '沒在雲上找晴天', '「在雲上找找」晴天', '我朋友昨天跟我說可以在雲上找歌', '晴天', '',
    '不要上網找', '別在網路上找晴天', '「在網路上找」是什麼', '播放晴天', '幫我找晴天',
    // 油管 sounds like 有關, so it is not an online place (independent audit 2026-11-07).
    '播放有關下雨的音樂', '幫我找有關海的影片'])('does not unlock: %s', text => {
    expect(matchSearchPhrase(text, '在雲上找找')).toBeUndefined()
  })
  it('never matches an empty phrase, and the strict opening check stays for spells', () => {
    expect(matchSearchPhrase('晴天', '')).toBeUndefined()
    expect(opensWithSpokenPhrase('幫我施放咒語', '施放咒語')).toBe(false)
  })
})

describe('play requests for the online-song fallback', () => {
  it('accepts real requests to play or hear the result', () => {
    for (const text of ['幫我在雲上找 周杰倫青花瓷撥放', '幫我在雲上找周深的組曲撥放', '在YouTube上找告白氣球放給我聽', '我想聽周杰倫的晴天',
      '上網找一首歌播一下', '幫我放鄧紫棋', '幫我在網路上找周深唱一首', 'search youtube and play it']) expect(matchPlayRequest(text), text).toBe(true)
  })
  it('never treats information questions, single characters or negated requests as play requests', () => {
    for (const text of ['幫我在雲上找周杰倫最近有沒有開演唱會', '幫我上網查這部劇什麼時候播出', '幫我在網路上找故宮的開放時間', '幫我在雲上找這首歌好不好聽',
      '幫我在雲上找周深的組曲先不要播放', '幫我上網查查 不想聽', '先別放給我聽', '要不要聽', "search online but don't play it", 'do not play it',
      '我聽說周杰倫要來', 'display the lyrics']) expect(matchPlayRequest(text), text).toBe(false)
  })
})
