import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startOperatorControl, type OperatorAction } from '../../src/main/operator-control'
import { sendQaOperatorCommand } from '../../src/main/operator-command-qa'

vi.mock('electron', () => ({ BrowserWindow: {}, screen: {} }))

const directories: string[] = [], stops: (() => void)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) stop()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function userData(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mm-operator-command-qa-'))
  directories.push(directory)
  return directory
}

async function leftovers(directory: string): Promise<string[]> {
  const control = join(directory, 'operator-control')
  return [...await readdir(join(control, 'requests')), ...await readdir(join(control, 'responses'))]
}

describe('QA operator mailbox client', () => {
  it.each(['show_console_main', 'music_loop'] as const)('runs %s through the production mailbox and cleans up', async action => {
    const directory = await userData(), actions: OperatorAction[] = []
    stops.push(await startOperatorControl({ directory: join(directory, 'operator-control'),
      execute: async action => { actions.push(action); return true }, report: () => undefined }))
    expect(await sendQaOperatorCommand(directory, action)).toBe('success')
    expect(actions).toEqual([action])
    expect(await leftovers(directory)).toEqual([])
  })

  it('reports a refused command as failed, the reply the Desktop app turns into an alert', async () => {
    const directory = await userData()
    stops.push(await startOperatorControl({ directory: join(directory, 'operator-control'),
      execute: async () => false, report: () => undefined }))
    expect(await sendQaOperatorCommand(directory, 'show_console_main')).toBe('failed')
    expect(await leftovers(directory)).toEqual([])
  })

  it('times out without a running app and leaves no request behind', async () => {
    const directory = await userData()
    await mkdir(join(directory, 'operator-control', 'requests'), { recursive: true })
    await mkdir(join(directory, 'operator-control', 'responses'), { recursive: true })
    expect(await sendQaOperatorCommand(directory, 'show_console', 300)).toBe('timeout')
    expect(await leftovers(directory)).toEqual([])
  })
})
