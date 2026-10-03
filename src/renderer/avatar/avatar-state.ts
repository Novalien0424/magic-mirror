import type { LifecycleState } from '../../shared/types'

export type AvatarState =
  | 'Dormant'
  | 'Waking'
  | 'Listening'
  | 'Thinking'
  | 'Speaking'
  | 'Scene'
  | 'Suspending'
  | 'OfflineLoop'

export type AvatarConversationState =
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'scene'

export interface AvatarStateProjectionInput {
  readonly lifecycle: LifecycleState
  readonly conversation?: AvatarConversationState
}

export function projectAvatarState(
  input: AvatarStateProjectionInput,
): AvatarState | null {
  switch (input.lifecycle) {
    case 'dormant': return 'Dormant'
    case 'activating': return 'Waking'
    case 'suspending': return 'Suspending'
    case 'offlineLoop': return 'OfflineLoop'
    case 'active': {
      switch (input.conversation) {
        case 'thinking': return 'Thinking'
        case 'speaking': return 'Speaking'
        case 'scene': return 'Scene'
        default: return 'Listening'
      }
    }
    case 'starting':
    case 'maintenance':
      return null
  }
}
