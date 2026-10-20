import { readFileSync } from 'node:fs'
import type { MirrorMode } from '../shared/portrait-studio'
const writeFileAtomic = require('write-file-atomic') as { sync(path: string, value: string, options?: { mode: number }): void }

export type MirrorModeSource = 'console' | 'operator'

/**
 * The Mirror's explicit experience switch: normal conversation or Interactive
 * Studio. Main owns it and persists it; avatars only supply studio content.
 */
export function createMirrorMode(input: { path: string; report(reason: string): void }) {
  let mode: MirrorMode = 'conversation'
  try {
    const saved = JSON.parse(readFileSync(input.path, 'utf8'))
    if (saved.version !== 1 || (saved.mode !== 'conversation' && saved.mode !== 'studio')) throw Error()
    mode = saved.mode
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') input.report('mirror_mode_unreadable') }
  const listeners = new Set<(mode: MirrorMode, previous: MirrorMode, source: MirrorModeSource) => void>()
  let captured: { key: string; mode: MirrorMode } | null = null
  return {
    get: (): MirrorMode => mode,
    /**
     * The mode a woken session started with, captured on first use, so the
     * renderer's greeting and Main's studio start can never disagree.
     */
    sessionMode(identity: { realtimeSessionId: string; sessionGeneration: number }): MirrorMode {
      const key = `${identity.realtimeSessionId}#${identity.sessionGeneration}`
      if (captured?.key !== key) captured = { key, mode }
      return captured.mode
    },
    /** Persists first; a failed save keeps the previous mode and returns false. */
    set(next: MirrorMode, source: MirrorModeSource): boolean {
      if (next === mode) return true
      try { writeFileAtomic.sync(input.path, JSON.stringify({ version: 1, mode: next }), { mode: 0o600 }) }
      catch { input.report('mirror_mode_save_failed'); return false }
      const previous = mode
      mode = next
      input.report(`mirror_mode_${next}_${source}`)
      for (const listener of listeners) {
        try { listener(next, previous, source) } catch { input.report('mirror_mode_listener_failed') }
      }
      return true
    },
    subscribe(listener: (mode: MirrorMode, previous: MirrorMode, source: MirrorModeSource) => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export type MirrorModeStore = ReturnType<typeof createMirrorMode>
