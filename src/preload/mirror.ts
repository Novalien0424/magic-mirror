import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppSnapshot } from '../shared/types'
import type { MirrorBridge, SnapshotListener } from '../shared/bridge'

// Smoke-contract failure switch: a missing bridge remains visible in the renderer.
if (process.env['MIRROR_FORCE_RENDERER_FAIL'] === '1') {
  throw new Error('MIRROR_FORCE_RENDERER_FAIL=1 mirror preload aborted deliberately')
}

const READY_CHANNEL = 'boot:renderer-ready' as const
const SNAPSHOT_CHANNEL = 'mirror:snapshot' as const
const GET_SNAPSHOT_CHANNEL = 'mirror:get-snapshot' as const

const bridge: MirrorBridge = {
  notifyReady(): void {
    ipcRenderer.send(READY_CHANNEL)
  },

  getSnapshot(): Promise<AppSnapshot> {
    return ipcRenderer.invoke(GET_SNAPSHOT_CHANNEL) as Promise<AppSnapshot>
  },

  onSnapshot(listener: SnapshotListener): () => void {
    const handler = (_event: IpcRendererEvent, snapshot: AppSnapshot): void => {
      listener(snapshot)
    }
    ipcRenderer.on(SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SNAPSHOT_CHANNEL, handler)
  },
}

contextBridge.exposeInMainWorld('magicMirror', bridge)
