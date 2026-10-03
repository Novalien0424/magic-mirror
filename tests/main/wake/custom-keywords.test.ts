import { describe, expect, it } from 'vitest'
import { compileWakePhrase } from '../../../src/main/wake/custom-keywords'

const tokens = ['n', 'ǐ', 'h', 'ǎo', 'x', 'iǎo', 'l', 'ián', 'HH', 'AH0', 'L', 'OW1', 'R', 'EH1', 'N'].map((token, i) => `${token} ${i}`).join('\n')
describe('custom avatar wake keywords', () => {
  it('encodes Chinese and English with only the installed model vocabulary', () => {
    expect(compileWakePhrase('你好小蓮', tokens)).toBe('n ǐ h ǎo x iǎo l ián @avatar_wake\n')
    expect(compileWakePhrase('Hello Ren', tokens)).toMatch(/^HH .* R .* @avatar_wake\n$/)
    expect(compileWakePhrase('你好 Ren', tokens)).toMatch(/^n ǐ h ǎo R /)
  })
  it('rejects unencodable words explicitly without substituting another wake phrase', () => {
    expect(() => compileWakePhrase('你好🦄', tokens)).toThrow('wake_phrase_unsupported')
    expect(() => compileWakePhrase('hello', '<blk> 0')).toThrow('wake_phrase_token_unavailable')
  })
})
