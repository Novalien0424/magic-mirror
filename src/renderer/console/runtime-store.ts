import type { AvatarRuntimeSnapshot } from '../../shared/bridge'

export type AvatarRuntimeState = { status: 'loading' }
  | { status: 'success'; value: AvatarRuntimeSnapshot }
  | { status: 'failure'; error: string; reason: string }

/** The status strip and Devices subscribe; live meters never rerender editors. */
export function createConsoleRuntimeStore() {
  let state: AvatarRuntimeState = { status: 'loading' }, fingerprint = JSON.stringify(state)
  const listeners = new Set<() => void>()
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next: AvatarRuntimeState) {
      const key = JSON.stringify(next)
      if (key === fingerprint) return
      state = next; fingerprint = key
      for (const listener of listeners) listener()
    },
  }
}
export type ConsoleRuntimeStore = ReturnType<typeof createConsoleRuntimeStore>
