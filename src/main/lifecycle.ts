import { assign, createActor, setup } from 'xstate';
import type { LifecycleState, MirrorEvent } from '../shared/types';

export interface LifecycleContext {
  activationId: string | null;
  realtimeSessionId: string | null;
  sessionGeneration: number;
  activeProfileId: string | 'anonymous' | null;
  lastInteractionAt: string | null;
  sceneInvocationId: string | null;
}

export type LifecycleEvent =
  | { type: 'LOCAL_READY' }
  | { type: 'LOCAL_CORE_FAILED'; errorCode?: string }
  | { type: 'WAKE_DETECTED'; activationId: string; lastInteractionAt: string }
  | { type: 'REALTIME_READY'; realtimeSessionId: string }
  | { type: 'CLOUD_FAILED'; errorCode?: string }
  | { type: 'LOCAL_AUDIO_FAILED'; errorCode?: string }
  | { type: 'IDLE_TIMEOUT' }
  | { type: 'SLEEP_REQUESTED' }
  | { type: 'MEDIA_CLOSED' }
  | { type: 'RECOVERY_PASSED' }
  | { type: 'RETRY_STARTUP' };

export interface LifecycleTelemetry {
  emit(event: Omit<MirrorEvent, 'time'>): void;
}

export interface LifecycleSnapshot {
  state: LifecycleState;
  context: LifecycleContext;
}

export interface LifecycleSubscription {
  unsubscribe(): void;
}

export interface LifecycleActor {
  send(event: LifecycleEvent): void;
  getState(): LifecycleState;
  getContext(): LifecycleContext;
  subscribe(callback: (snapshot: LifecycleSnapshot) => void): LifecycleSubscription;
}

const INITIAL_CONTEXT: LifecycleContext = {
  activationId: null,
  realtimeSessionId: null,
  sessionGeneration: 0,
  activeProfileId: null,
  lastInteractionAt: null,
  sceneInvocationId: null,
};

const LEGAL_TARGETS: Record<
  LifecycleState,
  Partial<Record<LifecycleEvent['type'], LifecycleState>>
> = {
  starting: {
    LOCAL_READY: 'dormant',
    LOCAL_CORE_FAILED: 'maintenance',
  },
  dormant: {
    WAKE_DETECTED: 'activating',
    LOCAL_CORE_FAILED: 'maintenance',
  },
  activating: {
    REALTIME_READY: 'active',
    CLOUD_FAILED: 'offlineLoop',
    LOCAL_AUDIO_FAILED: 'maintenance',
    LOCAL_CORE_FAILED: 'maintenance',
  },
  active: {
    IDLE_TIMEOUT: 'suspending',
    SLEEP_REQUESTED: 'suspending',
    CLOUD_FAILED: 'offlineLoop',
    LOCAL_CORE_FAILED: 'maintenance',
  },
  suspending: {
    MEDIA_CLOSED: 'dormant',
    LOCAL_CORE_FAILED: 'maintenance',
  },
  offlineLoop: {
    RECOVERY_PASSED: 'dormant',
    LOCAL_CORE_FAILED: 'maintenance',
  },
  maintenance: {
    RETRY_STARTUP: 'starting',
    LOCAL_CORE_FAILED: 'maintenance',
  },
};

const CAUSES: Record<LifecycleEvent['type'], string> = {
  LOCAL_READY: 'local_essentials_ready',
  LOCAL_CORE_FAILED: 'local_core_failed',
  WAKE_DETECTED: 'wake_word_detected',
  REALTIME_READY: 'mic_and_realtime_ready',
  CLOUD_FAILED: 'cloud_failed',
  LOCAL_AUDIO_FAILED: 'local_audio_failed',
  IDLE_TIMEOUT: 'idle_timeout',
  SLEEP_REQUESTED: 'sleep_requested',
  MEDIA_CLOSED: 'media_closed_and_wake_mic_ready',
  RECOVERY_PASSED: 'recovery_check_passed',
  RETRY_STARTUP: 'local_repair_or_retry',
};

const lifecycleSetup = setup({
  types: {
    context: {} as LifecycleContext,
    events: {} as LifecycleEvent,
  },
  actions: {
    assignWakeContext: assign(({ event }) => {
      if (event.type !== 'WAKE_DETECTED') {
        return {};
      }
      return {
        activationId: event.activationId,
        lastInteractionAt: event.lastInteractionAt,
        realtimeSessionId: null,
        activeProfileId: null,
        sceneInvocationId: null,
      };
    }),
    assignRealtimeSession: assign(({ event }) => {
      if (event.type !== 'REALTIME_READY') {
        return {};
      }
      return { realtimeSessionId: event.realtimeSessionId };
    }),
    clearSessionContext: assign(() => ({
      realtimeSessionId: null,
      activeProfileId: null,
      sceneInvocationId: null,
    })),
    enterOfflineLoop: assign(({ context }) => ({
      realtimeSessionId: null,
      activeProfileId: null,
      sceneInvocationId: null,
      sessionGeneration: context.sessionGeneration + 1,
    })),
  },
});

const createLifecycleMachine = () => lifecycleSetup.createMachine({
  id: 'lifecycle',
  initial: 'starting',
  context: INITIAL_CONTEXT,
  states: {
    starting: {
      on: {
        LOCAL_READY: 'dormant',
        LOCAL_CORE_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
      },
    },
    dormant: {
      on: {
        WAKE_DETECTED: {
          target: 'activating',
          actions: 'assignWakeContext',
        },
        LOCAL_CORE_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
      },
    },
    activating: {
      on: {
        REALTIME_READY: {
          target: 'active',
          actions: 'assignRealtimeSession',
        },
        CLOUD_FAILED: {
          target: 'offlineLoop',
          actions: 'enterOfflineLoop',
        },
        LOCAL_AUDIO_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
        LOCAL_CORE_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
      },
    },
    active: {
      on: {
        IDLE_TIMEOUT: 'suspending',
        SLEEP_REQUESTED: 'suspending',
        CLOUD_FAILED: {
          target: 'offlineLoop',
          actions: 'enterOfflineLoop',
        },
        LOCAL_CORE_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
      },
    },
    suspending: {
      on: {
        MEDIA_CLOSED: {
          target: 'dormant',
          actions: 'clearSessionContext',
        },
        LOCAL_CORE_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
      },
    },
    offlineLoop: {
      on: {
        RECOVERY_PASSED: 'dormant',
        LOCAL_CORE_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
      },
    },
    maintenance: {
      on: {
        RETRY_STARTUP: 'starting',
        LOCAL_CORE_FAILED: {
          target: 'maintenance',
          actions: 'clearSessionContext',
        },
      },
    },
  },
});

const stateOf = (value: unknown): LifecycleState => value as LifecycleState;

const errorCodeOf = (event: LifecycleEvent): string | undefined => {
  if (
    event.type === 'LOCAL_CORE_FAILED' ||
    event.type === 'CLOUD_FAILED' ||
    event.type === 'LOCAL_AUDIO_FAILED'
  ) {
    return event.errorCode;
  }
  return undefined;
};

const statusOf = (event: LifecycleEvent): MirrorEvent['status'] => {
  if (event.type === 'CLOUD_FAILED') {
    return 'degraded';
  }
  if (event.type === 'LOCAL_CORE_FAILED' || event.type === 'LOCAL_AUDIO_FAILED') {
    return 'failed';
  }
  return 'success';
};

export function createLifecycleActor(deps: {
  telemetry: LifecycleTelemetry;
}): LifecycleActor {
  const actor = createActor(createLifecycleMachine());
  actor.start();

  const getState = (): LifecycleState => stateOf(actor.getSnapshot().value);
  const getContext = (): LifecycleContext => ({ ...actor.getSnapshot().context });

  return {
    send(event) {
      const from = getState();
      const target = LEGAL_TARGETS[from][event.type];
      actor.send(event);
      const to = getState();

      if (target === undefined) {
        deps.telemetry.emit({
          module: 'app',
          event: 'lifecycle_event_ignored',
          status: 'info',
          reason: `state=${from};event=${event.type};cause=illegal_event`,
          source: 'runtime',
        });
        return;
      }

      const telemetryEvent: Omit<MirrorEvent, 'time'> = {
        module: 'app',
        event: 'lifecycle_transition',
        status: statusOf(event),
        reason: `from=${from};to=${to};event=${event.type};cause=${CAUSES[event.type]}`,
        source: 'runtime',
      };
      const errorCode = errorCodeOf(event);
      if (errorCode !== undefined) {
        telemetryEvent.error_code = errorCode;
      }
      deps.telemetry.emit(telemetryEvent);
    },
    getState,
    getContext,
    subscribe(callback) {
      const subscription = actor.subscribe((snapshot) => {
        callback({
          state: stateOf(snapshot.value),
          context: { ...snapshot.context },
        });
      });
      return {
        unsubscribe: () => subscription.unsubscribe(),
      };
    },
  };
}
