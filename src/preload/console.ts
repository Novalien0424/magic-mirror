import { contextBridge, ipcRenderer } from 'electron'
import { BOOT_RENDERER_READY_CHANNEL, type BootBridge } from '../shared/bridge'

const bridge: BootBridge = {
  window: 'console',
  notifyReady: () => ipcRenderer.send(BOOT_RENDERER_READY_CHANNEL)
}

contextBridge.exposeInMainWorld('magicMirror', bridge)
