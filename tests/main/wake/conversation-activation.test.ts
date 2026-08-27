import { describe, expect, it } from 'vitest'
import { createWakeConversationActivation } from '../../../src/main/wake/conversation-activation'

describe('wake conversation activation', () => {
  it('starts the existing conversation path only from Dormant', async () => {
    const calls: string[] = []
    const activation = createWakeConversationActivation({
      getLifecycle: () => 'dormant',
      startConversation: async () => {
        calls.push('start_conversation')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      reacquireWake: async () => {
        calls.push('wake_reacquire')
        return { status: 'success', reason: 'wake_microphone_acquired' }
      },
    })

    await expect(activation.handleWake()).resolves.toEqual({
      status: 'success',
      reason: 'runtime_command_delivered',
    })
    expect(calls).toEqual(['start_conversation'])
  })

  it('stays in OfflineLoop and reacquires local listening without starting cloud', async () => {
    const calls: string[] = []
    const activation = createWakeConversationActivation({
      getLifecycle: () => 'offlineLoop',
      startConversation: async () => {
        calls.push('start_conversation')
        return { status: 'success', reason: 'runtime_command_delivered' }
      },
      reacquireWake: async () => {
        calls.push('wake_reacquire')
        return { status: 'success', reason: 'wake_microphone_acquired' }
      },
    })

    await expect(activation.handleWake()).resolves.toEqual({
      status: 'degraded',
      reason: 'offline_loop_wake_acknowledged',
    })
    expect(calls).toEqual(['wake_reacquire'])
  })
})
