import { describe, expect, it } from 'vitest'

import { projectAvatarState } from '../../../src/renderer/avatar/avatar-state'

describe('projectAvatarState', () => {
  it.each([
    ['dormant', 'speaking', 'Dormant'],
    ['activating', 'speaking', 'Waking'],
    ['suspending', 'speaking', 'Suspending'],
    ['offlineLoop', 'speaking', 'OfflineLoop'],
    ['active', 'listening', 'Listening'],
    ['active', 'thinking', 'Thinking'],
    ['active', 'speaking', 'Speaking'],
    ['active', 'scene', 'Scene'],
  ] as const)('projects %s with %s to %s', (lifecycle, conversation, expected) => {
    expect(projectAvatarState({ lifecycle, conversation })).toBe(expected)
  })

  it('defaults an active conversation to Listening', () => {
    expect(projectAvatarState({ lifecycle: 'active' })).toBe('Listening')
  })

  it.each(['starting', 'maintenance'] as const)(
    'leaves %s to the existing non-avatar fallback',
    (lifecycle) => {
      expect(projectAvatarState({ lifecycle, conversation: 'speaking' })).toBeNull()
    },
  )
})
