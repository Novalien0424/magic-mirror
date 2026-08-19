import type { AppSnapshot, SimulatorCommand, SimulatorResult } from './types'

export type MirrorWindowKind = 'mirror' | 'console'

export type BootChannel = 'boot:renderer-ready'
export const BOOT_RENDERER_READY_CHANNEL: BootChannel = 'boot:renderer-ready'

export interface MirrorChannelMap {
  readonly getSnapshot: 'mirror:get-snapshot'
  readonly snapshot: 'mirror:snapshot'
  readonly ready: BootChannel
}

export interface ConsoleChannelMap {
  readonly getSnapshot: 'console:get-snapshot'
  readonly snapshot: 'console:snapshot'
  readonly simulate: 'console:simulate'
  readonly ready: BootChannel
}

export type SnapshotListener = (snapshot: AppSnapshot) => void

export interface MirrorBridge {
  notifyReady(): void
  getSnapshot(): Promise<AppSnapshot>
  onSnapshot(listener: SnapshotListener): () => void
}

export interface ConsoleBridge extends MirrorBridge {
  simulate(command: SimulatorCommand): Promise<SimulatorResult>
}

/** Compatibility alias for code that only needs the shared renderer surface. */
export type BootBridge = MirrorBridge | ConsoleBridge

declare global {
  interface Window {
    /** Absent when the preload failed; renderers must keep a visible fallback. */
    readonly magicMirror?: BootBridge
  }
}
