// Opt-in live check of the cut-ready sticker: real concept and image calls with synthetic answers.
// Writes each provider picture and its cleaned copy only into STUDIO_STICKER_CUT_DIR (a temporary
// folder outside the repository, deleted by the caller); prints sizes and timings only.
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mirrorConfigSchema } from '../../src/main/config-service'
import type { MirrorConfig } from '../../src/shared/types'
import { studioPictureType } from '../../src/shared/portrait-studio'
import { buildPortraitPrompt } from '../../src/shared/studio-image-prompt'
import { createStudioConceptProvider } from '../../src/main/studio/concept-provider'
import { createChatgptTokenFile } from '../../src/main/chatgpt-auth/token-file'
import { createCodexImageProvider } from '../../src/main/studio/image-provider'
import { cleanSticker } from '../../src/main/studio/sticker-cleanup'
import { PORTRAIT_STUDIO } from '../../src/shared/portrait-studio-config'

// The third set produced detached water drops before the "one connected shape" wording.
const samples = [
  { id: 'belonging', answers: ['Stepping off an overnight train in a city I had never visited and seeing the first sunrise over the harbour.', 'I invited a new neighbour to share dinner even though I was shy.', 'I want to keep discovering distant places and also have a home to return to.', 'More open horizons, with a quiet place of belonging that travels with me.'] },
  { id: 'craft', answers: ['I spent many evenings restoring a weathered wooden chair that someone had thrown away.', 'When a project fell apart, I patiently rebuilt the smallest damaged part first.', 'I want to make work with care and depth, but I also want enough room to rest.', 'More patient strength, tactile beauty, and time to finish a few things well.'] },
  { id: 'renewal', answers: ['After a long season of taking everything seriously, I watched tiny green shoots appear in a cracked courtyard pot after the rain. I laughed when a bird splashed in the puddle beside it.', 'I turned an unsuccessful plan into a playful experiment with friends.', 'I want the security of a familiar rhythm and the freedom to change direction.', 'More lightness, mischievous curiosity, and the courage to begin again.'] },
] as const

describe.skipIf(process.env.STUDIO_STICKER_CUT_LIVE !== '1')('Cut-ready sticker (live, synthetic answers)', () => {
  it('generates with the published Studio settings and cleans each picture', async () => {
    const out = process.env.STUDIO_STICKER_CUT_DIR
    if (!out || out.startsWith(process.cwd())) throw Error('sticker_cut_dir_outside_repository_required')
    const { schemaVersion: _schemaVersion, ...candidate } = JSON.parse(readFileSync(join(homedir(), 'Library/Application Support/magic-mirror/config/active.json'), 'utf8'))
    const studio = (mirrorConfigSchema.parse(candidate) as MirrorConfig).avatarCatalog?.avatars.find(avatar => avatar.id === 'raven-field')?.experience?.studio
    if (!studio) throw Error('published_raven_studio_missing')
    expect(studioPictureType(studio)).toBe('sticker')
    const concepts = createStudioConceptProvider()
    const images = createCodexImageProvider({ credentials: createChatgptTokenFile(), settings: PORTRAIT_STUDIO.image })
    for (const sample of samples) {
      const answers = studio.questions.map((question, index) => ({ question: question.en, answer: sample.answers[index]!, ...(question.imageLine ? { context: question.imageLine } : {}) }))
      const concept = await concepts.select({ operation: 'initial', direction: studio.conceptDirection, answers })
      if (!concept.ok) throw Error(`sticker_cut_concept_${concept.code}`)
      const image = await images.generate({ prompt: buildPortraitPrompt({ studio, concept: concept.concept, name: '' }), quality: studio.quality, picture: 'sticker' })
      if (!image.ok) throw Error(`sticker_cut_image_${image.code}`)
      const started = performance.now(), cleaned = await cleanSticker(image.image)
      expect(cleaned).not.toBeNull()
      writeFileSync(join(out, `${sample.id}-provider.png`), image.image, { flag: 'wx' })
      writeFileSync(join(out, `${sample.id}-cleaned.png`), cleaned!, { flag: 'wx' })
      console.info(JSON.stringify({ id: sample.id, conceptMs: concept.elapsedMs, imageMs: image.elapsedMs, cleanMs: Math.round(performance.now() - started),
        providerBytes: image.image.length, cleanedBytes: cleaned!.length, cleanedSide: [cleaned!.readUInt32BE(16), cleaned!.readUInt32BE(20)] }))
    }
  }, 12 * 60_000)
})
