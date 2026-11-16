import { PORTRAIT_STUDIO, renderStudioText, STUDIO_DEFAULT_NAME_FONT, studioImagePrompt } from './portrait-studio-config'
import type { StudioQuestion, StudioSettings } from './portrait-studio'
import type { StudioConcept } from './studio-concept'

/** Visitor text enters the image prompt only as quoted, bounded data. */
export function quoteVisitorText(value: string, max = 80): string {
  const clean = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/["“”「」]/gu, "'").replace(/\s+/gu, ' ').trim().slice(0, max)
  return JSON.stringify(clean)
}

export interface PortraitAnswers extends Pick<StudioQuestion, 'slot' | 'imageLine'> { readonly answer: string }
type ImageSettings = Pick<StudioSettings, 'artStyle' | 'nameLettering' | 'imagePrompt' | 'pictureType' | 'nameFont'>

// Operator templates surround the versioned guard and symbolic interpretation.
const nameLine = (studio: ImageSettings, name: string) => !name ? studioImagePrompt(studio, 'untitled')
  : studio.nameLettering === 'painted' ? renderStudioText(studioImagePrompt(studio, 'painted'), { name: quoteVisitorText(name, 40), font: studio.nameFont ?? STUDIO_DEFAULT_NAME_FONT })
    : studioImagePrompt(studio, 'nameplate')

/**
 * Deterministic: the same settings and selected concept always produce the same prompt.
 * An empty name (the name step is off) uses the no-name instruction.
 */
export function buildPortraitPrompt(input: { studio: ImageSettings; concept: StudioConcept; name: string }): string {
  // The frame supplies its own punctuation after {{style}}.
  const style = input.studio.artStyle.trim().replace(/[.。]+$/u, '')
  const frame = studioImagePrompt(input.studio, 'frame')
  const parts = [renderStudioText(frame, { style })]
  // Older/custom frames may omit the optional placeholder. Keep those edits,
  // but never silently discard the separate Art style field.
  if (!frame.includes('{{style}}')) parts.push(renderStudioText(PORTRAIT_STUDIO.imagePrompt.styleFallback, { style }))
  parts.push(PORTRAIT_STUDIO.imagePrompt.guard, PORTRAIT_STUDIO.imagePrompt.soul)
  for (const key of ['subject', 'interpretation', 'composition', 'mood'] as const) {
    parts.push(renderStudioText(PORTRAIT_STUDIO.imagePrompt.concept[key], { [key]: quoteVisitorText(input.concept[key], 1200) }))
  }
  parts.push(nameLine(input.studio, input.name))
  return parts.join(' ')
}

/** Revisions render the updated selected concept while preserving unrequested appearance. */
export function buildRevisionPrompt(input: { studio: ImageSettings; concept: StudioConcept; change: string; name: string }): string {
  return [renderStudioText(studioImagePrompt(input.studio, 'revision'), { change: quoteVisitorText(input.change, 120) }),
    buildPortraitPrompt(input)].join(' ')
}

/** Sample answers for Console previews and the test picture; never visitor data. */
export const STUDIO_SAMPLE_ANSWERS = Object.freeze([
  'I moved to a new city and found my own path.',
  'I stayed to help a friend when it was difficult.',
  'I want adventure and a stable home.',
  'More quiet time to notice the world around me.',
  'Someone who walks beside me.',
  'A sense of possibility.',
  'A reminder of the journey so far.',
  'Room to grow.',
])
