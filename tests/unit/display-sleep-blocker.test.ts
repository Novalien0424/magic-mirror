import { describe, expect, it } from 'vitest'

import {
  createDisplaySleepBlocker,
  type DisplaySleepBlocker,
  type DisplaySleepBlockerEvent,
  type DisplaySleepBlockerStatus,
  type PowerSaveBlockerPort,
} from '../../src/main/display-sleep-blocker'

const BLOCKER_ID = 731
const RAW_START_SENTINEL = 'raw-display-sleep-start-sentinel'
const RAW_STATUS_SENTINEL = 'raw-display-sleep-status-sentinel'
const RAW_STOP_SENTINEL = 'raw-display-sleep-stop-sentinel'

const FAILURE_REASONS = {
  start: 'display_sleep_start_failed',
  inactive: 'display_sleep_not_active',
  status: 'display_sleep_status_failed',
  stop: 'display_sleep_stop_failed',
} as const

type PortOverrides = {
  readonly start?: PowerSaveBlockerPort['start']
  readonly isStarted?: PowerSaveBlockerPort['isStarted']
  readonly stop?: PowerSaveBlockerPort['stop']
}

interface PortHarness {
  readonly api: PowerSaveBlockerPort
  readonly startTypes: string[]
  readonly isStartedIds: number[]
  readonly stopIds: number[]
}

function makePort(overrides: PortOverrides = {}): PortHarness {
  const startTypes: string[] = []
  const isStartedIds: number[] = []
  const stopIds: number[] = []

  const api: PowerSaveBlockerPort = {
    start(type) {
      startTypes.push(type)
      return overrides.start === undefined ? BLOCKER_ID : overrides.start(type)
    },
    isStarted(id) {
      isStartedIds.push(id)
      return overrides.isStarted === undefined ? true : overrides.isStarted(id)
    },
    stop(id) {
      stopIds.push(id)
      overrides.stop?.(id)
    },
  }

  return { api, startTypes, isStartedIds, stopIds }
}

function expectMetadataOnly(events: readonly DisplaySleepBlockerEvent[]): void {
  const allowedKeys = new Set(['action', 'status', 'reason'])
  const serialized = JSON.stringify(events)

  expect(serialized).not.toContain(String(BLOCKER_ID))
  for (const event of events) {
    expect(Object.keys(event).every((key) => allowedKeys.has(key))).toBe(true)
    expect(['start', 'status', 'stop']).toContain(event.action)
    expect(['not_started', 'active', 'degraded', 'stopped']).toContain(event.status)
  }
}

function expectSafeFailure(
  result: DisplaySleepBlockerStatus,
  events: readonly DisplaySleepBlockerEvent[],
  action: DisplaySleepBlockerEvent['action'],
  reason: string,
  rawSentinel: string,
): void {
  expect(['degraded', 'stopped']).toContain(result)
  expect(events).toContainEqual(expect.objectContaining({ action, status: result, reason }))

  const failureEvents = events.filter((event) => event.status === 'degraded' || event.status === 'stopped')
  expect(failureEvents.length).toBeGreaterThan(0)
  for (const event of failureEvents) expect(event.reason).toBe(reason)

  const serialized = JSON.stringify({ result, events })
  expect(serialized).not.toContain(rawSentinel)
  expect(serialized).not.toContain(String(BLOCKER_ID))
  expectMetadataOnly(events)
}

describe('Main-owned display-sleep blocker injected-port contract', () => {
  it('starts one blocker, retains its private ID, reports status, and stops idempotently', () => {
    const events: DisplaySleepBlockerEvent[] = []
    const port = makePort()
    const blocker: DisplaySleepBlocker = createDisplaySleepBlocker(port.api, (event) => events.push(event))

    expect(blocker.status()).toBe('not_started')

    expect(blocker.start()).toBe('active')
    const checksAfterStart = port.isStartedIds.length
    expect(checksAfterStart).toBeGreaterThan(0)
    expect(port.startTypes).toEqual(['prevent-display-sleep'])

    expect(blocker.start()).toBe('active')
    expect(blocker.status()).toBe('active')
    expect(blocker.stop()).toBe('stopped')
    expect(blocker.stop()).toBe('stopped')

    expect(port.startTypes).toHaveLength(1)
    expect(port.isStartedIds.length).toBeGreaterThanOrEqual(checksAfterStart)
    expect(port.isStartedIds.every((id) => id === BLOCKER_ID)).toBe(true)
    expect(port.stopIds).toEqual([BLOCKER_ID])
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'status', status: 'not_started' }),
      expect.objectContaining({ action: 'start', status: 'active' }),
      expect.objectContaining({ action: 'status', status: 'active' }),
      expect.objectContaining({ action: 'stop', status: 'stopped' }),
    ]))
    expectMetadataOnly(events)
  })

  it('degrades with a stable safe reason when start throws and does not retry', () => {
    const events: DisplaySleepBlockerEvent[] = []
    const port = makePort({
      start: () => {
        throw new Error(RAW_START_SENTINEL)
      },
    })
    const blocker = createDisplaySleepBlocker(port.api, (event) => events.push(event))

    const result = blocker.start()
    expect(blocker.start()).toBe(result)
    expect(port.startTypes).toEqual(['prevent-display-sleep'])
    expectSafeFailure(result, events, 'start', FAILURE_REASONS.start, RAW_START_SENTINEL)
  })

  it('degrades with a stable safe reason when the blocker is inactive immediately after start', () => {
    const events: DisplaySleepBlockerEvent[] = []
    const port = makePort({ isStarted: () => false })
    const blocker = createDisplaySleepBlocker(port.api, (event) => events.push(event))

    const result = blocker.start()
    expect(blocker.start()).toBe(result)
    expect(port.startTypes).toHaveLength(1)
    expect(port.isStartedIds).toEqual([BLOCKER_ID])
    expectSafeFailure(result, events, 'start', FAILURE_REASONS.inactive, 'inactive-blocker-sentinel')
  })

  it('degrades with a stable safe reason when status checking throws', () => {
    const events: DisplaySleepBlockerEvent[] = []
    let shouldThrow = false
    const port = makePort({
      isStarted: () => {
        if (shouldThrow) throw new Error(RAW_STATUS_SENTINEL)
        return true
      },
    })
    const blocker = createDisplaySleepBlocker(port.api, (event) => events.push(event))

    expect(blocker.start()).toBe('active')
    shouldThrow = true
    const result = blocker.status()

    expectSafeFailure(result, events, 'status', FAILURE_REASONS.status, RAW_STATUS_SENTINEL)
  })

  it('degrades or stops with a stable safe reason when stop throws and never stops twice', () => {
    const events: DisplaySleepBlockerEvent[] = []
    const port = makePort({
      stop: () => {
        throw new Error(RAW_STOP_SENTINEL)
      },
    })
    const blocker = createDisplaySleepBlocker(port.api, (event) => events.push(event))

    expect(blocker.start()).toBe('active')
    const result = blocker.stop()
    expect(blocker.stop()).toBe(result)
    expect(port.stopIds).toEqual([BLOCKER_ID])
    expectSafeFailure(result, events, 'stop', FAILURE_REASONS.stop, RAW_STOP_SENTINEL)
  })
})
