import type {
  ClientSecretBroker,
  ClientSecretIssueResult,
} from './client-secret-broker'
import type { SessionModelSnapshot } from '../../shared/types'

export interface RealtimeSessionIdentity {
  readonly realtimeSessionId: string
  readonly sessionGeneration: number
}

export interface RealtimeSessionStartBundleIssuerOptions {
  readonly getPublishedSessionModelSnapshot: () => Readonly<SessionModelSnapshot>
  readonly getRealtimeSessionIdentity: () => Readonly<RealtimeSessionIdentity>
  readonly broker: Pick<ClientSecretBroker, 'issue'>
}

export interface RealtimeSessionStartBundle {
  readonly snapshot: Readonly<SessionModelSnapshot>
  readonly identity: Readonly<RealtimeSessionIdentity>
  readonly clientSecret: ClientSecretIssueResult
}

export interface RealtimeSessionStartBundleIssuer {
  issue(): Promise<Readonly<RealtimeSessionStartBundle>>
}

export function createRealtimeSessionStartBundleIssuer(
  options: RealtimeSessionStartBundleIssuerOptions,
): RealtimeSessionStartBundleIssuer {
  return {
    async issue(): Promise<Readonly<RealtimeSessionStartBundle>> {
      const snapshot = Object.freeze({ ...options.getPublishedSessionModelSnapshot() })
      const identity = Object.freeze({ ...options.getRealtimeSessionIdentity() })
      const brokerResult = await options.broker.issue({
        modelId: snapshot.realtimeDialogue,
      })
      const clientSecret = Object.freeze({ ...brokerResult })
      return Object.freeze({ snapshot, identity, clientSecret })
    },
  }
}
