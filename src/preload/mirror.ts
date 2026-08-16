import { contextBridge, ipcRenderer } from 'electron'
import type { BootBridge, BootChannel } from '../shared/bridge'

// Sandboxed preloads cannot `require` relative files, so this file must bundle to a
// single self-contained chunk: type-only imports from shared/ are the only ones allowed.
// Smoke-contract failure switch: proves the app fails visibly (exit 2, Starting screen
// with a bridge warning) instead of hanging on a blank window when a preload dies.
if (process.env['MIRROR_FORCE_RENDERER_FAIL'] === '1') {
  throw new Error('MIRROR_FORCE_RENDERER_FAIL=1 mirror preload aborted deliberately')
}

const READY_CHANNEL: BootChannel = 'boot:renderer-ready'

const bridge: BootBridge = {
  window: 'mirror',
  notifyReady: () => ipcRenderer.send(READY_CHANNEL)
}

contextBridge.exposeInMainWorld('magicMirror', bridge)
