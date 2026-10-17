import { PORTRAIT_STUDIO, renderStudioText } from '../../shared/portrait-studio-config'
import type { StudioSettings, StudioSlot } from '../../shared/portrait-studio'

/** Visitor text enters the image prompt only as quoted, bounded data. */
export function quoteVisitorText(value: string, max = 80): string {
  const clean = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/["“”「」]/gu, "'").replace(/\s+/gu, ' ').trim().slice(0, max)
  return JSON.stringify(clean)
}

export interface PortraitAnswers { readonly slot: StudioSlot; readonly answer: string }

/** Deterministic: the same settings and answers always produce the same prompt. */
export function buildPortraitPrompt(input: { studio: StudioSettings; answers: readonly PortraitAnswers[]; name: string }): string {
  const template = PORTRAIT_STUDIO.imagePrompt
  const parts = [renderStudioText(template.frame, { style: input.studio.artStyle.trim() })]
  for (const { slot, answer } of input.answers) parts.push(renderStudioText(template.slots[slot], { answer: quoteVisitorText(answer) }))
  parts.push(input.studio.nameLettering === 'painted'
    ? renderStudioText(template.painted, { name: quoteVisitorText(input.name, 40) })
    : template.nameplate)
  return parts.join(' ')
}

export function buildRevisionPrompt(input: { studio: StudioSettings; change: string; name: string }): string {
  const template = PORTRAIT_STUDIO.imagePrompt
  return [renderStudioText(template.revision, { change: quoteVisitorText(input.change, 120) }),
    input.studio.nameLettering === 'painted' ? renderStudioText(template.painted, { name: quoteVisitorText(input.name, 40) }) : template.nameplate].join(' ')
}
