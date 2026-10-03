import type { LifecycleState } from '../../shared/types'

export type WakeConversationAction = Readonly<{
  status: 'success' | 'failed' | 'degraded' | 'ignored'
  reason: string
}>

export function createWakeConversationActivation(options: {
  readonly getLifecycle: () => LifecycleState
  readonly startConversation: () => PromiseLike<Record<string, unknown>>
  readonly reacquireWake: () => PromiseLike<{ readonly status: 'success' | 'failed'; readonly reason: string }>
}): { readonly handleWake: () => Promise<WakeConversationAction> } {
  return {
    async handleWake(): Promise<WakeConversationAction> {
      const lifecycle = options.getLifecycle()
      if (lifecycle === 'dormant') {
        const result = await Promise.resolve(options.startConversation())
        const status = result['status']
        const reason = result['reason']
        return Object.freeze({
          status: status === 'success' || status === 'failed' || status === 'degraded' || status === 'ignored'
            ? status
            : 'failed',
          reason: typeof reason === 'string' ? reason : 'wake_conversation_start_failed',
        })
      }
      if (lifecycle === 'offlineLoop') {
        const reacquired = await Promise.resolve(options.reacquireWake())
        return reacquired.status === 'success'
          ? Object.freeze({ status: 'degraded', reason: 'offline_loop_wake_acknowledged' })
          : Object.freeze({ status: 'failed', reason: 'wake_offline_reacquire_failed' })
      }
      return Object.freeze({ status: 'ignored', reason: 'wake_ignored_wrong_lifecycle' })
    },
  }
}
