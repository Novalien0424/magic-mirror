import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { beginBuild, finishBuild, verifyBuild } from '../../scripts/qa-build.mjs'

const roots: string[] = []
async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'mm-qa-build-'))
  roots.push(root)
  for (const dir of ['src', 'resources/generated', 'resources/avatar', 'resources/config', 'resources/offline-loop', 'scripts', 'out/main', 'out/preload', 'out/renderer']) {
    await mkdir(join(root, dir), { recursive: true })
  }
  for (const file of ['package.json', 'package-lock.json', 'electron.vite.config.ts', 'tsconfig.json', 'tsconfig.node.json', 'tsconfig.web.json', 'scripts/generate-offline-loop.mjs', 'scripts/prepare-avatar-assets.mjs', 'scripts/generate-avatar-audio.mjs', 'src/app.ts', 'out/main/index.js', 'out/preload/mirror.js', 'out/preload/console.js', 'out/renderer/mirror/index.html', 'out/renderer/console/index.html']) {
    await mkdir(join(root, file, '..'), { recursive: true })
    await writeFile(join(root, file), 'synthetic')
  }
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('QA build provenance', () => {
  it('requires a completed build and verifies unchanged sources and outputs', async () => {
    const root = await fixture()
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_required')
    await beginBuild(root)
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_incomplete')
    await finishBuild(root)
    await expect(verifyBuild(root)).resolves.toMatchObject({ status: 'complete' })
    await writeFile(join(root, '.env'), 'not a build input')
    await expect(verifyBuild(root)).resolves.toMatchObject({ status: 'complete' })
  })
  it('rejects changed, added, deleted source and changed output', async () => {
    const root = await fixture()
    await beginBuild(root); await finishBuild(root)
    await writeFile(join(root, 'src/new.ts'), 'new')
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_stale')
    await beginBuild(root); await finishBuild(root)
    await rm(join(root, 'src/new.ts'))
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_stale')
    await beginBuild(root); await finishBuild(root)
    await writeFile(join(root, 'src/app.ts'), 'changed')
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_stale')
    await beginBuild(root); await finishBuild(root)
    await writeFile(join(root, 'out/main/index.js'), 'changed')
    await expect(verifyBuild(root)).rejects.toThrow('qa_build_output_changed')
  })
  it('rejects a source edit during the build and missing renderer output', async () => {
    const root = await fixture()
    await beginBuild(root)
    await writeFile(join(root, 'src/app.ts'), 'changed during build')
    await expect(finishBuild(root)).rejects.toThrow('qa_build_source_changed')
    await beginBuild(root)
    await rm(join(root, 'out/renderer/mirror/index.html'))
    await expect(finishBuild(root)).rejects.toThrow('qa_build_output_missing')
  })
})
