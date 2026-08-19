import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppSnapshot, SimulatorCommand, SimulatorResult } from '../shared/types'
import type {
  ConsoleEventsPage,
  ConsoleEventsQuery,
  ConsoleOverviewPayload,
  ConsoleResponse,
} from '../shared/console-types'
import type { ConsoleBridge, SnapshotListener } from '../shared/bridge'

const READY_CHANNEL = 'boot:renderer-ready' as const
const SNAPSHOT_CHANNEL = 'console:snapshot' as const
const GET_SNAPSHOT_CHANNEL = 'console:get-snapshot' as const
const SIMULATE_CHANNEL = 'console:simulate' as const
const GET_OVERVIEW_CHANNEL = 'console:get-overview' as const
const GET_EVENTS_CHANNEL = 'console:get-events' as const

const bridge: ConsoleBridge = {
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

  simulate(command: SimulatorCommand): Promise<SimulatorResult> {
    return ipcRenderer.invoke(SIMULATE_CHANNEL, command) as Promise<SimulatorResult>
  },

  getOverview(): Promise<ConsoleResponse<ConsoleOverviewPayload>> {
    return ipcRenderer.invoke(GET_OVERVIEW_CHANNEL) as Promise<ConsoleResponse<ConsoleOverviewPayload>>
  },

  getEvents(request?: ConsoleEventsQuery): Promise<ConsoleResponse<ConsoleEventsPage>> {
    return ipcRenderer.invoke(GET_EVENTS_CHANNEL, request) as Promise<ConsoleResponse<ConsoleEventsPage>>
  },
}

contextBridge.exposeInMainWorld('magicMirror', bridge)
