import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, copyFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createQaArtifact, finishQaArtifact, reviewQaArtifact, cleanQaArtifact } from '../../scripts/qa-artifacts.mjs'

const roots: string[] = []
const id = '2026-09-10T00-00-00-000Z'
async function fixture() {
  const repo = await mkdtemp(join(tmpdir(), 'mm-artifact-test-'))
  roots.push(repo)
  await mkdir(join(repo, 'docs/testing'), { recursive: true })
  await writeFile(join(repo, 'docs/testing/result.md'), 'Synthetic QA result recorded.')
  const root = await createQaArtifact(repo, id)
  await writeFile(join(root, 'fixture.txt'), 'synthetic')
  return { repo, root }
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

describe('owned QA artifact cleanup', () => {
  it('executes the CLI review, dry run and explicit deletion in an isolated repository', async () => {
    const { repo, root } = await fixture()
    await mkdir(join(repo, 'scripts'))
    const script = join(repo, 'scripts/qa-artifacts.mjs')
    await copyFile(new URL('../../scripts/qa-artifacts.mjs', import.meta.url), script)
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', windowsHide: true })
    await finishQaArtifact(repo, id, 0)
    expect(run('clean', id, '--delete').status).toBe(1)
    expect(run('review', id, '--report', 'docs/testing/result.md').status).toBe(0)
    const preview = run('clean', id)
    expect(preview.status).toBe(0)
    expect(JSON.parse(preview.stdout)).toMatchObject({ deleted: false })
    expect(run('clean', id, '--force').status).toBe(1)
    expect(await readFile(join(root, 'fixture.txt'), 'utf8')).toBe('synthetic')
    const deleted = run('clean', id, '--delete')
    expect(deleted.status).toBe(0)
    expect(JSON.parse(deleted.stdout)).toMatchObject({ deleted: true })
  })
  it('defaults to a dry run and deletes only an explicitly selected reviewed run', async () => {
    const { repo, root } = await fixture()
    const sibling = join(root, '..', 'unrelated')
    await mkdir(sibling); await writeFile(join(sibling, 'keep.txt'), 'keep')
    await finishQaArtifact(repo, id, 0)
    await reviewQaArtifact(repo, id, 'docs/testing/result.md')
    expect(await cleanQaArtifact(repo, id)).toMatchObject({ deleted: false, runId: id })
    expect(await readFile(join(root, 'fixture.txt'), 'utf8')).toBe('synthetic')
    expect(await cleanQaArtifact(repo, id, true)).toMatchObject({ deleted: true })
    await expect(readFile(join(root, '.qa-artifact.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(sibling, 'keep.txt'), 'utf8')).toBe('keep')
  })
  it('rejects traversal, absolute paths and collisions with existing directories', async () => {
    const { repo } = await fixture()
    for (const bad of ['..', '../operator', 'C:\\operator', '*']) {
      await expect(createQaArtifact(repo, bad)).rejects.toThrow('qa_artifact_invalid_run_id')
      await expect(cleanQaArtifact(repo, bad, true)).rejects.toThrow('qa_artifact_invalid_run_id')
    }
    await expect(createQaArtifact(repo, id)).rejects.toThrow()
  })
  it('refuses unmarked and tampered ownership markers', async () => {
    const { repo, root } = await fixture()
    await rm(join(root, '.qa-artifact.json'))
    await expect(cleanQaArtifact(repo, id, true)).rejects.toThrow('qa_artifact_marker_required')
    await writeFile(join(root, '.qa-artifact.json'), JSON.stringify({ version: 1, runId: id, owner: 'operator' }))
    await expect(cleanQaArtifact(repo, id, true)).rejects.toThrow('qa_artifact_marker_invalid')
  })
  it('preserves running and unreviewed failed runs', async () => {
    const { repo, root } = await fixture()
    await expect(reviewQaArtifact(repo, id, 'docs/testing/result.md')).rejects.toThrow('qa_artifact_run_unfinished')
    await expect(cleanQaArtifact(repo, id, true)).rejects.toThrow('qa_artifact_run_unfinished')
    await finishQaArtifact(repo, id, 2)
    await expect(cleanQaArtifact(repo, id, true)).rejects.toThrow('qa_artifact_review_required')
    await expect(reviewQaArtifact(repo, id, '../result.md')).rejects.toThrow('qa_artifact_report_invalid')
    await reviewQaArtifact(repo, id, 'docs/testing/result.md')
    expect(await cleanQaArtifact(repo, id, true)).toMatchObject({ deleted: true, exitCode: 2 })
    await expect(readFile(join(root, 'fixture.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('rejects report or artifact changes after review', async () => {
    const { repo, root } = await fixture()
    await finishQaArtifact(repo, id, 0)
    await reviewQaArtifact(repo, id, 'docs/testing/result.md')
    await writeFile(join(repo, 'docs/testing/result.md'), 'Changed report')
    await expect(cleanQaArtifact(repo, id, true)).rejects.toThrow('qa_artifact_report_changed')
    await reviewQaArtifact(repo, id, 'docs/testing/result.md')
    await writeFile(join(root, 'new.txt'), 'new evidence')
    await expect(cleanQaArtifact(repo, id, true)).rejects.toThrow('qa_artifact_contents_changed')
  })
  it('rejects a junction inside the run without touching its target', async () => {
    const { repo, root } = await fixture()
    const outside = join(repo, 'operator')
    await mkdir(outside); await writeFile(join(outside, 'keep.txt'), 'keep')
    await symlink(outside, join(root, 'linked'), 'junction')
    await finishQaArtifact(repo, id, 0)
    await expect(reviewQaArtifact(repo, id, 'docs/testing/result.md')).rejects.toThrow('qa_artifact_link_rejected')
    expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('keep')
  })
  it('rejects a junction replacing the artifact parent', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'mm-artifact-test-')); roots.push(repo)
    await mkdir(join(repo, 'operator')); await symlink(join(repo, 'operator'), join(repo, '.artifacts'), 'junction')
    await expect(createQaArtifact(repo, id)).rejects.toThrow('qa_artifact_link_rejected')
  })
})
