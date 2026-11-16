// Explicitly authorized synthetic sample export for the owner's Drive review.
// Saves exactly three original provider PNGs; no actual visitor data or credentials.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mirrorConfigSchema } from '../../src/main/config-service'
import type { MirrorConfig } from '../../src/shared/types'
import { studioConceptDirection } from '../../src/shared/studio-concept'
import { studioPictureType } from '../../src/shared/portrait-studio'
import { buildPortraitPrompt } from '../../src/shared/studio-image-prompt'
import { createStudioConceptProvider, STUDIO_CONCEPT_CONFIG } from '../../src/main/studio/concept-provider'
import { createChatgptTokenFile } from '../../src/main/chatgpt-auth/token-file'
import { createCodexImageProvider } from '../../src/main/studio/image-provider'
import { PORTRAIT_STUDIO } from '../../src/shared/portrait-studio-config'
import { pngAlpha } from './studio-png-alpha'

const samples = [
  {
    id: '01-exploration-and-belonging',
    title: 'Exploration and belonging',
    answers: [
      'The moment that stayed with me was stepping off an overnight train in a city I had never visited, carrying a small bag and seeing the first sunrise over the harbour. I felt excited by the unfamiliar streets, yet I missed the familiar sound of people who knew me.',
      'I invited a new neighbour to share dinner even though I was shy. Making a welcoming place for someone felt more like me than trying to look adventurous.',
      'I want to keep discovering distant places and also have a home where I can put down roots and return without having to start over.',
      'I would like more open horizons, with a quiet place of belonging that travels with me.',
    ],
  },
  {
    id: '02-quiet-resilience-and-craft',
    title: 'Quiet resilience and craft',
    answers: [
      'I spent many evenings restoring a weathered wooden chair that someone had thrown away. When it finally held weight again, the repaired joints and worn grain meant more to me than a flawless new surface would have.',
      'When a project fell apart, I stopped rushing and patiently rebuilt the smallest damaged part first. I enjoy finding what can still be useful and making it strong with my hands.',
      'I want to make work with care and depth, but I also want enough room to rest instead of proving myself by always working harder.',
      'I want more patient strength, tactile beauty, and time to finish a few things well.',
    ],
  },
  {
    id: '03-renewal-and-playfulness',
    title: 'Renewal and playfulness',
    answers: [
      'After a long season of taking everything seriously, I watched tiny green shoots appear in a cracked courtyard pot after the rain. I laughed when a bird splashed in the puddle beside it. That small, ordinary surprise made the day feel new.',
      'I turned an unsuccessful plan into a playful experiment with friends. We tried strange colours and silly ideas, and the freedom to make something imperfect brought back my curiosity.',
      'I want the security of a familiar rhythm and the freedom to change direction when a surprising possibility appears.',
      'I would like more lightness, mischievous curiosity, and the courage to begin again without needing a perfect reason.',
    ],
  },
] as const

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

describe.skipIf(process.env.STUDIO_DRIVE_SAMPLES_LIVE !== '1')('Published Studio synthetic Drive samples', () => {
  it('generates three original illustrations with different complete synthetic answers', async () => {
    const batch = process.env.STUDIO_DRIVE_SAMPLE_BATCH
    if (batch !== undefined && batch !== 'astra' && batch !== 'minimal') throw Error('sample_batch_invalid')
    if (batch === 'astra' || batch === 'minimal') expect(STUDIO_CONCEPT_CONFIG.modelId).toBe('gpt-6-astra')
    const root = join(process.cwd(), batch === 'minimal' ? '.artifacts/studio-minimal-2026-11-16' : batch === 'astra' ? '.artifacts/studio-astra-2026-11-16' : '.artifacts/studio-drive-2026-11-16')
    mkdirSync(root, { recursive: true })
    if (samples.some(sample => existsSync(join(root, `${sample.id}.png`)))) throw Error('sample_exports_already_exist_no_overwrite')
    const envelope = JSON.parse(readFileSync(join(homedir(), 'Library/Application Support/magic-mirror/config/active.json'), 'utf8'))
    if (envelope.schemaVersion !== 5) throw Error('sample_requires_current_config_schema')
    // Main's on-disk envelope removes schemaVersion before mirrorConfigSchema validation.
    const { schemaVersion: _schemaVersion, ...candidate } = envelope
    const parsed = mirrorConfigSchema.safeParse(candidate)
    if (!parsed.success) { console.info(JSON.stringify({ event: 'published_validation_failed', issues: parsed.error.issues.map(issue => ({ path: issue.path, code: issue.code })) })); throw Error('published_config_invalid') }
    const published = parsed.data as MirrorConfig
    const avatar = published.avatarCatalog?.avatars.find(value => value.id === 'raven-field')
    const studio = avatar?.experience?.studio
    if (!studio) throw Error('published_raven_studio_missing')
    expect(studio.questions).toHaveLength(4)
    if (batch === 'minimal') {
      expect(studio.artStyle).toMatch(/modern minimalist/i)
      expect(STUDIO_CONCEPT_CONFIG.reasoningEffort).toBe('medium')
    }
    const picture = studioPictureType(studio)
    const concepts = createStudioConceptProvider()
    const images = createCodexImageProvider({ credentials: createChatgptTokenFile(), settings: PORTRAIT_STUDIO.image })
    const metadata: Record<string, unknown> = {
      authorization: 'Owner requested three actual synthetic-answer runs and retained original PNGs for Drive upload.',
      batch: batch ?? 'original', generatedAt: new Date().toISOString(), source: 'current published raven-field Studio settings', configVersion: published.configVersion,
      quality: studio.quality, picture, artStyle: studio.artStyle, artStyleSha256: hash(studio.artStyle),
      conceptDirectionSha256: hash(studioConceptDirection(studio)),
      conceptVersion: STUDIO_CONCEPT_CONFIG.version, conceptModel: STUDIO_CONCEPT_CONFIG.modelId,
      conceptReasoningEffort: STUDIO_CONCEPT_CONFIG.reasoningEffort, conceptTimeoutMs: STUDIO_CONCEPT_CONFIG.timeoutMs, conceptMaxOutputTokens: STUDIO_CONCEPT_CONFIG.maxOutputTokens,
      imageModel: PORTRAIT_STUDIO.image.modelId, samples: [],
    }
    const rows = metadata.samples as Record<string, unknown>[]
    const checkpoint = () => writeFileSync(join(root, 'manifest.json'), JSON.stringify(metadata, null, 2))
    checkpoint()
    for (const sample of samples) {
      const answers = studio.questions.map((question, index) => ({ question: question.en, answer: sample.answers[index]!, ...(question.imageLine ? { context: question.imageLine } : {}) }))
      const row: Record<string, unknown> = { id: sample.id, title: sample.title, synthetic: true, answers: sample.answers }
      rows.push(row); checkpoint()
      const concept = await concepts.select({ operation: 'initial', direction: studio.conceptDirection, answers })
      row.conceptOk = concept.ok; row.conceptElapsedMs = concept.elapsedMs
      if (!concept.ok) { row.failure = concept.code; checkpoint(); throw Error(`sample_${sample.id}_concept_${concept.code}`) }
      // This brief derives only from the synthetic fixture above and is authorized sample metadata.
      row.concept = concept.concept
      checkpoint()
      const prompt = buildPortraitPrompt({ studio, concept: concept.concept, name: '' })
      row.promptSha256 = hash(prompt)
      const image = await images.generate({ prompt, quality: studio.quality, picture })
      row.imageOk = image.ok; row.imageElapsedMs = image.elapsedMs
      if (!image.ok) { row.failure = image.code; row.httpStatus = image.httpStatus; checkpoint(); throw Error(`sample_${sample.id}_image_${image.code}`) }
      if (image.mimeType !== 'image/png') { row.failure = 'sample_png_required'; checkpoint(); throw Error('sample_png_required') }
      const file = `${sample.id}.png`
      writeFileSync(join(root, file), image.image, { flag: 'wx' })
      row.file = file; row.bytes = image.image.length; row.sha256 = hash(image.image)
      row.alpha = pngAlpha(image.image)
      checkpoint()
      console.info(JSON.stringify({ id: sample.id, file, conceptElapsedMs: concept.elapsedMs, imageElapsedMs: image.elapsedMs, bytes: image.image.length, alpha: row.alpha }))
    }
    metadata.completedAt = new Date().toISOString(); metadata.generatedCount = rows.filter(row => row.file).length; checkpoint()
    expect(metadata.generatedCount).toBe(3)
  }, 12 * 60_000)
})
