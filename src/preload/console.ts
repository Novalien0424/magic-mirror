import { contextBridge, ipcRenderer } from 'electron'
import type { BootBridge, BootChannel } from '../shared/bridge'

// Sandboxed preloads cannot `require` relative files, so this file must bundle to a
// single self-contained chunk: type-only imports from shared/ are the only ones allowed.
const READY_CHANNEL: BootChannel = 'boot:renderer-ready'

const bridge: BootBridge = {
  window: 'console',
  notifyReady: () => ipcRenderer.send(READY_CHANNEL)
}

contextBridge.exposeInMainWorld('magicMirror', bridge)
