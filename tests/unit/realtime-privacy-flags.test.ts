import { describe, expect, it } from 'vitest'

import { initializeRealtimePrivacyFlags } from '../../src/main/boot'

const REQUIRED_PRIVACY_FLAGS = {
  OPENAI_AGENTS_DISABLE_TRACING: '1',
  OPENAI_AGENTS_DONT_LOG_MODEL_DATA: '1',
  OPENAI_AGENTS_DONT_LOG_TOOL_DATA: '1',
} as const

describe('P1-U2 Realtime privacy flags RED contract', () => {
  it('establishes all Main privacy flags before synthetic SDK-use composition', () => {
    const environment: Record<string, string | undefined> = {
      OPENAI_AGENTS_DISABLE_TRACING: '0',
      OPENAI_AGENTS_DONT_LOG_MODEL_DATA: undefined,
      OPENAI_AGENTS_DONT_LOG_TOOL_DATA: 'unsafe-value',
      RETAINED_SYNTHETIC_SETTING: 'keep',
    }

    initializeRealtimePrivacyFlags(environment)

    const composeSyntheticSdkUse = () => ({
      tracingDisabled: environment.OPENAI_AGENTS_DISABLE_TRACING,
      modelDataLogging: environment.OPENAI_AGENTS_DONT_LOG_MODEL_DATA,
      toolDataLogging: environment.OPENAI_AGENTS_DONT_LOG_TOOL_DATA,
    })

    expect(composeSyntheticSdkUse()).toEqual({
      tracingDisabled: REQUIRED_PRIVACY_FLAGS.OPENAI_AGENTS_DISABLE_TRACING,
      modelDataLogging: REQUIRED_PRIVACY_FLAGS.OPENAI_AGENTS_DONT_LOG_MODEL_DATA,
      toolDataLogging: REQUIRED_PRIVACY_FLAGS.OPENAI_AGENTS_DONT_LOG_TOOL_DATA,
    })
    expect(environment.RETAINED_SYNTHETIC_SETTING).toBe('keep')
  })

  it('is safe to call before each future broker/session composition and never enables agent debug logging', () => {
    const environment: Record<string, string | undefined> = {
      DEBUG: undefined,
    }

    initializeRealtimePrivacyFlags(environment)
    const firstSnapshot = { ...environment }
    initializeRealtimePrivacyFlags(environment)

    expect(environment).toMatchObject(REQUIRED_PRIVACY_FLAGS)
    expect(environment.DEBUG).not.toBe('openai-agents*')
    expect({
      first: firstSnapshot.OPENAI_AGENTS_DISABLE_TRACING,
      second: environment.OPENAI_AGENTS_DISABLE_TRACING,
    }).toEqual({ first: '1', second: '1' })
  })
})
