// Opt-in provider compatibility check. Synthetic artwork stays in RAM; only
// model/request/result metadata is printed. Never prints credentials or prompts.
import { pngAlpha } from './studio-png-alpha'
import { describe, expect, it } from 'vitest'
import source from '../../resources/config/portrait-studio.v1.json'
import { defaultExperience } from '../../src/shared/portrait-studio'
import { buildPortraitPrompt, buildRevisionPrompt } from '../../src/shared/studio-image-prompt'
import { createStudioConceptProvider } from '../../src/main/studio/concept-provider'
import { createChatgptTokenFile } from '../../src/main/chatgpt-auth/token-file'
import { createCodexImageProvider } from '../../src/main/studio/image-provider'

describe.skipIf(process.env.STUDIO_IMAGE_MODEL_LIVE !== '1')('Studio image model compatibility (live, RAM only)', () => {
  it('generates and edits a transparent sticker with the selected model', async () => {
    const model = process.env.STUDIO_IMAGE_PROBE_MODEL ?? source.image.modelId
    const productionPrompt = process.env.STUDIO_IMAGE_PROBE_PROMPT !== 'simple'
    const studio = defaultExperience().studio
    const sample = ['I moved to a new city.', 'I stayed to help a friend.', 'I want adventure and a stable home.', 'More quiet time.']
    const answers = studio.questions.map((question, index) => ({ question: question.en, answer: sample[index]! }))
    const selected = await createStudioConceptProvider().select({ operation: 'initial', answers })
    if (!selected.ok) throw Error(`probe_concept_${selected.code}`)
    const concept = selected.concept
    const imagePrompt = productionPrompt ? buildPortraitPrompt({ studio, concept, name: '' }) : 'Create one square isolated illustration of a single blue oak leaf centred with generous padding. Botanical copperplate engraving. Fully transparent background, no backdrop, scenery, checkerboard, shadows or text.'
    const revisionPrompt = productionPrompt ? buildRevisionPrompt({ studio, concept, name: '', change: 'Make the creature green.' }) : 'Change only the leaf colour to green. Preserve its botanical engraving style, composition and natural painted edges. Preserve the fully transparent background; no backdrop, checkerboard or shadow.'
    const provider = createCodexImageProvider({ credentials: createChatgptTokenFile(), settings: { ...source.image, modelId: model } })
    const generated = await provider.generate({ prompt: imagePrompt, quality: 'medium', picture: 'sticker' })
    console.info(JSON.stringify({ model, promptCase: productionPrompt ? 'studio' : 'simple', operation: 'generate', ok: generated.ok, elapsedMs: generated.elapsedMs, ...generated.ok ? { bytes: generated.image.length, mimeType: generated.mimeType } : { code: generated.code, httpStatus: generated.httpStatus } }))
    if (!generated.ok) throw Error(`probe_generate_${generated.code}_${generated.httpStatus ?? 'none'}`)
    const alpha = pngAlpha(generated.image)
    console.info(JSON.stringify({ model, promptCase: productionPrompt ? 'studio' : 'simple', operation: 'generate_alpha', ...alpha }))
    const edited = await provider.edit({ prompt: revisionPrompt, image: generated.image, mimeType: generated.mimeType, quality: 'medium', picture: 'sticker' })
    console.info(JSON.stringify({ model, promptCase: productionPrompt ? 'studio' : 'simple', operation: 'edit', ok: edited.ok, elapsedMs: edited.elapsedMs, ...edited.ok ? { bytes: edited.image.length, mimeType: edited.mimeType } : { code: edited.code, httpStatus: edited.httpStatus } }))
    if (!edited.ok) throw Error(`probe_edit_${edited.code}_${edited.httpStatus ?? 'none'}`)
    const editedAlpha = pngAlpha(edited.image)
    console.info(JSON.stringify({ model, promptCase: productionPrompt ? 'studio' : 'simple', operation: 'edit_alpha', ...editedAlpha }))
    for (const result of [alpha, editedAlpha]) {
      expect(result.transparentPixels).toBeGreaterThan(0)
      expect(result.visiblePixels).toBeGreaterThan(0)
      expect(result.width).toBe(result.height)
    }
    expect(edited.image.equals(generated.image)).toBe(false)
  }, 420_000)
})
