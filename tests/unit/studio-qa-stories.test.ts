import { describe, expect, it } from 'vitest'
import { defaultExperience, parseAvatarExperience } from '../../src/shared/portrait-studio'
import { STUDIO_QA_STORIES, sameStudioName, studioQaStory } from '../../src/main/studio-qa-stories'

describe('live Interactive Studio QA stories', () => {
  it.each(STUDIO_QA_STORIES.filter(story => story.id !== 'default'))('$id is a valid studio the Console could publish', story => {
    const experience = { ...defaultExperience(), studio: { ...defaultExperience().studio, ...story.studio } }
    expect(parseAvatarExperience(experience)).not.toBeNull()
  })

  it.each(STUDIO_QA_STORIES)('$id gives the visitor a line for every step', story => {
    const studio = { ...defaultExperience().studio, ...story.studio }
    expect(story.visitor.answers).toHaveLength(studio.questions.length)
    expect(story.visitor.changes.length).toBeLessThanOrEqual(studio.revisionsAllowed)
    expect(!!story.visitor.name).toBe(studio.askName !== false)
  })

  it('covers three very different stories', () => {
    const stories = ['past_life_oracle', 'unlived_cartographer', 'dream_pawnshop'].map(id => studioQaStory(id)!)
    const studios = stories.map(story => ({ ...defaultExperience().studio, ...story.studio }))
    expect(new Set(studios.map(s => s.askName !== false)).size).toBe(2)
    expect(new Set(studios.map(s => s.questions.length)).size).toBe(3)
    expect(new Set(studios.map(s => s.revisionsAllowed)).size).toBe(3)
    expect(new Set(studios.map(s => s.quality)).size).toBe(3)
    expect(new Set(studios.map(s => s.character)).size).toBe(3)
    expect(stories.some(story => /^[\x20-\x7e]+$/.test(story.visitor.answers.join(' ')))).toBe(true)
  })

  it('answers the published default questions and revises something the visitor actually described', () => {
    const story = studioQaStory('default')!
    expect(story.visitor.answers).toHaveLength(defaultExperience().studio.questions.length)
    expect(story.visitor.answers[0]).toContain('因為')
    expect(story.visitor.answers.some(answer => answer.includes('海邊'))).toBe(true)
    expect(story.visitor.changes[0]).toContain('海邊')
  })

  it('compares names the way a visitor reads them', () => {
    expect(sameStudioName('Mia', ' MIA ')).toBe(true)
    expect(sameStudioName('王曉明', '王小明')).toBe(false)
  })
})
