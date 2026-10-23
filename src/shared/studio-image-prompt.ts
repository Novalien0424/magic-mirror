import { PORTRAIT_STUDIO, renderStudioText, STUDIO_DEFAULT_NAME_FONT, studioImagePrompt, studioQuestionLine } from './portrait-studio-config'
import type { StudioQuestion, StudioSettings } from './portrait-studio'
import { STUDIO_ANSWER_MAX } from './portrait-studio'

/** Visitor text enters the image prompt only as quoted, bounded data. */
export function quoteVisitorText(value: string, max = 80): string {
  const clean = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/["“”「」]/gu, "'").replace(/\s+/gu, ' ').trim().slice(0, max)
  return JSON.stringify(clean)
}

export interface PortraitAnswers extends Pick<StudioQuestion, 'slot' | 'imageLine'> { readonly answer: string }
type ImageSettings = Pick<StudioSettings, 'artStyle' | 'nameLettering' | 'imagePrompt' | 'pictureType' | 'nameFont'>

// The guard is versioned and fixed: operators shape every other sentence.
const nameLine = (studio: ImageSettings, name: string) => !name ? studioImagePrompt(studio, 'untitled')
  : studio.nameLettering === 'painted' ? renderStudioText(studioImagePrompt(studio, 'painted'), { name: quoteVisitorText(name, 40), font: studio.nameFont ?? STUDIO_DEFAULT_NAME_FONT })
    : studioImagePrompt(studio, 'nameplate')

/**
 * Deterministic: the same settings and answers always produce the same prompt.
 * An empty name (the name step is off) uses the no-name instruction.
 */
export function buildPortraitPrompt(input: { studio: ImageSettings; answers: readonly PortraitAnswers[]; name: string }): string {
  // The frame supplies its own punctuation after {{style}}.
  const style = input.studio.artStyle.trim().replace(/[.。]+$/u, '')
  const parts = [renderStudioText(studioImagePrompt(input.studio, 'frame'), { style }), PORTRAIT_STUDIO.imagePrompt.guard, PORTRAIT_STUDIO.imagePrompt.soul]
  for (const answer of input.answers) parts.push(renderStudioText(studioQuestionLine(answer), { answer: quoteVisitorText(answer.answer, STUDIO_ANSWER_MAX) }))
  parts.push(nameLine(input.studio, input.name))
  return parts.join(' ')
}

export function buildRevisionPrompt(input: { studio: ImageSettings; change: string; name: string }): string {
  return [renderStudioText(studioImagePrompt(input.studio, 'revision'), { change: quoteVisitorText(input.change, 120) }),
    `Art direction (operator style): ${input.studio.artStyle.trim()}`,
    PORTRAIT_STUDIO.imagePrompt.guard, nameLine(input.studio, input.name)].join(' ')
}

/** Sample answers for Console previews and the test picture; never visitor data. */
export const STUDIO_SAMPLE_ANSWERS = Object.freeze(['an owl', 'a seaside at night', 'light mist', 'deep blue', 'a small fox', 'soft candlelight', 'a lantern', 'falling leaves'])
