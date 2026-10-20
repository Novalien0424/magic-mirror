// Loads the published wake phrase and detector exactly as Main does
// (src/main/index.ts rebuildWakeOwner). Bundled at run time by owner-check.sh.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { loadWakeModelPackage } from '../../../../src/main/wake/model-package'
import { createWakeWorkerPackage, wakeTuningIsActive } from '../../../../src/main/wake/runtime-config'
import { createConfiguredSherpaDetector, WAKE_MAX_ACTIVE_PATHS } from '../../../../src/main/wake/sherpa-detector'

const ACTIVE = resolve(homedir(), 'Library/Application Support/magic-mirror/config/active.json')

export async function loadPackage(repo: string, kwDir: string) {
  const wake = JSON.parse(readFileSync(ACTIVE, 'utf8')).wake
  const loaded = await loadWakeModelPackage({ rootDirectory: resolve(repo, 'resources/wake-models'), wake,
    platform: `${process.platform}-${process.arch}`, customKeywordsDirectory: kwDir,
    forceCustomKeywords: wakeTuningIsActive(wake) })
  if (!loaded.ok) throw Error(loaded.reason)
  return createWakeWorkerPackage(loaded, wake)
}
export const createDetector = createConfiguredSherpaDetector
export const paths = WAKE_MAX_ACTIVE_PATHS
