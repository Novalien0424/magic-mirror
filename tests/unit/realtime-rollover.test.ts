import { describe, expect, it } from 'vitest';
import {
  createRealtimeOutageRecoveryController,
  REALTIME_ROLLOVER_AFTER_MS,
} from '../../src/main/realtime/outage-recovery';

type Snapshot = Readonly<{
  configRevision: number;
  configFingerprint: string;
  modelRoleIds: Readonly<Record<string, string>>;
}>;

type PlaybackCompletion = Readonly<{
  source: 'primary' | 'fallback';
}>;

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function drainMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function expectMetadataOnly(record: Record<string, unknown>): void {
  const forbiddenKeys = [
    'secret',
    'clientSecret',
    'client_secret',
    'apiKey',
    'api_key',
    'credential',
    'rawConfig',
    'raw_config',
    'config',
    'configSnapshot',
    'config_snapshot',
    'session',
    'snapshot',
    'transcript',
    'audio',
    'audioChunk',
    'audio_chunk',
    'speech',
    'error',
  ];

  for (const forbiddenKey of forbiddenKeys) {
    expect(record).not.toHaveProperty(forbiddenKey);
  }
}

describe('realtime safe-boundary rollover', () => {
  it('waits for the turn and playback boundary before creating one fresh session', async () => {
    expect(REALTIME_ROLLOVER_AFTER_MS).toBe(3_600_000);

    const oldSnapshot: Snapshot = Object.freeze({
      configRevision: 17,
      configFingerprint: 'fingerprint-old',
      modelRoleIds: Object.freeze({
        realtime: 'role-old-realtime',
        transcription: 'role-old-transcription',
      }),
    });
    const currentSnapshot: Snapshot = Object.freeze({
      configRevision: 18,
      configFingerprint: 'fingerprint-current',
      modelRoleIds: Object.freeze({
        realtime: 'role-current-realtime',
        transcription: 'role-current-transcription',
      }),
    });
    const oldRealtimeSessionId = 'realtime-session-old';
    const newRealtimeSessionId = 'realtime-session-new';
    const oldCallerOwnedMediaStream = Object.freeze({
      kind: 'caller-owned-old-stream',
    });
    const freshCallerOwnedMediaStream = Object.freeze({
      kind: 'caller-owned-fresh-stream',
    });
    const currentTurnDone = deferred<void>();
    const playbackCompletion = deferred<PlaybackCompletion>();
    const order: string[] = [];
    const emittedEvents: Record<string, unknown>[] = [];
    const bufferedSpeech: unknown[] = [];
    const sentSpeech: unknown[] = [];
    let publishedSnapshot: Snapshot = oldSnapshot;
    let authoritativeSession: Record<string, unknown> = {
      realtimeSessionId: oldRealtimeSessionId,
      snapshot: oldSnapshot,
      reconnect: () => {
        throw new Error('reconnect is not a rollover operation');
      },
      bufferedSpeech,
      sendSpeech: (chunk: unknown) => {
        sentSpeech.push(chunk);
      },
    };
    let nowMs = 1_000;
    const mintedClientSecret = Symbol('ephemeral-client-credential');
    let mintCount = 0;
    let createCount = 0;
    let connectCount = 0;
    let releaseCount = 0;
    let acquireCount = 0;
    let closeCount = 0;
    let reconnectCount = 0;

    const oldSession = authoritativeSession;
    oldSession.reconnect = () => {
      reconnectCount += 1;
      throw new Error('reconnect is not a permitted surface');
    };

    const freshSession = {
      realtimeSessionId: newRealtimeSessionId,
      snapshot: currentSnapshot,
      connect: async ({ apiKey }: { apiKey: unknown }) => {
        connectCount += 1;
        order.push('connect fresh session');
        expect(apiKey).toBe(mintedClientSecret);
      },
    };

    const controller = createRealtimeOutageRecoveryController({
      rolloverAfterMs: REALTIME_ROLLOVER_AFTER_MS,
      getCurrentSession: () => authoritativeSession,
      currentTurnDone: () => {
        order.push('await currentTurnDone');
        return currentTurnDone.promise;
      },
      playbackCompletion: () => {
        order.push('await playback completion');
        return playbackCompletion.promise;
      },
      closeSession: async (session: typeof oldSession) => {
        expect(session).toBe(oldSession);
        closeCount += 1;
        order.push('close old session');
      },
      releaseMic: async () => {
        releaseCount += 1;
        order.push(
          releaseCount === 1
            ? 'release old microphone owner'
            : 'release fresh microphone owner',
        );
      },
      acquireMic: async () => {
        acquireCount += 1;
        expect(releaseCount).toBe(1);
        expect(freshCallerOwnedMediaStream).not.toBe(oldCallerOwnedMediaStream);
        order.push('acquire fresh microphone owner');
        return freshCallerOwnedMediaStream;
      },
      getPublishedSnapshot: () => {
        order.push('read current Published snapshot');
        return publishedSnapshot;
      },
      mintClientSecret: async (snapshot: Snapshot) => {
        mintCount += 1;
        order.push('mint one client secret');
        expect(snapshot).toBe(currentSnapshot);
        return mintedClientSecret;
      },
      createRealtimeSession: ({
        snapshot,
        mediaStream,
      }: {
        snapshot: Snapshot;
        mediaStream: typeof freshCallerOwnedMediaStream;
      }) => {
        createCount += 1;
        order.push('create one fresh session');
        expect(snapshot).toBe(currentSnapshot);
        expect(mediaStream).toBe(freshCallerOwnedMediaStream);
        expect(oldSession.snapshot).toBe(oldSnapshot);
        return freshSession;
      },
      setAuthoritativeSession: (session: typeof freshSession) => {
        order.push('publish new authoritative session');
        authoritativeSession = session;
      },
      emit: (event: Record<string, unknown>) => {
        emittedEvents.push(event);
      },
      now: () => nowMs,
    } as never);

    const rolloverPromise = controller.rolloverAtSafeBoundary();
    await drainMicrotasks();
    expect(order).toEqual(['await currentTurnDone']);

    publishedSnapshot = currentSnapshot;
    expect(oldSession.snapshot).toBe(oldSnapshot);
    currentTurnDone.resolve(undefined);
    await drainMicrotasks();
    expect(order).toEqual([
      'await currentTurnDone',
      'await playback completion',
    ]);

    nowMs = 1_042;
    playbackCompletion.resolve({ source: 'primary' });
    const result = (await rolloverPromise) as Record<string, unknown>;

    expect(order).toEqual([
      'await currentTurnDone',
      'await playback completion',
      'close old session',
      'release old microphone owner',
      'acquire fresh microphone owner',
      'read current Published snapshot',
      'mint one client secret',
      'create one fresh session',
      'connect fresh session',
      'publish new authoritative session',
    ]);
    expect(closeCount).toBe(1);
    expect(releaseCount).toBe(1);
    expect(acquireCount).toBe(1);
    expect(mintCount).toBe(1);
    expect(createCount).toBe(1);
    expect(connectCount).toBe(1);
    expect(reconnectCount).toBe(0);
    expect(bufferedSpeech).toEqual([]);
    expect(sentSpeech).toEqual([]);
    expect(authoritativeSession.realtimeSessionId).toBe(newRealtimeSessionId);
    expect(authoritativeSession.snapshot).toBe(currentSnapshot);
    expect(controller).not.toHaveProperty('reconnect');

    expect(result).toMatchObject({
      event: 'realtime_rollover',
      status: 'success',
      reason: 'safe_boundary',
      oldRealtimeSessionId,
      newRealtimeSessionId,
      configRevision: currentSnapshot.configRevision,
      configFingerprint: currentSnapshot.configFingerprint,
      modelRoleIds: currentSnapshot.modelRoleIds,
      playbackSource: 'primary',
      count: 1,
      durationMs: 42,
    });
    expectMetadataOnly(result);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toEqual(result);
    expectMetadataOnly(emittedEvents[0]);
  });

  it('reports a playback-boundary failure without creating or swapping a session', async () => {
    const oldSnapshot: Snapshot = Object.freeze({
      configRevision: 17,
      configFingerprint: 'fingerprint-old',
      modelRoleIds: Object.freeze({
        realtime: 'role-old-realtime',
        transcription: 'role-old-transcription',
      }),
    });
    const currentSnapshot: Snapshot = Object.freeze({
      configRevision: 18,
      configFingerprint: 'fingerprint-current',
      modelRoleIds: Object.freeze({
        realtime: 'role-current-realtime',
        transcription: 'role-current-transcription',
      }),
    });
    const oldRealtimeSessionId = 'realtime-session-old';
    const newRealtimeSessionId = 'realtime-session-new';
    const callerOwnedMediaStream = Object.freeze({ kind: 'caller-owned-stream' });
    const order: string[] = [];
    const emittedEvents: Record<string, unknown>[] = [];
    const oldSession: Record<string, unknown> = {
      realtimeSessionId: oldRealtimeSessionId,
      snapshot: oldSnapshot,
    };
    let authoritativeSession: Record<string, unknown> = oldSession;
    let closeCount = 0;
    let releaseCount = 0;
    let publishedSnapshotReadCount = 0;
    let mintCount = 0;
    let createCount = 0;
    let connectCount = 0;
    let reconnectCount = 0;
    let publishCount = 0;
    const mintedClientSecret = Symbol('ephemeral-client-credential');

    oldSession.reconnect = () => {
      reconnectCount += 1;
      throw new Error('reconnect is not a rollover operation');
    };

    const controller = createRealtimeOutageRecoveryController({
      rolloverAfterMs: REALTIME_ROLLOVER_AFTER_MS,
      getCurrentSession: () => authoritativeSession,
      currentTurnDone: async () => {
        order.push('await currentTurnDone');
      },
      playbackCompletion: async () => {
        order.push('await playback completion');
        throw new Error('raw playback boundary failure');
      },
      closeSession: async () => {
        closeCount += 1;
        order.push('close old session');
      },
      releaseMic: async () => {
        releaseCount += 1;
        order.push('release old microphone owner');
      },
      getPublishedSnapshot: () => {
        publishedSnapshotReadCount += 1;
        order.push('read current Published snapshot');
        return currentSnapshot;
      },
      mintClientSecret: async () => {
        mintCount += 1;
        order.push('mint one client secret');
        return mintedClientSecret;
      },
      createRealtimeSession: () => {
        createCount += 1;
        order.push('create one fresh session');
        return {
          realtimeSessionId: newRealtimeSessionId,
          connect: async () => {
            connectCount += 1;
            order.push('connect fresh session');
          },
        };
      },
      getCallerOwnedMediaStream: () => callerOwnedMediaStream,
      setAuthoritativeSession: () => {
        publishCount += 1;
        order.push('publish new authoritative session');
      },
      emit: (event: Record<string, unknown>) => {
        emittedEvents.push(event);
      },
      now: () => 1_042,
    } as never);

    const result = (await controller.rolloverAtSafeBoundary()) as Record<string, unknown>;

    expect(order).toEqual(['await currentTurnDone', 'await playback completion']);
    expect(closeCount).toBe(0);
    expect(releaseCount).toBe(0);
    expect(publishedSnapshotReadCount).toBe(0);
    expect(mintCount).toBe(0);
    expect(createCount).toBe(0);
    expect(connectCount).toBe(0);
    expect(reconnectCount).toBe(0);
    expect(publishCount).toBe(0);
    expect(authoritativeSession).toBe(oldSession);
    expect(authoritativeSession.realtimeSessionId).toBe(oldRealtimeSessionId);
    expect(controller).not.toHaveProperty('reconnect');

    expect(result).toMatchObject({
      event: 'realtime_rollover',
      status: 'failure',
      reason: 'playback_boundary_failed',
      oldRealtimeSessionId,
      configRevision: oldSnapshot.configRevision,
      configFingerprint: oldSnapshot.configFingerprint,
      modelRoleIds: oldSnapshot.modelRoleIds,
    });
    expect(result).not.toHaveProperty('newRealtimeSessionId');
    expectMetadataOnly(result);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toEqual(result);
    expectMetadataOnly(emittedEvents[0]);
  });

  it('reports fresh-session creation failure after the safe boundary without reconnecting', async () => {
    const oldSnapshot: Snapshot = Object.freeze({
      configRevision: 17,
      configFingerprint: 'fingerprint-old',
      modelRoleIds: Object.freeze({
        realtime: 'role-old-realtime',
        transcription: 'role-old-transcription',
      }),
    });
    const currentSnapshot: Snapshot = Object.freeze({
      configRevision: 18,
      configFingerprint: 'fingerprint-current',
      modelRoleIds: Object.freeze({
        realtime: 'role-current-realtime',
        transcription: 'role-current-transcription',
      }),
    });
    const oldRealtimeSessionId = 'realtime-session-old';
    const oldCallerOwnedMediaStream = Object.freeze({
      kind: 'caller-owned-old-stream',
    });
    const freshCallerOwnedMediaStream = Object.freeze({
      kind: 'caller-owned-fresh-stream',
    });
    const order: string[] = [];
    const emittedEvents: Record<string, unknown>[] = [];
    const oldSession: Record<string, unknown> = {
      realtimeSessionId: oldRealtimeSessionId,
      snapshot: oldSnapshot,
    };
    let authoritativeSession: Record<string, unknown> = oldSession;
    let closeCount = 0;
    let releaseCount = 0;
    let acquireCount = 0;
    let mintCount = 0;
    let createCount = 0;
    let connectCount = 0;
    let reconnectCount = 0;
    let publishCount = 0;
    const mintedClientSecret = Symbol('ephemeral-client-credential');

    oldSession.reconnect = () => {
      reconnectCount += 1;
      throw new Error('reconnect is not a rollover operation');
    };

    const controller = createRealtimeOutageRecoveryController({
      rolloverAfterMs: REALTIME_ROLLOVER_AFTER_MS,
      getCurrentSession: () => authoritativeSession,
      currentTurnDone: async () => {
        order.push('await currentTurnDone');
      },
      playbackCompletion: async () => {
        order.push('await playback completion');
        return { source: 'fallback' };
      },
      closeSession: async (session: typeof oldSession) => {
        expect(session).toBe(oldSession);
        closeCount += 1;
        order.push('close old session');
      },
      releaseMic: async () => {
        releaseCount += 1;
        order.push(
          releaseCount === 1
            ? 'release old microphone owner'
            : 'release fresh microphone owner',
        );
      },
      acquireMic: async () => {
        acquireCount += 1;
        expect(releaseCount).toBe(1);
        expect(freshCallerOwnedMediaStream).not.toBe(oldCallerOwnedMediaStream);
        order.push('acquire fresh microphone owner');
        return freshCallerOwnedMediaStream;
      },
      getPublishedSnapshot: () => {
        order.push('read current Published snapshot');
        return currentSnapshot;
      },
      mintClientSecret: async (snapshot: Snapshot) => {
        mintCount += 1;
        order.push('mint one client secret');
        expect(snapshot).toBe(currentSnapshot);
        return mintedClientSecret;
      },
      createRealtimeSession: ({
        snapshot,
        mediaStream,
      }: {
        snapshot: Snapshot;
        mediaStream: typeof freshCallerOwnedMediaStream;
      }) => {
        createCount += 1;
        order.push('create one fresh session');
        expect(snapshot).toBe(currentSnapshot);
        expect(mediaStream).toBe(freshCallerOwnedMediaStream);
        throw new Error('raw fresh-session creation failure');
      },
      setAuthoritativeSession: () => {
        publishCount += 1;
        order.push('publish new authoritative session');
      },
      emit: (event: Record<string, unknown>) => {
        emittedEvents.push(event);
      },
      now: () => 1_042,
    } as never);

    const result = (await controller.rolloverAtSafeBoundary()) as Record<string, unknown>;

    expect(order).toEqual([
      'await currentTurnDone',
      'await playback completion',
      'close old session',
      'release old microphone owner',
      'acquire fresh microphone owner',
      'read current Published snapshot',
      'mint one client secret',
      'create one fresh session',
      'release fresh microphone owner',
    ]);
    expect(closeCount).toBe(1);
    expect(releaseCount).toBe(2);
    expect(acquireCount).toBe(1);
    expect(mintCount).toBe(1);
    expect(createCount).toBe(1);
    expect(connectCount).toBe(0);
    expect(reconnectCount).toBe(0);
    expect(publishCount).toBe(0);
    expect(authoritativeSession).toBe(oldSession);
    expect(authoritativeSession.realtimeSessionId).toBe(oldRealtimeSessionId);
    expect(controller).not.toHaveProperty('reconnect');

    expect(result).toMatchObject({
      event: 'realtime_rollover',
      status: 'failure',
      reason: 'fresh_session_creation_failed',
      oldRealtimeSessionId,
      configRevision: currentSnapshot.configRevision,
      configFingerprint: currentSnapshot.configFingerprint,
      modelRoleIds: currentSnapshot.modelRoleIds,
    });
    expect(result).not.toHaveProperty('newRealtimeSessionId');
    expectMetadataOnly(result);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toEqual(result);
    expectMetadataOnly(emittedEvents[0]);
  });

  it('reports microphone acquisition failure as Maintenance without replacing the old session', async () => {
    const oldSnapshot: Snapshot = Object.freeze({
      configRevision: 17,
      configFingerprint: 'fingerprint-old',
      modelRoleIds: Object.freeze({
        realtime: 'role-old-realtime',
        transcription: 'role-old-transcription',
      }),
    });
    const currentSnapshot: Snapshot = Object.freeze({
      configRevision: 18,
      configFingerprint: 'fingerprint-current',
      modelRoleIds: Object.freeze({
        realtime: 'role-current-realtime',
        transcription: 'role-current-transcription',
      }),
    });
    const oldRealtimeSessionId = 'realtime-session-old';
    const oldCallerOwnedMediaStream = Object.freeze({
      kind: 'caller-owned-old-stream',
    });
    const freshCallerOwnedMediaStream = Object.freeze({
      kind: 'caller-owned-fresh-stream',
    });
    const order: string[] = [];
    const emittedEvents: Record<string, unknown>[] = [];
    const oldSession: Record<string, unknown> = {
      realtimeSessionId: oldRealtimeSessionId,
      snapshot: oldSnapshot,
    };
    let authoritativeSession: Record<string, unknown> = oldSession;
    let closeCount = 0;
    let releaseCount = 0;
    let acquireCount = 0;
    let publishedSnapshotReadCount = 0;
    let mintCount = 0;
    let createCount = 0;
    let connectCount = 0;
    let reconnectCount = 0;
    let publishCount = 0;

    oldSession.reconnect = () => {
      reconnectCount += 1;
      throw new Error('reconnect is not a rollover operation');
    };

    const controller = createRealtimeOutageRecoveryController({
      rolloverAfterMs: REALTIME_ROLLOVER_AFTER_MS,
      getCurrentSession: () => authoritativeSession,
      currentTurnDone: async () => {
        order.push('await currentTurnDone');
      },
      playbackCompletion: async () => {
        order.push('await playback completion');
        return { source: 'primary' };
      },
      closeSession: async (session: typeof oldSession) => {
        expect(session).toBe(oldSession);
        closeCount += 1;
        order.push('close old session');
      },
      releaseMic: async () => {
        releaseCount += 1;
        order.push('release old microphone owner');
      },
      acquireMic: async () => {
        acquireCount += 1;
        expect(releaseCount).toBe(1);
        expect(freshCallerOwnedMediaStream).not.toBe(oldCallerOwnedMediaStream);
        order.push('acquire fresh microphone owner');
        throw new Error('raw fresh microphone acquisition failure');
      },
      getPublishedSnapshot: () => {
        publishedSnapshotReadCount += 1;
        return currentSnapshot;
      },
      mintClientSecret: async () => {
        mintCount += 1;
        return Symbol('ephemeral-client-credential');
      },
      createRealtimeSession: () => {
        createCount += 1;
        return {
          realtimeSessionId: 'realtime-session-new',
          connect: async () => {
            connectCount += 1;
          },
        };
      },
      setAuthoritativeSession: (session: Record<string, unknown>) => {
        publishCount += 1;
        authoritativeSession = session;
      },
      emit: (event: Record<string, unknown>) => {
        emittedEvents.push(event);
      },
      now: () => 1_042,
    } as never);

    const result = (await controller.rolloverAtSafeBoundary()) as Record<string, unknown>;

    expect(order).toEqual([
      'await currentTurnDone',
      'await playback completion',
      'close old session',
      'release old microphone owner',
      'acquire fresh microphone owner',
    ]);
    expect(closeCount).toBe(1);
    expect(releaseCount).toBe(1);
    expect(acquireCount).toBe(1);
    expect(publishedSnapshotReadCount).toBe(0);
    expect(mintCount).toBe(0);
    expect(createCount).toBe(0);
    expect(connectCount).toBe(0);
    expect(publishCount).toBe(0);
    expect(reconnectCount).toBe(0);
    expect(authoritativeSession).toBe(oldSession);
    expect(authoritativeSession.realtimeSessionId).toBe(oldRealtimeSessionId);
    expect(controller).not.toHaveProperty('reconnect');

    expect(result).toMatchObject({
      event: 'realtime_rollover',
      status: 'failure',
      reason: 'mic_acquisition_failed',
      classification: 'Maintenance',
      oldRealtimeSessionId,
    });
    expect(result).not.toHaveProperty('newRealtimeSessionId');
    expectMetadataOnly(result);

    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toEqual(result);
    expectMetadataOnly(emittedEvents[0]);
  });
});
