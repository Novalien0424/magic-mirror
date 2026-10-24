import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsoleBridge } from '../../src/shared/bridge'

const ipc = vi.hoisted(() => ({ invoke: vi.fn(async () => ({ ok: true, value: { nameMatches: ['Amy'] } })), expose: vi.fn() }))
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: ipc.expose }, ipcRenderer: { invoke: ipc.invoke } }))
import '../../src/preload/console'

const bridge = ipc.expose.mock.calls[0]![1] as ConsoleBridge
beforeEach(() => ipc.invoke.mockClear())

describe('Console guest-name preview preload', () => {
  it('forwards an unsaved alias preview to Main and returns its shortlist', async () => {
    const command = { action: 'match_name' as const, name: '艾米', guests: { names: ['Amy'], match: 'prefer' as const, aliases: [{ name: 'Amy', aliases: ['艾米'] }] } }
    expect(await bridge.studio!(command)).toMatchObject({ ok: true, value: { nameMatches: ['Amy'] } })
    expect(ipc.invoke).toHaveBeenCalledWith('console:studio', command)
  })
  it('rejects missing arguments before IPC', async () => {
    expect(await bridge.studio!({ action: 'match_name' } as never)).toMatchObject({ ok: false })
    expect(ipc.invoke).not.toHaveBeenCalled()
  })
})
