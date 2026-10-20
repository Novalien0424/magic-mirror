import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The runner is plain JavaScript shared by CLI entrypoints.
import { acquireElectronOwner } from '../../scripts/electron-owner.mjs'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
describe('Electron operation ownership', () => {
  it('rejects another owner, permits inherited child work, and releases only its own lease', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mirror-owner-')); roots.push(root)
    const dir = join(root, 'lease'), release = acquireElectronOwner('first', dir)
    const token = process.env.MIRROR_ELECTRON_OWNER_TOKEN
    try {
      expect(() => acquireElectronOwner('nested', dir)()).not.toThrow()
      delete process.env.MIRROR_ELECTRON_OWNER_TOKEN
      expect(() => acquireElectronOwner('other', dir)).toThrow('electron_owner_busy')
    } finally { process.env.MIRROR_ELECTRON_OWNER_TOKEN = token; release() }
    acquireElectronOwner('next', dir)()
  })
  it('refuses an invalid ownership record instead of deleting an unknown directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mirror-owner-')); roots.push(root)
    await writeFile(join(root, 'owner.json'), '{}')
    expect(() => acquireElectronOwner('test', root)).toThrow('electron_owner_record_invalid')
  })
  it.skipIf(process.platform !== 'darwin')('releases a real kernel lease after SIGKILL and ignores its stale metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mirror-owner-crash-')); roots.push(root)
    const dir = join(root, 'lease'), module = new URL('../../scripts/electron-owner.mjs', import.meta.url).href
    const child = spawn(process.execPath, ['--input-type=module', '-e',
      `import {acquireElectronOwner} from ${JSON.stringify(module)}; acquireElectronOwner('crash-fixture', process.argv[1]); process.stdout.write('ready'); setInterval(()=>{},1000)`, dir],
      { stdio: ['ignore', 'pipe', 'pipe'] })
    try {
      await once(child.stdout!, 'data')
      expect(() => acquireElectronOwner('contender', dir)).toThrow('electron_owner_busy')
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited
      expect(JSON.parse(await readFile(dir + '.json', 'utf8')).owner).toBe('crash-fixture')
      const release = acquireElectronOwner('after-crash', dir)
      try { expect(JSON.parse(await readFile(dir + '.json', 'utf8')).owner).toBe('after-crash') } finally { release() }
    } finally { child.kill('SIGKILL') }
  })
})
