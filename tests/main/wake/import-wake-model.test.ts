import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('wake model import script', () => {
  it('writes an explicitly platformed package to the requested local model root', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'magic-mirror-wake-import-'))
    const packageId = `test-windows-import-${process.pid}`
    const requestedRoot = join(temporaryRoot, 'packages')
    const defaultPackage = resolve('resources', 'wake-models', packageId)
    const artifact = join(temporaryRoot, 'encoder.onnx')
    await writeFile(artifact, 'wake-artifact', 'utf8')
    try {
      const result = spawnSync(process.execPath, [
        'scripts/import-wake-model.mjs',
        '--package-id', packageId,
        '--engine', 'sherpa',
        '--engine-version', '1.13.6',
        '--model-version', 'test-v1',
        '--phrase', '魔鏡阿魔鏡',
        '--platform', 'win32-x64',
        '--output-root', requestedRoot,
        '--method', 'sherpa-text2token',
        '--source-id', 'official-test-model',
        '--corpus-result-id', 'not-evaluated',
        '--tuning', '{"sampleRateHz":16000,"threshold":0.45,"score":1}',
        '--artifact', `encoder=${artifact}`,
      ], { cwd: resolve('.'), encoding: 'utf8' })

      expect(result.status).toBe(0)
      expect(result.stdout).toBe(`WAKE_MODEL_IMPORT status=passed package_id=${packageId}\n`)
      const manifest = JSON.parse(
        await readFile(join(requestedRoot, packageId, 'manifest.json'), 'utf8'),
      ) as Record<string, unknown>
      expect(manifest).toMatchObject({
        schemaVersion: 1,
        packageId,
        platform: 'win32-x64',
        phrase: '魔鏡阿魔鏡',
        corpusResultId: 'not-evaluated',
        artifacts: [{
          role: 'encoder',
          file: 'encoder.onnx',
          sha256: '00443ab2a330c2aa612a6f3bbf7f67419f015da55790e31c57d09a5a003daa21',
        }],
      })
    } finally {
      await rm(defaultPackage, { recursive: true, force: true })
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  })
})
