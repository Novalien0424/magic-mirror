/**
 * Boot bridge: the only preload surface Task 1 owns. The typed application IPC
 * surface (state, console, simulator) arrives in Task 8 and lives in `src/main/ipc.ts`.
 */

export type MirrorWindowKind = 'mirror' | 'console';

/** Channel the renderer uses to tell Main "I mounted and painted a screen". */
export const BOOT_RENDERER_READY_CHANNEL = 'boot:renderer-ready';

export interface BootBridge {
  /**
   * Which window this bridge belongs to. Display/debug only — Main identifies the
   * sender by its `webContents`, never by a renderer-supplied value.
   */
  readonly window: MirrorWindowKind;
  /** Signals Main that the first screen is on the glass. */
  notifyReady(): void;
}

declare global {
  interface Window {
    /**
     * Absent when the preload failed to load. Renderers MUST degrade visibly
     * (invariant #9/#10: no silent failure, never a black screen).
     */
    readonly magicMirror?: BootBridge;
  }
}
