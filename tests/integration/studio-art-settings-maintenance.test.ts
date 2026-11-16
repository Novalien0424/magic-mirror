// Explicit owner-authorized maintenance. Run only with the app stopped; metadata only.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { updateAvatarStudioSettings } from '../../src/main/config-service'
import { defaultExperience, type StudioSettings } from '../../src/shared/portrait-studio'
import type { MirrorConfig } from '../../src/shared/types'
// @ts-expect-error Shared plain-JavaScript runtime-operation lease.
import { acquireElectronOwner, assertElectronStopped } from '../../scripts/electron-owner.mjs'

const oldLines = [
  'A meaningful moment, translated symbolically into the imaginary soul creature: {{answer}}.',
  'An action expressing the visitor’s character, represented in the creature’s gesture or form: {{answer}}.',
  'A tension between two wishes, represented as balanced contrasting features: {{answer}}.',
  'A wish for life, represented in the creature’s colours or small supporting motif: {{answer}}.',
]
const oldQ1 = {
  zh: '你的靈魂唯有轉換成為度界之獸，才能進入這個Gate thirty three, 現在讓我們來嘗試描繪你的靈魂吧。說說看最近這一年裡面，有哪一個時刻最讓你印象深刻 為什麼?',
  en: 'Your soul must become a creature that crosses worlds to enter Gate thirty-three. Let us imagine it. Which moment in the past year stayed with you most, and why?',
}
const target = 'raven-field'
function studio(config: MirrorConfig): StudioSettings {
  const value = config.avatarCatalog?.avatars.find(avatar => avatar.id === target)?.experience?.studio
  if (!value) throw Error('maintenance_target_studio_missing')
  return value
}
function differences(a: unknown, b: unknown, path = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => differences(
      (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key))
  }
  return [path]
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

describe.skipIf(process.env.STUDIO_ART_SETTINGS_MAINTENANCE !== '1')('Studio art settings maintenance (live config)', () => {
  it('updates only the approved active-avatar art fields and preserves the draft', async () => {
    const release = acquireElectronOwner('studio-art-settings-maintenance')
    try {
      assertElectronStopped()
      const configDir = join(homedir(), 'Library/Application Support/magic-mirror/config')
      const read = async (slot: string) => JSON.parse(await readFile(join(configDir, `${slot}.json`), 'utf8')) as MirrorConfig
      const before = { active: await read('active'), draft: await read('draft') }
      expect(before.active.avatarCatalog?.activeAvatarId).toBe(target)
      const defaults = defaultExperience().studio
      const events: { event: string; status: string }[] = []
      await updateAvatarStudioSettings({ configDir, defaultConfigPath: resolve('resources/config/default.json'),
        events: { emit: event => events.push({ event: event.event, status: event.status }) } }, target, current => ({
        ...current, artStyle: defaults.artStyle,
        questions: current.questions.map(question => {
          const index = defaults.questions.findIndex(item => item.id === question.id)
          if (index < 0) return question
          const updated = { ...question }
          if (question.imageLine === oldLines[index]) updated.imageLine = defaults.questions[index]!.imageLine
          if (question.id === 'q1') for (const language of ['zh', 'en'] as const) {
            if (question[language] === oldQ1[language]) updated[language] = defaults.questions[0]![language]
          }
          return updated
        }),
      }))
      const after = { active: await read('active'), draft: await read('draft'), previous: await read('previous') }
      const results: Record<string, unknown> = {}
      for (const slot of ['active', 'draft'] as const) {
        const index = before[slot].avatarCatalog!.avatars.findIndex(avatar => avatar.id === target)
        const prefix = `avatarCatalog.avatars.${index}.experience.studio`
        const allowed = new Set(['configVersion', `${prefix}.artStyle`, `${prefix}.questions.0.zh`, `${prefix}.questions.0.en`,
          ...[0, 1, 2, 3].map(i => `${prefix}.questions.${i}.imageLine`)])
        const changed = differences(before[slot], after[slot])
        expect(changed.every(path => allowed.has(path))).toBe(true)
        expect(studio(after[slot]).quality).toBe(studio(before[slot]).quality)
        expect(studio(after[slot]).artStyle).toBe(defaults.artStyle)
        results[slot] = { changedPaths: changed, beforeVersion: before[slot].configVersion, afterVersion: after[slot].configVersion,
          qualityBefore: studio(before[slot]).quality, qualityAfter: studio(after[slot]).quality,
          beforeSha256: hash(before[slot]), afterSha256: hash(after[slot]) }
      }
      expect(after.previous).toEqual(before.active)
      expect(after.active.configVersion).toBe(before.active.configVersion + 1)
      const metadata = { at: new Date().toISOString(), avatarId: target, previousEqualsOldActive: true,
        unrelatedFieldsPreserved: true, ...results, events }
      await mkdir('.artifacts/studio-concept-2026-11-15', { recursive: true })
      await writeFile('.artifacts/studio-concept-2026-11-15/settings.json', JSON.stringify(metadata, null, 2))
      console.info(JSON.stringify(metadata))
    } finally { release() }
  }, 30_000)
})
