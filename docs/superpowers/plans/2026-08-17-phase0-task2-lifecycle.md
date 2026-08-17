# Phase 0 Task 2 — Main-Owned Lifecycle State Machine Implementation Plan

> **For agentic workers:** Execute this single bounded unit through the repository's direct worker route. The root Codex thread is the sole orchestrator and reviewer. Each direct `nova-auto` worker has exactly one role (`implementer` or `tester`); no nested or reviewer agents are created. Steps use checkbox syntax for tracking.

**Goal:** Build the Main-owned XState v5 lifecycle module for the seven Phase 0 states, with legal transitions, explicit failure fallbacks, deterministic context cleanup, and metadata-only telemetry for accepted and ignored events.

**Architecture:** `src/main/lifecycle.ts` owns one flat XState machine in Electron Main and exposes a small actor wrapper instead of leaking XState snapshots to later callers. The machine receives a structural telemetry sink compatible with the later Task 4 `Telemetry.emit` method; it does not import an uncreated telemetry module. There are no parallel regions, identity epochs, IPC boundaries, renderer concerns, persistence hooks, or runtime wiring in this unit.

**Tech Stack:** TypeScript 5.9, XState 5.32.5 (`setup().createMachine()` plus `createActor()`), Vitest 4.1.10, and the existing Electron 43.x project baseline. Node 22.21.0 is sufficient for this pure state-machine task; the Node prerequisite upgrade in `AGENTS.md` is required before Task 3, not before Task 2.

**Spec:** `docs/superpowers/plans/2026-08-16-phase0-foundation.md` Task 2 and Shared Interfaces; `docs/Magic_Mirror_Tech_Spec_v0.3.md` §5–§6.3; `docs/Magic_Mirror_Implementation_Plan_v0.3.md` §3.4 and Phase 0 P0-D1/P0-D2; consumed types in `src/shared/types.ts`; dependency and script baseline in `package.json`.

## Global Constraints

- Task 2 is the next application task. Product Phase 1 remains blocked until the complete Phase 0 exit review succeeds; this plan does not alter phase status or provide exit evidence.
- The machine has exactly these seven states: `starting`, `dormant`, `activating`, `active`, `suspending`, `offlineLoop`, and `maintenance`.
- The only implementation files are `src/main/lifecycle.ts` and `tests/unit/lifecycle.test.ts`. Do not change `src/shared/types.ts`, `package.json`, any index, IPC, preload, renderer, Console UI, persistence, configuration, telemetry implementation, runtime boot wiring, or Phase 1 code.
- Import `LifecycleState` and `MirrorEvent` from `src/shared/types.ts`; do not import `Telemetry` from a future module. Define the local telemetry dependency structurally as `emit(event: Omit<MirrorEvent, 'time'>): void`.
- Use the eleven settled event names exactly: `LOCAL_READY`, `LOCAL_CORE_FAILED`, `WAKE_DETECTED`, `REALTIME_READY`, `CLOUD_FAILED`, `LOCAL_AUDIO_FAILED`, `IDLE_TIMEOUT`, `SLEEP_REQUESTED`, `MEDIA_CLOSED`, `RECOVERY_PASSED`, and `RETRY_STARTUP`. Do not add event names, states, parallel regions, identity epochs, write-policy epochs, or cross-process sequence numbers.
- Ordinary transition edges match the Tech Spec §5 diagram. `LOCAL_CORE_FAILED` is the one explicit failure override required by the Phase 0 Task 2 brief: from any current state it settles at `maintenance`; no other global event handling is added.
- `CLOUD_FAILED` routes to `offlineLoop`, `LOCAL_AUDIO_FAILED` routes from `activating` to `maintenance`, and local-core failure routes to `maintenance`. No failure is silently swallowed, retried in a loop, or substituted with another state.
- The lifecycle module emits only metadata allowed by `MirrorEvent`: state names, event names, status, reason, optional error codes, and `source: 'runtime'`. It never emits transcript text, audio, memory values, private context, credentials, images, embeddings, or prompts. `time` is added by the later telemetry implementation, so the injected sink does not receive it.
- Accepted transition telemetry uses `event: 'lifecycle_transition'`; ignored illegal events use `event: 'lifecycle_event_ignored'`. Every ignored event includes a concrete state, event, and reason. Telemetry status is `success` for ordinary transitions, `degraded` for the cloud-to-OfflineLoop fallback, `failed` for local-core and local-audio fallbacks, and `info` for an intentional illegal-event ignore.
- The state machine does not own microphone acquisition or release. Its state boundaries preserve the single-owner contract for later wiring: activation starts the handoff, `LOCAL_AUDIO_FAILED` fails locally into Maintenance, and `MEDIA_CLOSED`/failure fallbacks clear the stored session owner data. No wake worker, renderer, or audio adapter is created here.
- Invariants carried by this unit are 1, 3, 8, 9, 10, 11, and 12. Invariants 2, 4, 5, 6, and 7 are outside Task 2 behavior scope and must remain preserved by the absence of identity confirmation, profile switching, extraction, control-turn routing, or spell matching.
- Follow TDD through the repository routing policy: the implementer writes the failing test; a dedicated tester owns the RED command; the same bounded implementer writes the smallest implementation; the tester owns GREEN and final focused test/typecheck commands; an optional implementer refactor happens only while green; the tester owns the final focused suite and node typecheck. The root runs no tests or typechecks.
- The root thread remains the sole orchestrator/reviewer. Direct `gpt-5.6-luna` workers use the `nova-auto` profile, `max` reasoning, `fresh_worker: true`, and exactly one role. No nested worker, reviewer worker, or delegation is introduced by this plan.
- Every later direct worker dispatch carries this explicit envelope: `model: "gpt-5.6-luna"`, `reasoning_effort: "max"`, `role: exactly one of "implementer" or "tester"`, and `fresh_worker: true`; the root supplies the exact two-file write scope and the relevant invariant IDs.
- Use existing dependencies only. Do not add packages, change model configuration, add model literals, or upgrade the Node/Electron baseline for Task 2.
- Future commits use conventional messages. This planning worker does not stage, commit, run tests, run typecheck, run build, install packages, or package the application.

## Unit Scope — 0.5–1 Day

**Story / Phase:** `US-FOUND-001` / Phase 0 Foundation, Application Task 2.

**User-visible outcome:** A pure Main-owned contract can move through the Phase 0 lifecycle journey, expose a concrete current state/context to later boot wiring, and visibly account for every accepted fallback or illegal event through metadata-only telemetry.

**Files / modules expected to change:** Create `src/main/lifecycle.ts` and `tests/unit/lifecycle.test.ts` only.

**Console control or telemetry to add:** Emit `lifecycle_transition` with `from`, `to`, event, status, and cause in `reason`; emit `lifecycle_event_ignored` with the current state, event, and `illegal_event` cause. The injected sink is the Task 4-compatible seam; no Console page or telemetry writer is added.

**Happy-path test:** Drive `starting → dormant → activating → active → suspending → dormant` using `LOCAL_READY`, `WAKE_DETECTED`, `REALTIME_READY`, `SLEEP_REQUESTED` or `IDLE_TIMEOUT`, and `MEDIA_CLOSED`, and assert the exact transition events and context boundaries.

**Failure / fallback test:** Drive `CLOUD_FAILED` from `active` to `offlineLoop`, `LOCAL_AUDIO_FAILED` from `activating` to `maintenance`, `LOCAL_CORE_FAILED` from every current state to `maintenance`, and an illegal `WAKE_DETECTED` from `active` to an unchanged state plus a reasoned `lifecycle_event_ignored` event.

**Explicit non-goals:** Timers, the production 300-second idle source, real microphone handoff, Realtime sessions, identity or profile confirmation, IPC, preload, renderer screens, Console UI, persistence, telemetry storage, runtime boot wiring, index exports, config, SQLite, model resolution, and all Phase 1 work.

**Demo step affected:** P0-D1 and P0-D2 at the pure state-machine contract level only. The later boot/IPC/renderer task must consume this module before either demo can be called runnable or complete.

## Phase Demo and Exit Impact

- P0-D1 will have an exact state-machine route for the later app wiring to consume. Task 2 itself does not open a window, render a screen, execute a simulator command, or prove the end-to-end demo.
- P0-D2 will have explicit cloud and local failure destinations plus metadata reasons. Task 2 does not simulate SQLite, connect an IPC command, play OfflineLoop video, render Maintenance, or prove the no-black-screen path.
- Phase 0 remains in progress after this unit. Phase 1 cannot start merely because these focused unit checks are green; the root must still review the Phase 0 demos and exit criteria through the external phase workflow.
- Node 22.21.0 does not block this task. Before Task 3, follow `AGENTS.md` and upgrade the development prerequisite to `>=22.22.2` or `>=24.15.0`.

## File Map

| Path | Action | Responsibility |
|---|---|---|
| `src/main/lifecycle.ts` | Create | Define the exact lifecycle context/events, the XState v5 machine, the actor wrapper, transition legality table, context mutations, and metadata-only telemetry mapping. |
| `tests/unit/lifecycle.test.ts` | Create | Specify every ordinary edge, the global local-core fallback, cloud/audio fallbacks, context cleanup/generation behavior, subscription API, ignored-event behavior, statuses, reasons, and metadata-only event shape. |
| `src/shared/types.ts` | Read only | Supply the existing `LifecycleState` and `MirrorEvent` types; do not extend or edit this shared file. |
| `package.json` | Read only | Supply the existing XState, TypeScript, Vitest, and `typecheck:node` scripts; do not add dependencies or scripts. |

## Exact Interfaces

The implementation must expose these types and function signatures from `src/main/lifecycle.ts`:

```ts
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

export function createLifecycleActor(deps: {
  telemetry: LifecycleTelemetry;
}): LifecycleActor;
```

The initial context is exactly:

```ts
{
  activationId: null,
  realtimeSessionId: null,
  sessionGeneration: 0,
  activeProfileId: null,
  lastInteractionAt: null,
  sceneInvocationId: null,
}
```

`WAKE_DETECTED.activationId` and `WAKE_DETECTED.lastInteractionAt` are Main-generated metadata inputs. `REALTIME_READY.realtimeSessionId` is the new Main-owned session identifier. The actor returns defensive context copies; callers cannot mutate the machine by changing a value returned from `getContext()` or `subscribe()`.

## Legal Transition Table

The ordinary edges are the seven-state Tech Spec §5 diagram. The detailed Task 2 acceptance line `LOCAL_CORE_FAILED anywhere` supplements that primary-edge diagram; this is resolved, not an unresolved risk. The `LOCAL_CORE_FAILED` row is the Phase 0 Task 2 failure override and is the only event accepted from every state.

| Source state | Event | Target state | Classification |
|---|---|---|---|
| any of the seven states | `LOCAL_CORE_FAILED` | `maintenance` | local-core failure override; `maintenance → maintenance` is idempotent and still reports the failure metadata |
| `starting` | `LOCAL_READY` | `dormant` | local essentials are ready |
| `dormant` | `WAKE_DETECTED` | `activating` | wake word detected |
| `activating` | `REALTIME_READY` | `active` | microphone and Realtime are ready |
| `activating` | `CLOUD_FAILED` | `offlineLoop` | cloud failure fallback |
| `activating` | `LOCAL_AUDIO_FAILED` | `maintenance` | local audio handoff failure |
| `active` | `IDLE_TIMEOUT` | `suspending` | idle timeout event supplied by a later owner |
| `active` | `SLEEP_REQUESTED` | `suspending` | sleep request |
| `active` | `CLOUD_FAILED` | `offlineLoop` | active cloud-loss fallback |
| `suspending` | `MEDIA_CLOSED` | `dormant` | media closed and wake microphone ready |
| `offlineLoop` | `RECOVERY_PASSED` | `dormant` | recovery check passed |
| `maintenance` | `RETRY_STARTUP` | `starting` | local repair or retry |

Any event not listed for the current source state is ignored. Ignoring does not throw, mutate context, enqueue a retry, or change state. For example, `WAKE_DETECTED` in `active` remains `active` and emits `lifecycle_event_ignored` with `cause=illegal_event`.

## Context Mutation Rules

| Event or entry | Mutations | Preserved values |
|---|---|---|
| actor creation | Use the exact initial context shown above. | None are inherited from another actor. |
| `WAKE_DETECTED` | Set `activationId` to the event's new ID and `lastInteractionAt` to the event's ISO-8601 metadata time. Clear `realtimeSessionId`, `activeProfileId`, and `sceneInvocationId` at the new activation boundary. | `sessionGeneration` remains unchanged. |
| `REALTIME_READY` | Set `realtimeSessionId` to the event's new session ID. | `activationId`, `sessionGeneration`, `activeProfileId`, `lastInteractionAt`, and `sceneInvocationId` remain as they were. |
| `MEDIA_CLOSED` | Clear `realtimeSessionId`, `activeProfileId`, and `sceneInvocationId`. | `activationId`, `sessionGeneration`, and `lastInteractionAt` remain available as metadata. |
| entering `offlineLoop` from `activating` or `active` | Clear `realtimeSessionId`, `activeProfileId`, and `sceneInvocationId`; increment `sessionGeneration` by exactly one. | `activationId` and `lastInteractionAt` remain available as metadata. |
| entering `maintenance` from any source | Clear `realtimeSessionId`, `activeProfileId`, and `sceneInvocationId` so the Maintenance state does not expose an active owner/session. Do not increment `sessionGeneration` here. | `activationId` and `lastInteractionAt` remain available as diagnostic metadata. |
| every other accepted or ignored event | No context mutation. | All six fields retain their current values. |

Task 2 never assigns a profile ID or scene invocation ID because identity, confirmation, and scenes are later behavior. These fields exist to keep the Main-owned context shape stable and are only cleared at the specified boundaries. No profile ID is sent through a renderer, model, tool, or IPC payload by this unit.

## Telemetry Contract

The actor calls the injected `emit` synchronously after each `send()` has been processed. The sink receives no `time`; Task 4's `Telemetry.emit` supplies it. Both events set `module: 'app'` and `source: 'runtime'`.

| Event name | Status | Exact reason format | Optional metadata |
|---|---|---|---|
| `lifecycle_transition` for ordinary edges | `success` | `from=starting;to=dormant;event=LOCAL_READY;cause=local_essentials_ready` with the concrete source/target/event values for each edge | `error_code` is absent |
| `lifecycle_transition` for `CLOUD_FAILED` | `degraded` | `from=active;to=offlineLoop;event=CLOUD_FAILED;cause=cloud_failed` with the concrete source state | Include `error_code` only when the event supplies one |
| `lifecycle_transition` for `LOCAL_CORE_FAILED` | `failed` | `from=active;to=maintenance;event=LOCAL_CORE_FAILED;cause=local_core_failed` with the concrete source state | Include `error_code` only when the event supplies one |
| `lifecycle_transition` for `LOCAL_AUDIO_FAILED` | `failed` | `from=activating;to=maintenance;event=LOCAL_AUDIO_FAILED;cause=local_audio_failed` | Include `error_code` only when the event supplies one |
| `lifecycle_event_ignored` | `info` | `state=active;event=WAKE_DETECTED;cause=illegal_event` with the concrete current state and event | No content-bearing fields; do not invent an error code for a normal illegal-event guard |

The complete cause vocabulary is fixed to `local_essentials_ready`, `local_core_failed`, `wake_word_detected`, `mic_and_realtime_ready`, `cloud_failed`, `local_audio_failed`, `idle_timeout`, `sleep_requested`, `media_closed_and_wake_mic_ready`, `recovery_check_passed`, `local_repair_or_retry`, and `illegal_event`. This keeps reasons aligned with the Phase 0 diagram and the Implementation Plan's `success`/`degraded`/`failed` semantics. No lifecycle event writes JSONL, a database row, a transcript, audio, or any other persistent artifact.

## Invariant Coverage

- **Invariant 1 — carried:** Telemetry contains only state/event/status/reason/error-code metadata. The module has no transcript/audio/memory persistence path.
- **Invariant 2 — out of behavior scope, preserved:** There is no face candidate, confirmation, or private-memory load in this machine.
- **Invariant 3 — carried:** `activeProfileId` is a Main-only context field; this module exposes no renderer/model/IPC payload and never accepts a guest identifier from one.
- **Invariant 4 — out of behavior scope, preserved:** No profile switch or `updateAgent` operation exists. The session-clearing boundaries leave a future clean-session seam.
- **Invariant 5 — out of behavior scope, preserved:** No memory extraction job or owner snapshot is created.
- **Invariant 6 — out of behavior scope, preserved:** No control-turn or extraction routing exists.
- **Invariant 7 — out of behavior scope, preserved:** No spell, transcript matching, scene execution, or hardware parameter exists; `sceneInvocationId` remains metadata-only and is cleared at session boundaries.
- **Invariant 8 — carried:** The machine does not create a second microphone owner. Audio handoff failure is explicitly local and routes to Maintenance; suspension/failure context cleanup supports later release-before-acquire wiring.
- **Invariant 9 — carried:** Every accepted transition and every ignored event has a metadata-only event and a reason. Illegal events are not silently discarded.
- **Invariant 10 — carried:** Cloud failure degrades to OfflineLoop and local failures route to Maintenance; the pure machine does not wait on unrelated adapters or background services.
- **Invariant 11 — carried:** No model ID, model fallback, configuration resolver, or retry substitution exists in this file.
- **Invariant 12 — carried:** No credential access exists and telemetry cannot contain credentials; `safeStorage` remains a later Main-owned concern.

## Task 2: Implement the Main-Owned Lifecycle Contract

**Files:**

- Create: `tests/unit/lifecycle.test.ts`
- Create: `src/main/lifecycle.ts`
- Modify: none

**Interfaces:**

- Consumes: `LifecycleState` and `MirrorEvent` from `src/shared/types.ts`; existing `xstate` and Vitest package entries.
- Produces: the exact `LifecycleContext`, `LifecycleEvent`, `LifecycleTelemetry`, `LifecycleSnapshot`, `LifecycleSubscription`, `LifecycleActor`, and `createLifecycleActor()` signatures above for later Phase 0 boot wiring.

- [ ] **Step 1: The bounded implementer writes the focused failing tests first.** Create `tests/unit/lifecycle.test.ts` with the complete behavior contract below. The import of `../../src/main/lifecycle` is intentionally present before that file exists so the dedicated tester can observe RED.

```ts
import { describe, expect, it } from 'vitest';
import {
  createLifecycleActor,
  type LifecycleActor,
  type LifecycleEvent,
} from '../../src/main/lifecycle';
import type { LifecycleState, MirrorEvent } from '../../src/shared/types';

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
  const actor = createLifecycleActor({
    telemetry: {
      emit(event) {
        events.push(event);
      },
    },
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
  }> = [
    {
      name: 'starting LOCAL_READY',
      setup: [],
      event: { type: 'LOCAL_READY' },
      expected: 'dormant',
    },
    {
      name: 'dormant WAKE_DETECTED',
      setup: [{ type: 'LOCAL_READY' }],
      event: wake(),
      expected: 'activating',
    },
    {
      name: 'activating REALTIME_READY',
      setup: [{ type: 'LOCAL_READY' }, wake()],
      event: realtimeReady(),
      expected: 'active',
    },
    {
      name: 'activating CLOUD_FAILED',
      setup: [{ type: 'LOCAL_READY' }, wake()],
      event: { type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' },
      expected: 'offlineLoop',
    },
    {
      name: 'activating LOCAL_AUDIO_FAILED',
      setup: [{ type: 'LOCAL_READY' }, wake()],
      event: { type: 'LOCAL_AUDIO_FAILED', errorCode: 'mic_handoff_failed' },
      expected: 'maintenance',
    },
    {
      name: 'active IDLE_TIMEOUT',
      setup: activeSetup(),
      event: { type: 'IDLE_TIMEOUT' },
      expected: 'suspending',
    },
    {
      name: 'active SLEEP_REQUESTED',
      setup: activeSetup(),
      event: { type: 'SLEEP_REQUESTED' },
      expected: 'suspending',
    },
    {
      name: 'active CLOUD_FAILED',
      setup: activeSetup(),
      event: { type: 'CLOUD_FAILED', errorCode: 'network_lost' },
      expected: 'offlineLoop',
    },
    {
      name: 'suspending MEDIA_CLOSED',
      setup: [...activeSetup(), { type: 'SLEEP_REQUESTED' }],
      event: { type: 'MEDIA_CLOSED' },
      expected: 'dormant',
    },
    {
      name: 'offlineLoop RECOVERY_PASSED',
      setup: [...activeSetup(), { type: 'CLOUD_FAILED' }],
      event: { type: 'RECOVERY_PASSED' },
      expected: 'dormant',
    },
    {
      name: 'maintenance RETRY_STARTUP',
      setup: [{ type: 'LOCAL_CORE_FAILED', errorCode: 'core_failed' }],
      event: { type: 'RETRY_STARTUP' },
      expected: 'starting',
    },
  ];

  it.each(ordinaryEdges)('allows the legal edge $name', ({ setup, event, expected }) => {
    const { actor } = actorAfter(setup);

    actor.send(event);

    expect(actor.getState()).toBe(expected);
  });

  const localCoreSources: Array<{
    name: string;
    setup: LifecycleEvent[];
  }> = [
    { name: 'starting', setup: [] },
    { name: 'dormant', setup: [{ type: 'LOCAL_READY' }] },
    { name: 'activating', setup: [{ type: 'LOCAL_READY' }, wake()] },
    { name: 'active', setup: activeSetup() },
    { name: 'suspending', setup: [...activeSetup(), { type: 'SLEEP_REQUESTED' }] },
    { name: 'offlineLoop', setup: [...activeSetup(), { type: 'CLOUD_FAILED' }] },
    { name: 'maintenance', setup: [{ type: 'LOCAL_CORE_FAILED' }] },
  ];

  it.each(localCoreSources)('routes LOCAL_CORE_FAILED from $name to maintenance', ({ setup }) => {
    const { actor, events } = actorAfter(setup);
    const beforeCount = events.length;

    actor.send({ type: 'LOCAL_CORE_FAILED', errorCode: 'local_core_failed' });

    expect(actor.getState()).toBe('maintenance');
    expect(events).toHaveLength(beforeCount + 1);
    expect(events.at(-1)).toMatchObject({
      event: 'lifecycle_transition',
      module: 'app',
      status: 'failed',
      source: 'runtime',
      reason: expect.stringContaining('event=LOCAL_CORE_FAILED;cause=local_core_failed'),
      error_code: 'local_core_failed',
    });
  });

  it('routes active cloud failure to OfflineLoop with degraded metadata and generation bump', () => {
    const { actor, events } = actorAfter(activeSetup());

    actor.send({ type: 'CLOUD_FAILED', errorCode: 'cloud_unavailable' });

    expect(actor.getState()).toBe('offlineLoop');
    expect(actor.getContext()).toMatchObject({
      realtimeSessionId: null,
      activeProfileId: null,
      sceneInvocationId: null,
      sessionGeneration: 1,
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

  it('routes activating local audio failure to Maintenance with failed metadata', () => {
    const { actor, events } = actorAfter([{ type: 'LOCAL_READY' }, wake()]);

    actor.send({ type: 'LOCAL_AUDIO_FAILED', errorCode: 'mic_handoff_failed' });

    expect(actor.getState()).toBe('maintenance');
    expect(events.at(-1)).toEqual({
      module: 'app',
      event: 'lifecycle_transition',
      status: 'failed',
      reason: 'from=activating;to=maintenance;event=LOCAL_AUDIO_FAILED;cause=local_audio_failed',
      source: 'runtime',
      error_code: 'mic_handoff_failed',
    });
  });

  it('applies the activation, session, close, and OfflineLoop context boundaries', () => {
    const { actor } = makeActor();

    actor.send({ type: 'LOCAL_READY' });
    actor.send(wake('activation-42'));
    expect(actor.getContext()).toMatchObject({
      activationId: 'activation-42',
      realtimeSessionId: null,
      activeProfileId: null,
      sceneInvocationId: null,
      sessionGeneration: 0,
      lastInteractionAt: '2026-08-17T00:00:00.000Z',
    });

    actor.send(realtimeReady('session-42'));
    expect(actor.getContext().realtimeSessionId).toBe('session-42');
    actor.send({ type: 'SLEEP_REQUESTED' });
    actor.send({ type: 'MEDIA_CLOSED' });
    expect(actor.getContext()).toMatchObject({
      realtimeSessionId: null,
      activeProfileId: null,
      sceneInvocationId: null,
      sessionGeneration: 0,
    });

    actor.send(wake('activation-43'));
    actor.send(realtimeReady('session-43'));
    actor.send({ type: 'CLOUD_FAILED' });
    expect(actor.getContext()).toMatchObject({
      realtimeSessionId: null,
      activeProfileId: null,
      sceneInvocationId: null,
      sessionGeneration: 1,
      activationId: 'activation-43',
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

  it('publishes snapshots and stops publishing after unsubscribe', () => {
    const { actor } = makeActor();
    const snapshots: Array<{ state: LifecycleState }> = [];
    const subscription = actor.subscribe(({ state }) => {
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
```

- [ ] **Step 2: Have the dedicated tester verify RED.** From `C:\Project\magic-mirror`, run exactly:

```powershell
npm test -- tests/unit/lifecycle.test.ts
```

Expected RED signal: non-zero exit code; Vitest reports that `tests/unit/lifecycle.test.ts` cannot load `../../src/main/lifecycle` because the implementation file has not been created. The tester returns the complete command output and exit code to the root. Do not install packages or “fix” RED by changing the test command.

- [ ] **Step 3: The same bounded implementer writes the smallest XState v5 module.** Create `src/main/lifecycle.ts` with the exact interfaces above, one `setup().createMachine()` definition, one `createActor()` per `createLifecycleActor()` call, and no other module. The following sketch is the implementation shape and complete transition/telemetry mapping to preserve while writing the file:

```ts
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
```

The implementation must preserve the exact state/event tables rather than adding a wildcard transition that changes state. The `LEGAL_TARGETS` lookup exists to distinguish XState's normal unhandled-event no-op from a legal self-loop and to guarantee that every ignored event receives telemetry. `target` is used for legality; the emitted reason uses the actual `to` snapshot so tests catch a machine/config mismatch.

- [ ] **Step 4: Have the dedicated tester verify GREEN.** Run the focused suite first:

```powershell
npm test -- tests/unit/lifecycle.test.ts
```

Expected GREEN signal: exit code 0, Vitest reports `tests/unit/lifecycle.test.ts` passed with zero failed tests. The output must cover the happy route, all ordinary edges, local-core source matrix, cloud/audio fallbacks, context boundaries, illegal-event telemetry, and subscription behavior.

Then run the Main-focused typecheck:

```powershell
npm run typecheck:node
```

Expected GREEN signal: exit code 0 and no TypeScript diagnostics. The tester returns complete stdout/stderr and exit codes for both commands. The root does not run either command.

- [ ] **Step 5: The same bounded implementer may refactor only while the focused suite is green.** The implementer may reduce duplication in the already-defined `CAUSES`, `LEGAL_TARGETS`, or public snapshot conversion, but must retain the exact exported signatures, seven states, eleven event names, transition table, status mapping, reason strings, cleanup rules, and metadata-only event keys. A permitted extraction has this exact shape and no behavior change:

```ts
const publicSnapshot = (snapshot: {
  value: unknown;
  context: LifecycleContext;
}): LifecycleSnapshot => ({
  state: stateOf(snapshot.value),
  context: { ...snapshot.context },
});
```

If refactoring occurs, the dedicated tester reruns both Step 4 commands and records the complete output. No refactor is accepted while RED.

- [ ] **Step 6: Have the dedicated tester perform the final focused verification.** Rerun the exact focused suite and node typecheck after any optional refactor:

```powershell
npm test -- tests/unit/lifecycle.test.ts
npm run typecheck:node
```

Expected final signal: both commands exit 0, with the focused Vitest file passing and node typecheck reporting no diagnostics. This is unit evidence only; it is not P0-D1/P0-D2 demo evidence and does not advance Phase 0.

- [ ] **Step 7: Commit the green implementation tree through the root workflow.** After the tester has recorded GREEN and the final focused verification evidence, the root may commit the exact two files together:

```powershell
git add -- tests/unit/lifecycle.test.ts src/main/lifecycle.ts
git commit -m "feat: add main-owned lifecycle state machine"
```

The root reviews the diff, the tester evidence, invariant coverage, and scope before accepting the unit. This plan contains no claim that Task 2 has been implemented, tested, demoed, or completed.

## Execution Handoff

The planning worker stops after producing this document. For later execution, the root dispatches one bounded direct implementer for Step 1, a dedicated tester for Step 2, the same bounded implementer for Step 3, and the dedicated tester for Steps 4 and 6. Any Step 5 refactor remains with the same implementer and the same two-file scope. The root performs the external review only after receiving the tester's metadata-only evidence; no nested or reviewer worker is created.
