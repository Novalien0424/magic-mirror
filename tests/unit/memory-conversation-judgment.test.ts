import { expect, it } from 'vitest'
import { confirmationQuestionMatches, judgeMemoryConversation } from '../../src/main/memory-conversation-judgment'
it('does not answer yes to a related but different question or a question followed by another one', () => {
  const r = (text: string) => ({ visit: 2, stage: 'return_identify', role: 'avatar', text })
  expect(confirmationQuestionMatches([r('Would you like to discuss the project?')], 2, 'Alex')).toBe(false)
  expect(confirmationQuestionMatches([r('Are you Alex?'), r('Would you like some advice?')], 2, 'Alex')).toBe(false)
  expect(confirmationQuestionMatches([r('Are you Alex?')], 2, 'Alex')).toBe(true)
})
it('rejects an old deadline even when material recall succeeds', () => {
  const result = judgeMemoryConversation([
    { visit: 2, stage: 'recall_material', role: 'avatar', text: 'Cork, for less glare and easier carrying.' },
    { visit: 2, stage: 'recall_commitment', role: 'avatar', text: 'Two samples by Friday afternoon.' },
  ])
  expect(result.material).toBe(true); expect(result.commitment).toBe(false)
})
it('accepts an explicit old-to-current deadline correction while rejecting missing quantities or ambiguous dates', () => {
  const judge = (text: string) => judgeMemoryConversation([{ visit: 2, stage: 'recall_commitment', role: 'avatar', text }]).commitment
  expect(judge('You promised two cork color samples to Maya. You originally said Friday afternoon, but it changed to Saturday afternoon, and they have not been delivered yet.')).toBe(true)
  expect(judge('Two samples, changed from Friday afternoon to Saturday afternoon.')).toBe(true)
  expect(judge('Two samples by Friday or Saturday afternoon.')).toBe(false)
  expect(judge('The samples by Saturday afternoon.')).toBe(false)
})
it('flags false storage-failure claims and thinking narration in the synthetic conversation', () => {
  for (const text of ['I had a little trouble saving that.', 'Let me quickly think through what you promised.']) {
    expect(judgeMemoryConversation([{ visit: 1, stage: 'background', role: 'avatar', text }]).clean).toBe(false)
  }
})
