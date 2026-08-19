import { describe, expect, it } from 'vitest'

import {
  MIRROR_STATE_COPY,
  projectMirrorSnapshot,
} from '../../src/renderer/mirror/App'
import { ErrorBoundary } from '../../src/renderer/shared/ErrorBoundary'

const RAW_ERROR_MESSAGE = 'synthetic-render-error-message'
const RAW_ERROR_STACK = 'synthetic-render-error-stack'
const RAW_TRANSCRIPT = 'synthetic-transcript-content'
const RAW_AUDIO = 'synthetic-audio-content'
const RAW_MEMORY = 'synthetic-memory-value'
const RAW_PRIVATE_CONTEXT = 'synthetic-private-context'
const RAW_MODEL_ID = 'synthetic-renderer-model-id'
const RAW_PROFILE_ID = 'synthetic-renderer-profile-id'
const RAW_GUEST_ID = 'synthetic-renderer-guest-id'
const RAW_CANDIDATE_ID = 'synthetic-renderer-candidate-id'

const EXPECTED_COPY = {
  starting: { title: 'Starting', detail: 'Preparing the local mirror.' },
  dormant: { title: 'Dormant', detail: 'Waiting for the wake word.' },
  activating: { title: 'Activating', detail: 'Waking the mirror.' },
  active: { title: 'Active', detail: 'Ready for conversation.' },
  suspending: { title: 'Suspending', detail: 'Returning to sleep.' },
  offlineLoop: {
    title: 'OfflineLoop',
    detail: 'Cloud unavailable; local fallback is playing.',
  },
  maintenance: {
    title: 'Maintenance',
    detail: 'Local service unavailable; see the Console.',
  },
} as const

type LifecycleState = keyof typeof EXPECTED_COPY

function baseSnapshot(state: LifecycleState): Record<string, unknown> {
  return {
    lifecycle: state,
    appVersion: 'synthetic-app-version',
    buildCommit: 'synthetic-build-commit',
    configVersion: 7,
    modules: {},
    identityStatus: 'unassigned',
    realtimeSessionId: null,
    sessionGeneration: 0,
    lastError: null,
    maintenance: null,
  }
}

function project(snapshot: unknown, options?: unknown): Record<string, unknown> {
  return (projectMirrorSnapshot as unknown as (
    value: unknown,
    projectionOptions?: unknown,
  ) => Record<string, unknown>)(snapshot, options)
}

function serialized(value: unknown): string {
  return JSON.stringify(value)
}

function expectNoForbiddenContent(value: unknown): void {
  const encoded = serialized(value)
  for (const sentinel of [
    RAW_TRANSCRIPT,
    RAW_AUDIO,
    RAW_MEMORY,
    RAW_PRIVATE_CONTEXT,
    RAW_MODEL_ID,
    RAW_PROFILE_ID,
    RAW_GUEST_ID,
    RAW_CANDIDATE_ID,
  ]) {
    expect(encoded).not.toContain(sentinel)
  }
}

function collectKeys(value: unknown, result: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, result)
    return result
  }
  if (typeof value !== 'object' || value === null) return result
  for (const [key, child] of Object.entries(value)) {
    result.push(key)
    collectKeys(child, result)
  }
  return result
}

describe('Mirror seven-state projection contract', () => {
  it('exports exactly seven nonblank lifecycle states with exact copy', () => {
    expect(MIRROR_STATE_COPY).toEqual(EXPECTED_COPY)
    expect(Object.keys(MIRROR_STATE_COPY).sort()).toEqual(Object.keys(EXPECTED_COPY).sort())
    for (const state of Object.keys(EXPECTED_COPY) as LifecycleState[]) {
      expect(MIRROR_STATE_COPY[state].title.trim().length).toBeGreaterThan(0)
      expect(MIRROR_STATE_COPY[state].detail.trim().length).toBeGreaterThan(0)
    }
  })

  it.each(Object.keys(EXPECTED_COPY) as LifecycleState[]) (
    'maps %s to the screen class and exact visible copy',
    (state) => {
      const view = project(baseSnapshot(state))

      expect(view).toEqual(expect.objectContaining({
        state,
        className: `screen screen--${state}`,
        title: EXPECTED_COPY[state].title,
        detail: EXPECTED_COPY[state].detail,
      }))
      expect(String(view.title).trim().length).toBeGreaterThan(0)
      expect(String(view.detail).trim().length).toBeGreaterThan(0)
    },
  )

  it('keeps OfflineLoop and Maintenance visible and reasoned', () => {
    const offline = project(baseSnapshot('offlineLoop'))
    const maintenance = project({
      ...baseSnapshot('maintenance'),
      maintenance: {
        code: 'sqlite_open_failed',
        detail: 'synthetic-maintenance-reason',
      },
    })

    expect(offline).toEqual(expect.objectContaining({
      className: 'screen screen--offlineLoop',
      title: 'OfflineLoop',
      detail: EXPECTED_COPY.offlineLoop.detail,
    }))
    expect(maintenance.className).toBe('screen screen--maintenance')
    expect(maintenance.title).toBe('Maintenance')
    expect(String(maintenance.detail)).toContain('sqlite_open_failed')
    expect(String(maintenance.detail).trim().length).toBeGreaterThan(0)
  })

  it('keeps Main snapshot state authoritative and renders a stable offline asset fallback', () => {
    const starting = project(baseSnapshot('starting'))
    const dormant = project(baseSnapshot('dormant'))
    const unavailableOffline = project(baseSnapshot('offlineLoop'), {
      offlineAssetAvailable: false,
    })

    expect(starting.state).toBe('starting')
    expect(starting.className).toBe('screen screen--starting')
    expect(dormant.state).toBe('dormant')
    expect(dormant.className).toBe('screen screen--dormant')
    expect(dormant.state).not.toBe(starting.state)
    expect(unavailableOffline).toEqual(expect.objectContaining({
      state: 'offlineLoop',
      className: 'screen screen--offlineLoop',
      title: 'OfflineLoop',
      detail: 'offline_loop_asset_unavailable',
    }))
    expect(String(unavailableOffline.detail).trim().length).toBeGreaterThan(0)
    expectNoForbiddenContent({ starting, dormant, unavailableOffline })
  })

  it('projects only renderer-safe identifiers and content-free metadata', () => {
    const view = project({
      ...baseSnapshot('active'),
      activeProfileId: RAW_PROFILE_ID,
      guestId: RAW_GUEST_ID,
      candidateProfileId: RAW_CANDIDATE_ID,
      modelId: RAW_MODEL_ID,
      transcript: RAW_TRANSCRIPT,
      audio: RAW_AUDIO,
      memoryValue: RAW_MEMORY,
      privateContext: RAW_PRIVATE_CONTEXT,
      credential: 'synthetic-credential',
      image: 'synthetic-image',
      embedding: 'synthetic-embedding',
    })

    expectNoForbiddenContent(view)
    expect(collectKeys(view).some((key) =>
      /guest|profile|candidate|credential|model|transcript|audio|memory|private|image|embedding/i.test(key),
    )).toBe(false)
    expect(view.className).toBe('screen screen--active')
    expect(String(view.title).trim().length).toBeGreaterThan(0)
    expect(String(view.detail).trim().length).toBeGreaterThan(0)
  })
})

describe('Mirror ErrorBoundary stable failure contract', () => {
  it('derives and reports only stable renderer failure metadata', () => {
    const callbacks: unknown[] = []
    const boundary = new ErrorBoundary({
      label: 'mirror',
      children: null,
      onFailure: (failure: unknown) => callbacks.push(failure),
    } as never)

    boundary.componentDidCatch(
      new Error(RAW_ERROR_MESSAGE),
      { componentStack: RAW_ERROR_STACK } as never,
    )

    expect(callbacks).toEqual([{ code: 'renderer_boundary_failed', reason: 'render_exception' }])
    expectNoForbiddenContent(callbacks)
    expect(serialized(callbacks)).not.toContain(RAW_ERROR_MESSAGE)
    expect(serialized(callbacks)).not.toContain(RAW_ERROR_STACK)
  })

  it('renders a nonblank fallback containing only stable failure code and reason', () => {
    const boundary = new ErrorBoundary({
      label: 'mirror',
      children: null,
      onFailure: () => {},
    } as never)
    const derive = (ErrorBoundary as unknown as {
      getDerivedStateFromError(error: unknown): unknown
    }).getDerivedStateFromError
    ;(boundary as unknown as { state: unknown }).state = derive(new Error(RAW_ERROR_MESSAGE))
    const fallback = boundary.render()
    const encoded = serialized(fallback)

    expect(String(encoded).trim().length).toBeGreaterThan(0)
    expect(encoded).toContain('renderer_boundary_failed')
    expect(encoded).toContain('render_exception')
    expect(encoded).not.toContain(RAW_ERROR_MESSAGE)
    expect(encoded).not.toContain(RAW_ERROR_STACK)
  })
})
