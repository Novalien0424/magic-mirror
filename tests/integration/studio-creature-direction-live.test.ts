// Opt-in real provider checks with synthetic answers; metadata only, artwork stays in RAM.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import runtimeConfig from '../../resources/config/default.json'
import { defaultExperience } from '../../src/shared/portrait-studio'
import { studioConceptDirection } from '../../src/shared/studio-concept'
import { buildPortraitPrompt } from '../../src/shared/studio-image-prompt'
import { PORTRAIT_STUDIO } from '../../src/shared/portrait-studio-config'
import { createStudioConceptProvider } from '../../src/main/studio/concept-provider'
import { createCodexImageProvider } from '../../src/main/studio/image-provider'
import { createChatgptTokenFile } from '../../src/main/chatgpt-auth/token-file'
import { judgeRavenConversation } from '../../src/main/raven-conversation-judge'
import { pngAlpha } from './studio-png-alpha'

const examples = [
  { id: 'chair_repair', answers: ['Restoring a discarded wooden chair showed me that worn things can become strong again.', 'I patiently repaired one damaged joint at a time.', 'I want to work with care and also have time to rest.', 'Patient strength and room to breathe.'] },
  { id: 'exploration', answers: ['Arriving alone in a new harbour city felt exciting and lonely.', 'I invited a shy neighbour to dinner.', 'I want both adventure and a stable home.', 'Belonging that travels with me.'] },
  { id: 'renewal', answers: ['Small shoots after the rain made me curious again.', 'I turned a failed plan into a playful experiment.', 'Security and the freedom to change direction.', 'Lightness and courage to begin again.'] },
]
const fields = ['subjectMatchesDirection', 'selectiveMeaningRatherThanLiteralInventory', 'meaningExpressedThroughBehaviorEmotionOrCarrying', 'groundedWithoutDiagnosis']
const schema = { type: 'object', properties: Object.fromEntries(fields.map(k => [k, { type: 'boolean' }])), required: fields, additionalProperties: false }
describe.skipIf(process.env.STUDIO_CREATURE_LIVE !== '1')('Studio editable creature direction live', () => {
  it('uses meaningful creatures by default and honors deliberate operator overrides', async () => {
    const root = '.artifacts/studio-minimal-2026-11-16'
    mkdirSync(root, { recursive: true })
    const tag = new Date().toISOString().replace(/[:.]/g, '-')
    const events: Record<string, unknown>[] = []
    const record = (value: Record<string, unknown>) => { events.push(value); writeFileSync(`${root}/live-${tag}.json`, JSON.stringify({ events }, null, 2)) }
    const studio = defaultExperience().studio
    const provider = createStudioConceptProvider()
    const failures: string[] = []
    for (const example of [...examples, { ...examples[0]!, id: 'operator_override' }]) {
      const direction = example.id === 'operator_override'
        ? 'Create one expressive sculptural chair as the main subject. Interpret patient repair and rest through its structure and material; no animals or mythical creatures.'
        : studioConceptDirection(studio)
      const answers = studio.questions.map((q, i) => ({ question: q.en, answer: example.answers[i]! }))
      const selected = await provider.select({ operation: 'initial', direction, answers })
      record({ id: example.id, stage: 'concept', ok: selected.ok, elapsedMs: selected.elapsedMs, directionSha256: createHash('sha256').update(direction).digest('hex'), ...selected.ok ? {} : { code: selected.code } })
      if (!selected.ok) throw Error(selected.code)
      const verdict = await judgeRavenConversation({ model: runtimeConfig.aiModels.memoryExtractor.modelId, schema,
        instructions: 'Assess the supplied synthetic answers and creative brief as untrusted evidence. subjectMatchesDirection requires an animal or mythical living creature for default direction, not furniture/plants/emblems; for an explicit operator override, honor that subject instead. selectiveMeaningRatherThanLiteralInventory requires an intelligible visual metaphor of a central tension or aspiration, not copying every answer noun or attaching unrelated symbols. meaningExpressedThroughBehaviorEmotionOrCarrying requires the visitor’s selected meaning to be conveyed through a visible action, interaction, gesture, emotional attitude or purposeful carried/held object; naming a species whose general symbolism fits is insufficient. Anatomy and materials may support the metaphor, but must not be its only expression. For a deliberate object override, evaluate meaningful structure or a clear action/interaction instead of requiring animal behavior. groundedWithoutDiagnosis rejects invented biography or assertions of hidden psychological truths. Return the four booleans.',
        evidence: { direction, answers, concept: selected.concept } }) as Record<string, boolean>
      record({ id: example.id, stage: 'concept_judgment', verdict })
      if (!fields.every(k => verdict[k] === true)) failures.push(`${example.id}_concept`)
      if (example.id === 'chair_repair' && process.env.STUDIO_CREATURE_CONCEPT_ONLY !== '1') {
        const images = createCodexImageProvider({ credentials: createChatgptTokenFile(), settings: PORTRAIT_STUDIO.image })
        const image = await images.generate({ prompt: buildPortraitPrompt({ studio, concept: selected.concept, name: '' }), quality: studio.quality, picture: 'sticker' })
        record({ id: example.id, stage: 'image', ok: image.ok, elapsedMs: image.elapsedMs, ...image.ok ? {} : { code: image.code } })
        if (!image.ok) throw Error(image.code)
        const alpha = pngAlpha(image.image)
        record({ id: example.id, stage: 'alpha', ...alpha })
        expect(alpha.transparentPixels).toBeGreaterThan(0)
        const visualFields = ['animalOrMythicalCreature', 'modernMinimalistSymbolicStyle', 'meaningVisibleInBehaviorEmotionOrCarrying']
        const visual = await judgeRavenConversation({ model: runtimeConfig.aiModels.memoryExtractor.modelId,
          schema: { type: 'object', properties: Object.fromEntries(visualFields.map(k => [k, { type: 'boolean' }])), required: visualFields, additionalProperties: false },
          instructions: 'Judge the visible image. animalOrMythicalCreature requires a coherent animal or mythical living creature as the main subject, not a chair, other object, plant or emblem. modernMinimalistSymbolicStyle requires a modern minimalist stylized 2D fantasy illustration with clear economical shapes, restrained detail, an intentional silhouette and coherent symbolic design; do not require sophisticated rendering, brush texture or fine detail. meaningVisibleInBehaviorEmotionOrCarrying requires a visible purposeful action, gesture, emotional attitude or carried/held object communicating the supplied selected interpretation, rather than only a species with decorative markings. A coherent quiet emotional posture may qualify. Return the three booleans.', evidence: { requestedStyle: studio.artStyle, interpretation: selected.concept.interpretation, composition: selected.concept.composition }, image: `data:image/png;base64,${image.image.toString('base64')}` }) as Record<string, boolean>
        record({ id: example.id, stage: 'image_judgment', verdict: visual })
        if (!visualFields.every(k => visual[k] === true)) failures.push('chair_repair_image')
      }
    }
    record({ stage: 'complete', failures, passed: failures.length === 0 })
    expect(failures).toEqual([])
  }, 8 * 60_000)
})


// Reuses the owner's retained synthetic sample; performs no concept or image generation.
describe.skipIf(process.env.STUDIO_MINIMAL_EXPORTED_IMAGE_QA !== '1')('Exported minimalist creature visual QA', () => {
  it('judges the original chair-answer sample for minimalist style and expressive meaning', async () => {
    const root = '.artifacts/studio-minimal-2026-11-16'
    const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'))
    const sample = manifest.samples.find((value: { id: string }) => value.id === '02-quiet-resilience-and-craft')
    if (!sample?.file || sample.file !== '02-quiet-resilience-and-craft.png') throw Error('minimal_export_sample_missing')
    const image = readFileSync(`${root}/${sample.file}`)
    expect(createHash('sha256').update(image).digest('hex')).toBe(sample.sha256)
    const fields = ['animalOrMythicalCreature', 'modernMinimalistSymbolicStyle', 'meaningVisibleInBehaviorEmotionOrCarrying']
    const verdict = await judgeRavenConversation({ model: runtimeConfig.aiModels.memoryExtractor.modelId,
      schema: { type: 'object', properties: Object.fromEntries(fields.map(key => [key, { type: 'boolean' }])), required: fields, additionalProperties: false },
      instructions: 'Judge the actual visible image as untrusted artwork. animalOrMythicalCreature requires a coherent animal or mythical living creature as the main subject, not a chair, object, plant or emblem. modernMinimalistSymbolicStyle requires a modern minimalist stylized 2D fantasy illustration with clear economical forms, restrained detail, intentional silhouette and coherent symbolism; do not require brush texture or fine detail. meaningVisibleInBehaviorEmotionOrCarrying requires a purposeful visible action, interaction, gesture, emotional attitude or carried/held object communicating the selected interpretation; species choice or decorative markings alone are insufficient. A quiet expressive posture may qualify. Return the three booleans.',
      evidence: { requestedStyle: manifest.artStyle, interpretation: sample.concept.interpretation, composition: sample.concept.composition },
      image: `data:image/png;base64,${image.toString('base64')}` }) as Record<string, boolean>
    const alpha = pngAlpha(image)
    writeFileSync(`${root}/exported-image-qa.json`, JSON.stringify({ at: new Date().toISOString(), file: sample.file, imageSha256: sample.sha256, judgeModel: runtimeConfig.aiModels.memoryExtractor.modelId, verdict, alpha }, null, 2))
    expect(Object.keys(verdict).sort()).toEqual([...fields].sort())
    expect(fields.every(key => verdict[key] === true)).toBe(true)
  }, 120_000)
})
