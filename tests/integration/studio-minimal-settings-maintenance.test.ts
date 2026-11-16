// Explicit owner-authorized scoped style maintenance. Run only with Electron stopped.
// No unrelated draft publication; reports contain metadata and hashes only.
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

const target = 'raven-field'
function studio(config: MirrorConfig): StudioSettings {
  const found = config.avatarCatalog?.avatars.find(avatar => avatar.id === target)?.experience?.studio
  if (!found) throw Error('minimal_maintenance_target_missing')
  return found
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

describe.skipIf(process.env.STUDIO_MINIMAL_SETTINGS_MAINTENANCE !== '1')('Studio minimalist style maintenance (live config)', () => {
  it('changes only Raven active/draft artStyle, preserving direction, quality and all unrelated values', async () => {
    const release = acquireElectronOwner('studio-minimal-settings-maintenance')
    try {
      assertElectronStopped()
      const configDir = join(homedir(), 'Library/Application Support/magic-mirror/config')
      const read = async (slot: string) => JSON.parse(await readFile(join(configDir, `${slot}.json`), 'utf8')) as MirrorConfig
      const before = { active: await read('active'), draft: await read('draft') }
      expect(before.active.avatarCatalog?.activeAvatarId).toBe(target)
      const newStyle = defaultExperience().studio.artStyle
      expect(newStyle).toMatch(/modern minimalist/i)
      expect(newStyle).not.toContain('in a sophisticated, hand-painted animation concept-art style')
      const events: { event: string; status: string }[] = []
      await updateAvatarStudioSettings({ configDir, defaultConfigPath: resolve('resources/config/default.json'),
        events: { emit: event => events.push({ event: event.event, status: event.status }) } }, target,
      current => ({ ...current, artStyle: newStyle }))
      const after = { active: await read('active'), draft: await read('draft'), previous: await read('previous') }
      const results: Record<string, unknown> = {}
      for (const slot of ['active', 'draft'] as const) {
        const index = before[slot].avatarCatalog!.avatars.findIndex(avatar => avatar.id === target)
        const prefix = `avatarCatalog.avatars.${index}.experience.studio`
        const allowed = new Set(['configVersion', `${prefix}.artStyle`])
        const changed = differences(before[slot], after[slot])
        expect(changed.every(path => allowed.has(path))).toBe(true)
        expect(studio(after[slot]).artStyle).toBe(newStyle)
        expect(studio(after[slot]).quality).toBe(studio(before[slot]).quality)
        expect(studio(after[slot]).conceptDirection).toBe(studio(before[slot]).conceptDirection)
        expect(Object.hasOwn(studio(after[slot]), 'conceptDirection')).toBe(Object.hasOwn(studio(before[slot]), 'conceptDirection'))
        results[slot] = { changedPaths: changed, beforeVersion: before[slot].configVersion, afterVersion: after[slot].configVersion,
          qualityBefore: studio(before[slot]).quality, qualityAfter: studio(after[slot]).quality,
          conceptDirectionPreserved: true, directionOverridePresent: studio(after[slot]).conceptDirection !== undefined,
          beforeSha256: hash(before[slot]), afterSha256: hash(after[slot]), newStyleSha256: hash(newStyle) }
      }
      expect(after.previous).toEqual(before.active)
      expect(after.active.configVersion).toBe(before.active.configVersion + 1)
      const metadata = { at: new Date().toISOString(), avatarId: target, previousEqualsOldActive: true, unrelatedFieldsPreserved: true, ...results, events }
      await mkdir('.artifacts/studio-minimal-2026-11-16', { recursive: true })
      await writeFile('.artifacts/studio-minimal-2026-11-16/settings.json', JSON.stringify(metadata, null, 2))
      console.info(JSON.stringify(metadata))
    } finally { release() }
  }, 30_000)
})
