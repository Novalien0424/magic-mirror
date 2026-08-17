import { describe, expect, it } from 'vitest';
import {
  createLifecycleActor,
  type LifecycleActor,
  type LifecycleContext,
  type LifecycleEvent,
  type LifecycleSnapshot,
  type LifecycleSubscription,
  type LifecycleTelemetry,
} from '../../src/main/lifecycle';
import type { LifecycleState, MirrorEvent } from '../../src/shared/types';

const exactLifecycleStateContract: Record<LifecycleState, true> = {
  starting: true,
  dormant: true,
  activating: true,
  active: true,
  suspending: true,
  offlineLoop: true,
  maintenance: true,
};

const exactLifecycleEventContract: Record<LifecycleEvent['type'], true> = {
  LOCAL_READY: true,
  LOCAL_CORE_FAILED: true,
  WAKE_DETECTED: true,
  REALTIME_READY: true,
  CLOUD_FAILED: true,
  LOCAL_AUDIO_FAILED: true,
  IDLE_TIMEOUT: true,
  SLEEP_REQUESTED: true,
  MEDIA_CLOSED: true,
  RECOVERY_PASSED: true,
  RETRY_STARTUP: true,
};

const exactInitialContextContract: LifecycleContext = {
  activationId: null,
  realtimeSessionId: null,
  sessionGeneration: 0,
  activeProfileId: null,
  lastInteractionAt: null,
  sceneInvocationId: null,
};

void exactLifecycleStateContract;
void exactLifecycleEventContract;
void exactInitialContextContract;

type TelemetryDouble = {
  actor: LifecycleActor;
  events: Array<Omit<MirrorEvent, 'time'>>;
};

const wake = (activationId = 'activation-1'): LifecycleEvent => ({
  type: 'WAKE_DETECTED',
  activationId,
  lastInteractionAt: '2026-08-17T00:00:00.000Z',
});

const realtimeReady = (realtimeSessionId = 'session-1'): LifecycleEvent => ({
  type: 'REALTIME_READY',
  realtimeSessionId,
});

const makeActor = (): TelemetryDouble => {
  const events: Array<Omit<MirrorEvent, 'time'>> = [];
  const telemetry: LifecycleTelemetry = {
    emit(event) {
      events.push(event);
    },
  };
  const actor = createLifecycleActor({
    telemetry,
  });
  return { actor, events };
};

const sendAll = (actor: LifecycleActor, events: readonly LifecycleEvent[]): void => {
  for (const event of events) {
    actor.send(event);
  }
};

const activeSetup = (): LifecycleEvent[] => [
  { type: 'LOCAL_READY' },
  wake(),
  realtimeReady(),
];

const actorAfter = (setup: readonly LifecycleEvent[]): TelemetryDouble => {
  const result = makeActor();
  sendAll(result.actor, setup);
  return result;
};

describe('Main-owned lifecycle state machine', () => {
  it('starts with the exact seven-state context contract', () => {
    const { actor } = makeActor();

    expect(actor.getState()).toBe('starting');
    expect(actor.getContext()).toEqual({
      activationId: null,
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: null,
      sceneInvocationId: null,
    });
  });

  it('walks the complete P0-D1 happy route and emits success transitions', () => {
    const { actor, events } = makeActor();

    sendAll(actor, [
      { type: 'LOCAL_READY' },
      wake(),
      realtimeReady(),
      { type: 'SLEEP_REQUESTED' },
      { type: 'MEDIA_CLOSED' },
    ]);

    expect(actor.getState()).toBe('dormant');
    expect(events.map((event) => event.event)).toEqual([
      'lifecycle_transition',
      'lifecycle_transition',
      'lifecycle_transition',
      'lifecycle_transition',
      'lifecycle_transition',
    ]);
    expect(events.map((event) => event.status)).toEqual([
      'success',
      'success',
      'success',
      'success',
      'success',
    ]);
    expect(events.map((event) => event.reason)).toEqual([
      'from=starting;to=dormant;event=LOCAL_READY;cause=local_essentials_ready',
      'from=dormant;to=activating;event=WAKE_DETECTED;cause=wake_word_detected',
      'from=activating;to=active;event=REALTIME_READY;cause=mic_and_realtime_ready',
      'from=active;to=suspending;event=SLEEP_REQUESTED;cause=sleep_requested',
      'from=suspending;to=dormant;event=MEDIA_CLOSED;cause=media_closed_and_wake_mic_ready',
    ]);
    expect(events.every((event) => event.module === 'app' && event.source === 'runtime')).toBe(true);
    expect(Object.keys(events[0]).sort()).toEqual([
      'event',
      'module',
      'reason',
      'source',
      'status',
    ]);
  });

  const ordinaryEdges: Array<{
    name: string;
    setup: LifecycleEvent[];
    event: LifecycleEvent;
    expected: LifecycleState;
    telemetry: Omit<MirrorEvent, 'time'>;
  }> = [
    {
      name: 'starting LOCAL_READY',
      setup: [],
      event: { type: 'LOCAL_READY' },
      expected: 'dormant',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=starting;to=dormant;event=LOCAL_READY;cause=local_essentials_ready',
        source: 'runtime',
      },
    },
    {
      name: 'dormant WAKE_DETECTED',
      setup: [{ type: 'LOCAL_READY' }],
      event: wake(),
      expected: 'activating',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=dormant;to=activating;event=WAKE_DETECTED;cause=wake_word_detected',
        source: 'runtime',
      },
    },
    {
      name: 'activating REALTIME_READY',
      setup: [{ type: 'LOCAL_READY' }, wake()],
      event: realtimeReady(),
      expected: 'active',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=activating;to=active;event=REALTIME_READY;cause=mic_and_realtime_ready',
        source: 'runtime',
      },
    },
    {
      name: 'activating CLOUD_FAILED',
      setup: [{ type: 'LOCAL_READY' }, wake()],
      event: { type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' },
      expected: 'offlineLoop',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'degraded',
        reason: 'from=activating;to=offlineLoop;event=CLOUD_FAILED;cause=cloud_failed',
        source: 'runtime',
        error_code: 'cloud_unavailable',
      },
    },
    {
      name: 'activating LOCAL_AUDIO_FAILED',
      setup: [{ type: 'LOCAL_READY' }, wake()],
      event: { type: 'LOCAL_AUDIO_FAILED', errorCode: 'mic_handoff_failed' },
      expected: 'maintenance',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=activating;to=maintenance;event=LOCAL_AUDIO_FAILED;cause=local_audio_failed',
        source: 'runtime',
        error_code: 'mic_handoff_failed',
      },
    },
    {
      name: 'active IDLE_TIMEOUT',
      setup: activeSetup(),
      event: { type: 'IDLE_TIMEOUT' },
      expected: 'suspending',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=active;to=suspending;event=IDLE_TIMEOUT;cause=idle_timeout',
        source: 'runtime',
      },
    },
    {
      name: 'active SLEEP_REQUESTED',
      setup: activeSetup(),
      event: { type: 'SLEEP_REQUESTED' },
      expected: 'suspending',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=active;to=suspending;event=SLEEP_REQUESTED;cause=sleep_requested',
        source: 'runtime',
      },
    },
    {
      name: 'active CLOUD_FAILED',
      setup: activeSetup(),
      event: { type: 'CLOUD_FAILED', errorCode: 'network_lost' },
      expected: 'offlineLoop',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'degraded',
        reason: 'from=active;to=offlineLoop;event=CLOUD_FAILED;cause=cloud_failed',
        source: 'runtime',
        error_code: 'network_lost',
      },
    },
    {
      name: 'suspending MEDIA_CLOSED',
      setup: [...activeSetup(), { type: 'SLEEP_REQUESTED' }],
      event: { type: 'MEDIA_CLOSED' },
      expected: 'dormant',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=suspending;to=dormant;event=MEDIA_CLOSED;cause=media_closed_and_wake_mic_ready',
        source: 'runtime',
      },
    },
    {
      name: 'offlineLoop RECOVERY_PASSED',
      setup: [...activeSetup(), { type: 'CLOUD_FAILED' }],
      event: { type: 'RECOVERY_PASSED' },
      expected: 'dormant',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=offlineLoop;to=dormant;event=RECOVERY_PASSED;cause=recovery_check_passed',
        source: 'runtime',
      },
    },
    {
      name: 'maintenance RETRY_STARTUP',
      setup: [{ type: 'LOCAL_CORE_FAILED', errorCode: 'core_failed' }],
      event: { type: 'RETRY_STARTUP' },
      expected: 'starting',
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'success',
        reason: 'from=maintenance;to=starting;event=RETRY_STARTUP;cause=local_repair_or_retry',
        source: 'runtime',
      },
    },
  ];

  it.each(ordinaryEdges)('allows the legal edge $name', ({ setup, event, expected, telemetry }) => {
    const { actor, events } = actorAfter(setup);

    actor.send(event);

    expect(actor.getState()).toBe(expected);
    expect(events.at(-1)).toEqual(telemetry);
  });

  const localCoreSources: Array<{
    name: string;
    setup: LifecycleEvent[];
    telemetry: Omit<MirrorEvent, 'time'>;
  }> = [
    {
      name: 'starting',
      setup: [],
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=starting;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
        source: 'runtime',
        error_code: 'local_core_failed',
      },
    },
    {
      name: 'dormant',
      setup: [{ type: 'LOCAL_READY' }],
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=dormant;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
        source: 'runtime',
        error_code: 'local_core_failed',
      },
    },
    {
      name: 'activating',
      setup: [{ type: 'LOCAL_READY' }, wake()],
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=activating;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
        source: 'runtime',
        error_code: 'local_core_failed',
      },
    },
    {
      name: 'active',
      setup: activeSetup(),
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=active;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
        source: 'runtime',
        error_code: 'local_core_failed',
      },
    },
    {
      name: 'suspending',
      setup: [...activeSetup(), { type: 'SLEEP_REQUESTED' }],
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=suspending;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
        source: 'runtime',
        error_code: 'local_core_failed',
      },
    },
    {
      name: 'offlineLoop',
      setup: [...activeSetup(), { type: 'CLOUD_FAILED' }],
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=offlineLoop;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
        source: 'runtime',
        error_code: 'local_core_failed',
      },
    },
    {
      name: 'maintenance',
      setup: [{ type: 'LOCAL_CORE_FAILED' }],
      telemetry: {
        module: 'app',
        event: 'lifecycle_transition',
        status: 'failed',
        reason: 'from=maintenance;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
        source: 'runtime',
        error_code: 'local_core_failed',
      },
    },
  ];

  it.each(localCoreSources)('routes LOCAL_CORE_FAILED from $name to maintenance', ({ setup, telemetry }) => {
    const { actor, events } = actorAfter(setup);
    const beforeCount = events.length;

    actor.send({ type: 'LOCAL_CORE_FAILED', errorCode: 'local_core_failed' });

    expect(actor.getState()).toBe('maintenance');
    expect(events).toHaveLength(beforeCount + 1);
    expect(events.at(-1)).toEqual(telemetry);
  });

  it('keeps a repeated LOCAL_CORE_FAILED in maintenance idempotent', () => {
    const { actor } = actorAfter([{ type: 'LOCAL_CORE_FAILED' }]);
    const beforeContext = actor.getContext();

    actor.send({ type: 'LOCAL_CORE_FAILED', errorCode: 'local_core_failed' });

    expect(actor.getState()).toBe('maintenance');
    expect(actor.getContext()).toEqual(beforeContext);
  });

  it('routes active cloud failure to OfflineLoop with degraded metadata and generation bump', () => {
    const { actor, events } = actorAfter(activeSetup());

    actor.send({ type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' });

    expect(actor.getState()).toBe('offlineLoop');
    expect(actor.getContext()).toEqual({
      activationId: 'activation-1',
      realtimeSessionId: null,
      sessionGeneration: 1,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });
    expect(events.at(-1)).toEqual({
      module: 'app',
      event: 'lifecycle_transition',
      status: 'degraded',
      reason: 'from=active;to=offlineLoop;event=CLOUD_FAILED;cause=cloud_failed',
      source: 'runtime',
      error_code: 'cloud_unavailable',
    });
  });

  it('preserves generation and activation metadata across activating cloud then core failures', () => {
    const { actor } = actorAfter([{ type: 'LOCAL_READY' }, wake()]);

    expect(actor.getContext()).toEqual({
      activationId: 'activation-1',
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });

    actor.send({ type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' });

    expect(actor.getState()).toBe('offlineLoop');
    expect(actor.getContext()).toEqual({
      activationId: 'activation-1',
      realtimeSessionId: null,
      sessionGeneration: 1,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });

    actor.send({ type: 'LOCAL_CORE_FAILED', errorCode: 'local_core_failed' });

    expect(actor.getState()).toBe('maintenance');
    expect(actor.getContext()).toEqual({
      activationId: 'activation-1',
      realtimeSessionId: null,
      sessionGeneration: 1,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });
  });

  it('routes activating local audio failure to Maintenance with failed metadata', () => {
    const { actor, events } = actorAfter([{ type: 'LOCAL_READY' }, wake()]);

    actor.send({ type: 'LOCAL_AUDIO_FAILED', errorCode: 'mic_handoff_failed' });

    expect(actor.getState()).toBe('maintenance');
    expect(actor.getContext()).toEqual({
      activationId: 'activation-1',
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });
    expect(events.at(-1)).toEqual({
      module: 'app',
      event: 'lifecycle_transition',
      status: 'failed',
      reason: 'from=activating;to=maintenance;event=LOCAL_AUDIO_FAILED;cause=local_audio_failed',
      source: 'runtime',
      error_code: 'mic_handoff_failed',
    });
  });

  it('clears active session fields while preserving diagnostic metadata on core failure', () => {
    const { actor } = actorAfter(activeSetup());

    actor.send({ type: 'LOCAL_CORE_FAILED' });

    expect(actor.getContext()).toEqual({
      activationId: 'activation-1',
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });
  });

  it('applies the activation, session, close, and OfflineLoop context boundaries', () => {
    const { actor } = makeActor();

    actor.send({ type: 'LOCAL_READY' });
    actor.send(wake('activation-42'));
    expect(actor.getContext()).toEqual({
      activationId: 'activation-42',
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });

    actor.send(realtimeReady('session-42'));
    expect(actor.getContext()).toEqual({
      activationId: 'activation-42',
      realtimeSessionId: 'session-42',
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });
    actor.send({ type: 'SLEEP_REQUESTED' });
    actor.send({ type: 'MEDIA_CLOSED' });
    expect(actor.getContext()).toEqual({
      activationId: 'activation-42',
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });

    actor.send(wake('activation-43'));
    actor.send(realtimeReady('session-43'));
    actor.send({ type: 'CLOUD_FAILED' });
    expect(actor.getContext()).toEqual({
      activationId: 'activation-43',
      realtimeSessionId: null,
      sessionGeneration: 1,
      activeProfileId: null,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
      sceneInvocationId: null,
    });
  });

  it('preserves context on legal state-only edges', () => {
    const ready = makeActor();
    const beforeReady = ready.actor.getContext();
    ready.actor.send({ type: 'LOCAL_READY' });
    expect(ready.actor.getContext()).toEqual(beforeReady);

    const idle = actorAfter(activeSetup());
    const beforeIdle = idle.actor.getContext();
    idle.actor.send({ type: 'IDLE_TIMEOUT' });
    expect(idle.actor.getContext()).toEqual(beforeIdle);

    const sleep = actorAfter(activeSetup());
    const beforeSleep = sleep.actor.getContext();
    sleep.actor.send({ type: 'SLEEP_REQUESTED' });
    expect(sleep.actor.getContext()).toEqual(beforeSleep);

    const recovery = actorAfter([...activeSetup(), { type: 'CLOUD_FAILED' }]);
    const beforeRecovery = recovery.actor.getContext();
    recovery.actor.send({ type: 'RECOVERY_PASSED' });
    expect(recovery.actor.getContext()).toEqual(beforeRecovery);

    const retry = actorAfter([{ type: 'LOCAL_CORE_FAILED' }]);
    const beforeRetry = retry.actor.getContext();
    retry.actor.send({ type: 'RETRY_STARTUP' });
    expect(retry.actor.getContext()).toEqual(beforeRetry);
  });

  it('omits error_code when a failure event supplies no error code', () => {
    const cloud = actorAfter(activeSetup());
    cloud.actor.send({ type: 'CLOUD_FAILED' });
    expect(cloud.events.at(-1)).toEqual({
      module: 'app',
      event: 'lifecycle_transition',
      status: 'degraded',
      reason: 'from=active;to=offlineLoop;event=CLOUD_FAILED;cause=cloud_failed',
      source: 'runtime',
    });

    const audio = actorAfter([{ type: 'LOCAL_READY' }, wake()]);
    audio.actor.send({ type: 'LOCAL_AUDIO_FAILED' });
    expect(audio.events.at(-1)).toEqual({
      module: 'app',
      event: 'lifecycle_transition',
      status: 'failed',
      reason: 'from=activating;to=maintenance;event=LOCAL_AUDIO_FAILED;cause=local_audio_failed',
      source: 'runtime',
    });

    const core = makeActor();
    core.actor.send({ type: 'LOCAL_CORE_FAILED' });
    expect(core.events.at(-1)).toEqual({
      module: 'app',
      event: 'lifecycle_transition',
      status: 'failed',
      reason: 'from=starting;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed',
      source: 'runtime',
    });
  });

  it('ignores an illegal event without throwing, changing state, or mutating context', () => {
    const { actor, events } = actorAfter(activeSetup());
    const beforeContext = actor.getContext();
    const beforeCount = events.length;

    expect(() => {
      actor.send(wake('activation-illegal'));
    }).not.toThrow();

    expect(actor.getState()).toBe('active');
    expect(actor.getContext()).toEqual(beforeContext);
    expect(events).toHaveLength(beforeCount + 1);
    expect(events.at(-1)).toEqual({
      module: 'app',
      event: 'lifecycle_event_ignored',
      status: 'info',
      reason: 'state=active;event=WAKE_DETECTED;cause=illegal_event',
      source: 'runtime',
    });
  });

  it('returns defensive copies from getContext and subscribed snapshots', () => {
    const { actor } = makeActor();
    const directContext = actor.getContext();

    directContext.activationId = 'mutated-by-caller';
    directContext.sessionGeneration = 99;

    expect(actor.getContext()).toEqual({
      activationId: null,
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: null,
      sceneInvocationId: null,
    });

    const snapshots: LifecycleSnapshot[] = [];
    const subscription: LifecycleSubscription = actor.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    actor.send({ type: 'LOCAL_READY' });
    const published = snapshots.at(-1);
    expect(published).toEqual({
      state: 'dormant',
      context: {
        activationId: null,
        realtimeSessionId: null,
        sessionGeneration: 0,
        activeProfileId: null,
        lastInteractionAt: null,
        sceneInvocationId: null,
      },
    });

    published!.context.activationId = 'mutated-snapshot';
    published!.context.sessionGeneration = 99;

    expect(actor.getContext()).toEqual({
      activationId: null,
      realtimeSessionId: null,
      sessionGeneration: 0,
      activeProfileId: null,
      lastInteractionAt: null,
      sceneInvocationId: null,
    });

    actor.send(wake('activation-copy'));
    expect(actor.getContext().activationId).toBe('activation-copy');
    subscription.unsubscribe();
  });

  it('publishes snapshots and stops publishing after unsubscribe', () => {
    const { actor } = makeActor();
    const snapshots: Array<{ state: LifecycleState }> = [];
    const subscription: LifecycleSubscription = actor.subscribe(({ state }) => {
      snapshots.push({ state });
    });

    actor.send({ type: 'LOCAL_READY' });
    const countAfterDormant = snapshots.length;
    expect(snapshots.at(-1)).toEqual({ state: 'dormant' });

    subscription.unsubscribe();
    actor.send(wake());

    expect(snapshots.length).toBe(countAfterDormant);
  });
});
