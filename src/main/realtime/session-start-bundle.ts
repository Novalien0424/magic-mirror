import type {
  ClientSecretBroker,
  ClientSecretIssueResult,
} from './client-secret-broker'
import type { SessionModelSnapshot } from '../../shared/types'
import type { AvatarSessionSettings } from '../../shared/avatar-prompt'

export interface RealtimeSessionIdentity {
  readonly realtimeSessionId: string
  readonly sessionGeneration: number
}

export interface RealtimeSessionStartBundleIssuerOptions {
  readonly getAvatarSettings?: () => Readonly<AvatarSessionSettings>
  readonly getPublishedSessionModelSnapshot: () => Readonly<SessionModelSnapshot>
  readonly getRealtimeSessionIdentity: () => Readonly<RealtimeSessionIdentity>
  readonly broker: Pick<ClientSecretBroker, 'issue'>
}

export interface RealtimeSessionStartBundle {
  readonly avatar?: Readonly<AvatarSessionSettings>
  readonly snapshot: Readonly<SessionModelSnapshot>
  readonly identity: Readonly<RealtimeSessionIdentity>
  readonly clientSecret: ClientSecretIssueResult
}

export interface RealtimeSessionStartBundleIssuer {
  issue(): Promise<Readonly<RealtimeSessionStartBundle>>
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}

export function createRealtimeSessionStartBundleIssuer(
  options: RealtimeSessionStartBundleIssuerOptions,
): RealtimeSessionStartBundleIssuer {
  return {
    async issue(): Promise<Readonly<RealtimeSessionStartBundle>> {
      const snapshot = deepFreeze(structuredClone(options.getPublishedSessionModelSnapshot()))
      const identity = Object.freeze({ ...options.getRealtimeSessionIdentity() })
      const avatar = options.getAvatarSettings ? Object.freeze({ ...options.getAvatarSettings() }) : undefined
      const brokerResult = await options.broker.issue({
        modelId: snapshot.realtimeDialogue,
      })
      const clientSecret = Object.freeze({ ...brokerResult })
      return Object.freeze({ snapshot, identity, clientSecret, ...(avatar ? { avatar } : {}) })
    },
  }
}
