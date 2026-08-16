import { describe, expect, it } from 'vitest'
import { createCrashRecovery } from '../../src/main/crash-recovery'

describe('createCrashRecovery', () => {
  it('recreates a crashed window once', () => {
    const recovery = createCrashRecovery()

    expect(recovery.decide({ window: 'mirror', reason: 'crashed', exitCode: 133 })).toEqual({
      action: 'recreate',
      attempt: 1
    })
  })

  it('gives up after the recreate budget is spent instead of looping', () => {
    const recovery = createCrashRecovery()
    recovery.decide({ window: 'mirror', reason: 'crashed', exitCode: 133 })

    expect(recovery.decide({ window: 'mirror', reason: 'oom', exitCode: 5 })).toEqual({
      action: 'give_up',
      attempt: 2,
      reason: 'recreate_limit_exhausted'
    })
  })

  it('budgets each window separately', () => {
    const recovery = createCrashRecovery()
    recovery.decide({ window: 'mirror', reason: 'crashed', exitCode: 133 })

    expect(recovery.decide({ window: 'console', reason: 'crashed', exitCode: 133 })).toEqual({
      action: 'recreate',
      attempt: 1
    })
  })

  it('ignores a clean exit and does not spend the budget on it', () => {
    const recovery = createCrashRecovery()

    expect(recovery.decide({ window: 'mirror', reason: 'clean-exit', exitCode: 0 })).toEqual({ action: 'ignore' })
    expect(recovery.decide({ window: 'mirror', reason: 'crashed', exitCode: 133 })).toEqual({
      action: 'recreate',
      attempt: 1
    })
  })

  it('honours a wider budget when one is configured', () => {
    const recovery = createCrashRecovery(2)
    recovery.decide({ window: 'mirror', reason: 'crashed', exitCode: 133 })

    expect(recovery.decide({ window: 'mirror', reason: 'crashed', exitCode: 133 })).toEqual({
      action: 'recreate',
      attempt: 2
    })
    expect(recovery.decide({ window: 'mirror', reason: 'crashed', exitCode: 133 })).toEqual({
      action: 'give_up',
      attempt: 3,
      reason: 'recreate_limit_exhausted'
    })
  })
})
