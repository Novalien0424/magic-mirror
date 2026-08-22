import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { AppSnapshot } from '../shared/types'
import type {
  MirrorBridge,
  RealtimeSessionStartBundleValue,
  SnapshotListener,
  TransientRealtimeSecretResult,
} from '../shared/bridge'

// Smoke-contract failure switch: a missing bridge remains visible in the renderer.
if (process.env['MIRROR_FORCE_RENDERER_FAIL'] === '1') {
  throw new Error('MIRROR_FORCE_RENDERER_FAIL=1 mirror preload aborted deliberately')
}

const READY_CHANNEL = 'boot:renderer-ready' as const
const SNAPSHOT_CHANNEL = 'mirror:snapshot' as const
const GET_SNAPSHOT_CHANNEL = 'mirror:get-snapshot' as const
const REQUEST_REALTIME_CLIENT_SECRET_CHANNEL = 'mirror:request-realtime-client-secret' as const
const INTERRUPT_CHANNEL = 'mirror:interrupt' as const

const SESSION_SNAPSHOT_KEYS = [
  'configVersion',
  'fingerprint',
  'sdkVersion',
  'realtimeDialogue',
  'inputTranscription',
  'memoryExtractor',
  'voice',
  'reasoningEffort',
  'turnDetectionProfile',
  'takenAt',
] as const

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  if (!isRecord(value)) return false
  try {
    const keys = Reflect.ownKeys(value)
    return keys.length === expected.length
      && keys.every((key) => typeof key === 'string' && expected.includes(key))
      && expected.every((key) => keys.includes(key))
  } catch {
    return false
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidSessionStartBundleValue(value: unknown): value is RealtimeSessionStartBundleValue {
  if (!isRecord(value)) return false
  const hasExpiry = exactKeys(value, ['snapshot', 'identity', 'clientSecret', 'expiresAt'])
  if (!hasExpiry && !exactKeys(value, ['snapshot', 'identity', 'clientSecret'])) return false

  const snapshot = readProperty(value, 'snapshot')
  if (!isRecord(snapshot) || !exactKeys(snapshot, SESSION_SNAPSHOT_KEYS)) return false
  if (
    typeof readProperty(snapshot, 'configVersion') !== 'number'
    || !Number.isSafeInteger(readProperty(snapshot, 'configVersion'))
    || (readProperty(snapshot, 'configVersion') as number) < 1
    || !nonEmptyString(readProperty(snapshot, 'sdkVersion'))
  ) {
    return false
  }
  for (const key of SESSION_SNAPSHOT_KEYS) {
    if (key === 'configVersion' || key === 'sdkVersion') continue
    if (!nonEmptyString(readProperty(snapshot, key))) return false
  }

  const identity = readProperty(value, 'identity')
  if (
    !isRecord(identity)
    || !exactKeys(identity, ['realtimeSessionId', 'sessionGeneration'])
    || !nonEmptyString(readProperty(identity, 'realtimeSessionId'))
    || typeof readProperty(identity, 'sessionGeneration') !== 'number'
    || !Number.isSafeInteger(readProperty(identity, 'sessionGeneration'))
    || (readProperty(identity, 'sessionGeneration') as number) < 0
  ) {
    return false
  }

  const clientSecret = readProperty(value, 'clientSecret')
  if (typeof clientSecret !== 'string' || !clientSecret.startsWith('ek_') || clientSecret.length <= 3) {
    return false
  }
  const expiresAt = readProperty(value, 'expiresAt')
  return !hasExpiry || (
    typeof expiresAt === 'number'
    && Number.isSafeInteger(expiresAt)
  )
}

function invalidRealtimeSecretResult(): TransientRealtimeSecretResult {
  return Object.freeze({ status: 'rejected', reason: 'invalid_payload' })
}

function sanitizeSessionStartBundleValue(value: unknown): RealtimeSessionStartBundleValue {
  const snapshot = readProperty(value, 'snapshot')
  const identity = readProperty(value, 'identity')
  const sanitizedSnapshot = Object.freeze({
    configVersion: readProperty(snapshot, 'configVersion') as number,
    fingerprint: readProperty(snapshot, 'fingerprint') as string,
    sdkVersion: readProperty(snapshot, 'sdkVersion') as RealtimeSessionStartBundleValue['snapshot']['sdkVersion'],
    realtimeDialogue: readProperty(snapshot, 'realtimeDialogue') as string,
    inputTranscription: readProperty(snapshot, 'inputTranscription') as string,
    memoryExtractor: readProperty(snapshot, 'memoryExtractor') as string,
    voice: readProperty(snapshot, 'voice') as string,
    reasoningEffort: readProperty(snapshot, 'reasoningEffort') as string,
    turnDetectionProfile: readProperty(snapshot, 'turnDetectionProfile') as string,
    takenAt: readProperty(snapshot, 'takenAt') as string,
  })
  const sanitizedIdentity = Object.freeze({
    realtimeSessionId: readProperty(identity, 'realtimeSessionId') as string,
    sessionGeneration: readProperty(identity, 'sessionGeneration') as number,
  })
  const clientSecret = readProperty(value, 'clientSecret') as RealtimeSessionStartBundleValue['clientSecret']
  const expiresAt = readProperty(value, 'expiresAt')
  const sanitizedValue = expiresAt === undefined
    ? { snapshot: sanitizedSnapshot, identity: sanitizedIdentity, clientSecret }
    : { snapshot: sanitizedSnapshot, identity: sanitizedIdentity, clientSecret, expiresAt: expiresAt as number }
  return Object.freeze(sanitizedValue)
}

function validateRealtimeSecretResult(value: unknown): TransientRealtimeSecretResult {
  const status = readProperty(value, 'status')
  if (status === 'accepted') {
    if (
      !exactKeys(value, ['status', 'reason', 'value'])
      || readProperty(value, 'reason') !== 'mirror_authorized'
      || !isValidSessionStartBundleValue(readProperty(value, 'value'))
    ) {
      return invalidRealtimeSecretResult()
    }
    return Object.freeze({
      status: 'accepted',
      reason: 'mirror_authorized',
      value: sanitizeSessionStartBundleValue(readProperty(value, 'value')),
    })
  }

  const rejectedReasons = new Set([
    'unauthorized_sender',
    'broker_unavailable',
    'broker_failed',
    'session_unavailable',
    'invalid_payload',
  ])
  if (
    status !== 'rejected'
    || !exactKeys(value, ['status', 'reason'])
    || !rejectedReasons.has(readProperty(value, 'reason') as string)
  ) {
    return invalidRealtimeSecretResult()
  }
  return Object.freeze({
    status: 'rejected',
    reason: readProperty(value, 'reason') as
      | 'unauthorized_sender'
      | 'broker_unavailable'
      | 'broker_failed'
      | 'session_unavailable'
      | 'invalid_payload',
  })
}

const bridge: MirrorBridge = {
  notifyReady(): void {
    ipcRenderer.send(READY_CHANNEL)
  },

  getSnapshot(): Promise<AppSnapshot> {
    return ipcRenderer.invoke(GET_SNAPSHOT_CHANNEL) as Promise<AppSnapshot>
  },

  async requestRealtimeClientSecret(): Promise<TransientRealtimeSecretResult> {
    const result: unknown = await ipcRenderer.invoke(REQUEST_REALTIME_CLIENT_SECRET_CHANNEL)
    return validateRealtimeSecretResult(result)
  },

  onInterrupt(listener: () => void): () => void {
    const handler = (_event: IpcRendererEvent): void => {
      listener()
    }
    ipcRenderer.on(INTERRUPT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(INTERRUPT_CHANNEL, handler)
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
