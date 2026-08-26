import { describe, expect, it, vi } from "vitest";

import {
  createRealtimeSession,
  type CreateRealtimeSessionInput,
  type RealtimeSessionDependencies,
} from "../../src/renderer/realtime/realtime-session-adapter";
import { createDeterministicRealtimeTransport } from "../../src/renderer/realtime/realtime-transport";
import type { RealtimeMetadataEvent } from "../../src/shared/realtime-events";
import type { SessionModelSnapshot } from "../../src/shared/types";

type SessionEventListener = (event: unknown) => void;

type AdapterProbe = {
  constructorCalls: unknown[][];
  connect: ReturnType<typeof vi.fn>;
  interrupt: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  emit: (eventName: string, event: unknown) => void;
  dependencies: RealtimeSessionDependencies;
};

function makeAdapterProbe(): AdapterProbe {
  const listeners = new Map<string, SessionEventListener[]>();
  const constructorCalls: unknown[][] = [];
  const connect = vi.fn(async (..._args: unknown[]) => undefined);
  const interrupt = vi.fn(async (..._args: unknown[]) => undefined);
  const close = vi.fn(async (..._args: unknown[]) => undefined);

  const fakeSession = {
    connect,
    interrupt,
    close,
    on: vi.fn((_eventName: string, listener: SessionEventListener) => {
      const eventListeners = listeners.get(_eventName) ?? [];
      eventListeners.push(listener);
      listeners.set(_eventName, eventListeners);
    }),
  };

  const RealtimeSession = vi.fn(function (...args: unknown[]) {
    constructorCalls.push(args);
    return fakeSession;
  });

  const dependencies: RealtimeSessionDependencies = {
    RealtimeSession: RealtimeSession as unknown as RealtimeSessionDependencies["RealtimeSession"],
    createTransport: () => createDeterministicRealtimeTransport(),
  };

  return {
    constructorCalls,
    connect,
    interrupt,
    close,
    emit: (eventName: string, event: unknown) => {
      for (const listener of listeners.get(eventName) ?? []) {
        listener(event);
      }
    },
    dependencies,
  };
}

function makeSnapshot(): SessionModelSnapshot {
  return Object.freeze({
    configVersion: 1,
    fingerprint: "snapshot-fingerprint",
    sdkVersion: "0.16.1",
    realtimeDialogue: "configured-realtime-model",
    inputTranscription: "configured-transcription-model",
    memoryExtractor: "configured-memory-model",
    voice: "configured-voice",
    turnDetectionProfile: "semantic-vad-interruptible",
    reasoningEffort: "medium",
    takenAt: "2026-08-21T00:00:00.000Z",
  });
}

function makeSessionInput(
  snapshot: ReturnType<typeof makeSnapshot>,
  eventSink: (event: RealtimeMetadataEvent) => void,
  probe: AdapterProbe,
): CreateRealtimeSessionInput {
  return {
    snapshot,
    clientSecret: "opaque-transient-input",
    mediaStream: {} as MediaStream,
    audioElement: {} as HTMLAudioElement,
    sessionId: "session-a",
    eventSink,
    dependencies: probe.dependencies,
  };
}

const UNTRUSTED_CONNECT_FAILURE_SUFFIX = " :: untrusted-provider-suffix-opaque";

const SDK_SIGNALING_400_DISCRIMINATION_CASES = [
  {
    name: "model mismatch subreason",
    suffix: " :: synthetic model mismatch",
    expectedToken: "start_connect_model_mismatch",
  },
  {
    name: "model access denied subreason",
    suffix: " :: synthetic model access denied",
    expectedToken: "start_connect_model_access_denied",
  },
  {
    name: "model missing subreason",
    suffix: " :: synthetic model missing",
    expectedToken: "start_connect_model_missing",
  },
  {
    name: "model unsupported subreason",
    suffix: " :: synthetic model unsupported",
    expectedToken: "start_connect_model_unsupported",
  },
  {
    name: "model rejection detail",
    suffix: " :: synthetic model rejection detail",
    expectedToken: "start_connect_model_rejected",
  },
  {
    name: "ambiguous model detail",
    suffix: " :: synthetic model issue",
    expectedToken: "start_connect_model_rejected",
  },
  {
    name: "SDP/offer rejection detail",
    suffix: " :: synthetic invalid SDP offer detail",
    expectedToken: "start_connect_sdp_rejected",
  },
{
name: "unrelated detail fallback",
suffix: " :: synthetic unrelated detail",
expectedToken: "start_connect_bad_request",
},
{
name: "punctuation-separated model with no-such wording",
suffix: " :: synthetic MODEL/no-such model",
expectedToken: "start_connect_model_missing",
},
{
name: "not-available wording",
suffix: " :: synthetic model is not available",
expectedToken: "start_connect_model_missing",
},
{
name: "not-enabled wording",
suffix: " :: synthetic model is not enabled",
expectedToken: "start_connect_model_access_denied",
},
{
name: "not-supported wording",
suffix: " :: synthetic model is not supported",
expectedToken: "start_connect_model_unsupported",
},
{
name: "invalid-model wording",
suffix: " :: synthetic invalid/model",
expectedToken: "start_connect_model_unsupported",
},
{
name: "verification wording",
suffix: " :: synthetic model verification failed",
expectedToken: "start_connect_model_access_denied",
},
{
name: "match wording",
suffix: " :: synthetic model does not match",
expectedToken: "start_connect_model_mismatch",
},
{
name: "matching wording",
suffix: " :: synthetic model matching failed",
expectedToken: "start_connect_model_mismatch",
},
{
name: "required wording",
suffix: " :: synthetic model required",
expectedToken: "start_connect_model_missing",
},
] as const;

const SDK_SIGNALING_400_MODEL_UNSUPPORTED_CATEGORY_CASES = [
  {
    name: "reasoning marker",
    detail: " :: synthetic model unsupported reasoning",
    expectedToken: "start_connect_reasoning_unsupported",
  },
  {
    name: "effort marker",
    detail: " :: synthetic model unsupported effort",
    expectedToken: "start_connect_reasoning_unsupported",
  },
  {
    name: "input transcription markers",
    detail: " :: synthetic model unsupported input transcription",
    expectedToken: "start_connect_input_transcription_unsupported",
  },
  {
    name: "transcribe marker",
    detail: " :: synthetic model unsupported transcribe",
    expectedToken: "start_connect_input_transcription_unsupported",
  },
  {
    name: "voice marker",
    detail: " :: synthetic model unsupported voice",
    expectedToken: "start_connect_voice_unsupported",
  },
  {
    name: "turn detection markers",
    detail: " :: synthetic model unsupported turn detection",
    expectedToken: "start_connect_turn_detection_unsupported",
  },
  {
    name: "VAD marker",
    detail: " :: synthetic MODEL/UNSUPPORTED vad",
    expectedToken: "start_connect_turn_detection_unsupported",
  },
  {
    name: "audio output markers",
    detail: " :: synthetic model unsupported audio output",
    expectedToken: "start_connect_audio_output_unsupported",
  },
  {
    name: "modalities marker",
    detail: " :: synthetic model unsupported modalities",
    expectedToken: "start_connect_audio_output_unsupported",
  },
] as const;

const SDK_SIGNALING_400_MODEL_MENTION_IDS = [
  "gpt-realtime-2.1",
  "gpt-realtime-2.1-mini",
  "gpt-realtime-2",
  "gpt-realtime-1.5",
  "gpt-realtime",
  "gpt-realtime-mini",
  "gpt-realtime-2025-08-28",
  "gpt-4o-realtime-preview",
  "gpt-4o-realtime-preview-2024-10-01",
  "gpt-4o-realtime-preview-2024-12-17",
  "gpt-4o-realtime-preview-2025-06-03",
  "gpt-4o-mini-realtime-preview",
  "gpt-4o-mini-realtime-preview-2024-12-17",
] as const;

const SDK_CONNECT_FAILURE_MESSAGE_CASES = [
  {
    name: "browser ephemeral-key guard",
    message:
      "Using the WebRTC connection in a browser environment requires an ephemeral client key." +
      UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_ephemeral_key_required",
  },
  {
    name: "connection closed during setup",
    message: "Connection closed before setup completed" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_setup_closed",
  },
  {
    name: "connection closed before session config acknowledgement",
    message:
      "Connection closed before session config was acknowledged" +
      UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_setup_closed",
  },
  {
    name: "missing SDP offer",
    message: "Failed to create offer" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_sdp_offer_missing",
  },
  {
    name: "signaling HTTP status 400",
    message: "Realtime call request failed with status 400" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_bad_request",
  },
  {
    name: "signaling HTTP status 401",
    message: "Realtime call request failed with status 401" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_auth_failed",
  },
  {
    name: "signaling HTTP status 403",
    message: "Realtime call request failed with status 403" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_permission_failed",
  },
  {
    name: "signaling HTTP status 404",
    message: "Realtime call request failed with status 404" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_model_unavailable",
  },
  {
    name: "signaling HTTP status 408",
    message: "Realtime call request failed with status 408" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_network_failed",
  },
  {
    name: "signaling HTTP status 429",
    message: "Realtime call request failed with status 429" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_rate_limited",
  },
  {
    name: "signaling HTTP status 500",
    message: "Realtime call request failed with status 500" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_service_unavailable",
  },
  {
    name: "signaling HTTP unrecognized status",
    message: "Realtime call request failed with status 599" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_http_other",
  },
  {
    name: "SDP answer parse failure",
    message: "Failed to parse SessionDescription" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_sdp_answer_failed",
  },
  {
    name: "unknown error message",
    message: "opaque-provider-error" + UNTRUSTED_CONNECT_FAILURE_SUFFIX,
    expectedToken: "start_connect_transport_failed",
  },
] as const;

const SDK_SIGNALING_400_PARAM_CASES = [
  {
    param: "model",
    expectedToken: "start_connect_bad_request_param_model",
  },
  {
    param: "session.model",
    expectedToken: "start_connect_bad_request_param_session_model",
  },
  {
    param: "type",
    expectedToken: "start_connect_bad_request_param_type",
  },
  {
    param: "session.type",
    expectedToken: "start_connect_bad_request_param_session_type",
  },
  {
    param: "voice",
    expectedToken: "start_connect_bad_request_param_voice",
  },
  {
    param: "session.voice",
    expectedToken: "start_connect_bad_request_param_session_voice",
  },
  {
    param: "input_audio_transcription.model",
    expectedToken: "start_connect_bad_request_param_input_audio_transcription_model",
  },
  {
    param: "session.input_audio_transcription.model",
    expectedToken: "start_connect_bad_request_param_session_input_audio_transcription_model",
  },
  {
    param: "audio.input.transcription.model",
    expectedToken: "start_connect_bad_request_param_audio_input_transcription_model",
  },
  {
    param: "session.audio.input.transcription.model",
    expectedToken: "start_connect_bad_request_param_session_audio_input_transcription_model",
  },
] as const;

describe("realtime session adapter", () => {
  it("exposes the session factory and a handle with stable controls", async () => {
    expect(createRealtimeSession).toBeTypeOf("function");

    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    expect(handle.realtimeSessionId).toEqual(expect.any(String));
    expect(handle.sessionGeneration).toEqual(expect.any(Number));

    await handle.interrupt();
    await handle.close("user_requested");

    expect(probe.interrupt).toHaveBeenCalledTimes(1);
    expect(probe.close).toHaveBeenCalledTimes(1);
    expect(probe.close).toHaveBeenCalledWith();
    expect(eventSink).toHaveBeenCalledWith(
      expect.objectContaining({
        realtimeSessionId: handle.realtimeSessionId,
        sessionGeneration: handle.sessionGeneration,
        reason: "user_requested",
      }),
    );
  });

  it("forwards only the configured constructor values and the exact transient connect input", async () => {
    const snapshot = makeSnapshot();
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const clientSecret = "opaque-transient-input";
    const handle = createRealtimeSession({
      ...makeSessionInput(snapshot, eventSink, probe),
      clientSecret,
    });

    await handle.connect();

    const constructorConfig = probe.constructorCalls[0]?.at(-1) as Record<string, unknown>;
    expect(constructorConfig).toEqual(
      expect.objectContaining({
        model: snapshot.realtimeDialogue,
        historyStoreAudio: false,
        tracingDisabled: true,
        config: expect.objectContaining({
          audio: expect.objectContaining({
            input: expect.objectContaining({
              transcription: expect.objectContaining({ model: snapshot.inputTranscription }),
              turnDetection: {
                type: "semantic_vad",
                interruptResponse: true,
              },
            }),
            output: expect.objectContaining({ voice: snapshot.voice }),
          }),
          reasoning: { effort: snapshot.reasoningEffort },
          tracing: null,
        }),
      }),
    );
    expect(constructorConfig).not.toHaveProperty("fallbackModel");
    expect(constructorConfig).not.toHaveProperty("fallbackConfig");
    expect(probe.connect).toHaveBeenCalledTimes(1);
    expect(probe.connect.mock.calls[0]).toHaveLength(1);
    expect(probe.connect).toHaveBeenCalledWith({ apiKey: clientSecret });
  });

  it.each(SDK_CONNECT_FAILURE_MESSAGE_CASES)(
    "classifies $name from only its bounded SDK message prefix",
    async ({ message, expectedToken }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(new Error(message));
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(
        UNTRUSTED_CONNECT_FAILURE_SUFFIX,
      );
    },
  );

  it.each(SDK_SIGNALING_400_DISCRIMINATION_CASES)(
    "classifies only an allowlisted status-400 detail as $name",
    async ({ suffix, expectedToken }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error("Realtime call request failed with status 400" + suffix),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(suffix);
    },
  );

  it.each(SDK_SIGNALING_400_MODEL_UNSUPPORTED_CATEGORY_CASES)(
    "classifies a generic model-unsupported detail by its sole closed category: $name",
    async ({ detail, expectedToken }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error("Realtime call request failed with status 400" + detail),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(detail);
    },
  );

  it.each([
    {
      name: "unknown marker",
      detail: " :: synthetic model unsupported capability",
    },
    {
      name: "two category markers",
      detail: " :: synthetic model unsupported reasoning voice",
    },
    {
      name: "input and output category markers",
      detail: " :: synthetic model unsupported input output",
    },
  ] as const)(
    "keeps an unknown or ambiguous model-unsupported category generic: $name",
    async ({ detail }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error("Realtime call request failed with status 400" + detail),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_model_unsupported");
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(detail);
    },
  );

  it("keeps an exact parsed error.param token above a model-unsupported category", async () => {
    const rawBody = JSON.stringify({
      error: {
        message: "model unsupported reasoning",
        param: "voice",
      },
    });
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error("Realtime call request failed with status 400 :: " + rawBody),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_bad_request_param_voice");
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain(rawBody);
  });

  it.each(SDK_SIGNALING_400_PARAM_CASES)(
    "returns the fixed structural token for SDK error.param $param",
    async ({ param, expectedToken }) => {
      const rawBody = JSON.stringify({
        error: {
          message: "model unsupported",
          type: "invalid_request_error",
          param,
          code: null,
        },
      });
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error("Realtime call request failed with status 400 :: " + rawBody),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(rawBody);
    },
  );

  it.each([
    {
      name: "unknown param",
      message:
        "Realtime call request failed with status 400 :: " +
        JSON.stringify({ error: { message: "model unsupported", param: "unknown" } }),
      expectedToken: "start_connect_model_unsupported",
    },
    {
      name: "missing param",
      message:
        "Realtime call request failed with status 400 :: " +
        JSON.stringify({ error: { message: "model unsupported" } }),
      expectedToken: "start_connect_model_unsupported",
    },
    {
      name: "non-string param",
      message:
        "Realtime call request failed with status 400 :: " +
        JSON.stringify({ error: { message: "model unsupported", param: ["voice"] } }),
      expectedToken: "start_connect_model_unsupported",
    },
    {
      name: "malformed JSON",
      message: "Realtime call request failed with status 400 :: {\"error\":",
      expectedToken: "start_connect_bad_request",
    },
    {
      name: "non-object JSON",
      message: "Realtime call request failed with status 400 :: [\"provider\",\"body\"]",
      expectedToken: "start_connect_bad_request",
    },
    {
      name: "oversized JSON",
      message:
        "Realtime call request failed with status 400 :: " +
        JSON.stringify({ error: { message: "x".repeat(4096), param: "voice" } }),
      expectedToken: "start_connect_bad_request",
    },
    {
      name: "extra wrapper",
      message:
        "Realtime call request failed with status 400 :: " +
        JSON.stringify({ body: { error: { param: "voice" } } }),
      expectedToken: "start_connect_bad_request",
    },
    {
      name: "non-400 status",
      message:
        "Realtime call request failed with status 401 :: " +
        JSON.stringify({ error: { message: "model unsupported", param: "voice" } }),
      expectedToken: "start_connect_auth_failed",
    },
    {
      name: "non-SDK error",
      message: JSON.stringify({ error: { message: "model unsupported", param: "voice" } }),
      expectedToken: "start_connect_transport_failed",
    },
  ] as const)(
    "preserves the existing classifier for $name without a structural token",
    async ({ message, expectedToken }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(new Error(message));
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      const token = handle.getLastConnectFailureToken?.();
      expect(token).toBe(expectedToken);
      expect(token).not.toMatch(/^start_connect_bad_request_param_/);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(message);
    },
  );

  it.each([
    {
      name: "configured realtime dialogue model",
      modelId: "configured-realtime-model",
      expectedToken: "start_connect_realtime_model_unsupported",
    },
    {
      name: "configured input transcription model",
      modelId: "configured-transcription-model",
      expectedToken: "start_connect_input_transcription_model_unsupported",
    },
  ] as const)(
    "attributes a bounded status-400 model-unsupported failure to $name",
    async ({ modelId, expectedToken }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error(
          "Realtime call request failed with status 400 :: Invalid 'session.model': '" +
            modelId +
            "'. Supported values are: 'provider-model' :: opaque-provider-model-detail",
        ),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain("opaque-provider-model-detail");
    },
  );

  it.each([
    {
      name: "missing model identifier",
      detail: " :: synthetic model unsupported",
    },
    {
      name: "both configured model identifiers",
      detail:
        " :: synthetic model unsupported for configured-realtime-model and configured-transcription-model",
    },
  ] as const)(
    "keeps an ambiguous bounded status-400 model-unsupported failure generic: $name",
    async ({ detail }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error("Realtime call request failed with status 400" + detail),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_model_unsupported");
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(detail);
    },
  );

  it.each([
    {
      name: "configured realtime dialogue ID",
      detail: " :: model unsupported: gpt-4o-realtime-preview",
      expectedToken: "start_connect_realtime_model_unsupported",
    },
    {
      name: "configured input transcription ID",
      detail: " :: model unsupported: gpt-live-transcribe",
      expectedToken: "start_connect_input_transcription_model_unsupported",
    },
    {
      name: "both configured IDs",
      detail:
        " :: model unsupported: gpt-4o-realtime-preview and gpt-live-transcribe",
      expectedToken: "start_connect_model_unsupported",
    },
    {
      name: "configured ID inside a larger token",
      detail: " :: model unsupported: xgpt-4o-realtime-preview",
      expectedToken: "start_connect_model_unsupported",
    },
  ] as const)(
    "classifies a plain status-400 model detail by exactly bounded packaged ID: $name",
    async ({ detail, expectedToken }) => {
      const snapshot = Object.freeze({
        ...makeSnapshot(),
        realtimeDialogue: "gpt-4o-realtime-preview",
        inputTranscription: "gpt-live-transcribe",
      });
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error("Realtime call request failed with status 400" + detail),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(snapshot, eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(detail);
    },
  );

  it("does not use a packaged ID found in an unsupported detail's supported-values text", async () => {
    const snapshot = Object.freeze({
      ...makeSnapshot(),
      realtimeDialogue: "gpt-4o-realtime-preview",
      inputTranscription: "gpt-live-transcribe",
    });
    const detail =
      " :: model unsupported: provider-model. Supported values are: 'gpt-4o-realtime-preview'";
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error("Realtime call request failed with status 400" + detail),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(snapshot, eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_model_unsupported");
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain(detail);
  });

  it("does not treat a configured realtime ID in the strict supported-values list as rejected", async () => {
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error(
        "Realtime call request failed with status 400 :: Invalid 'session.model': 'provider-model'. " +
          "Supported values are: 'gpt-realtime-2', 'configured-realtime-model'",
      ),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_model_unsupported");
  });

  it.each(SDK_SIGNALING_400_MODEL_MENTION_IDS)(
    "emits a fixed model-mention diagnostic for the closed public ID %s",
    async (modelId) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error(
          "Realtime call request failed with status 400 :: model unsupported: " + modelId,
        ),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(
        `start_connect_model_unsupported_mentions_${modelId}`,
      );
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(modelId);
    },
  );

  it("selects the first nonconfigured public ID by occurrence, with dated IDs before aliases", async () => {
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error(
        "Realtime call request failed with status 400 :: model unsupported: " +
          "gpt-realtime-2025-08-28 then gpt-realtime-2.1; " +
          "gpt-4o-realtime-preview-2024-12-17",
      ),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe(
      "start_connect_model_unsupported_mentions_gpt-realtime-2025-08-28",
    );
  });

  it("does not match a public ID inside a larger token or alias prefix", async () => {
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error(
        "Realtime call request failed with status 400 :: model unsupported: " +
          "xgpt-realtime-2.1 gpt-realtime-2.1-extra",
      ),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_model_unsupported");
  });

  it("excludes both configured snapshot IDs before selecting a nonconfigured mention", async () => {
    const snapshot = Object.freeze({
      ...makeSnapshot(),
      realtimeDialogue: "gpt-realtime-2.1",
      inputTranscription: "gpt-realtime-2.1-mini",
    });
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error(
        "Realtime call request failed with status 400 :: model unsupported: " +
          "gpt-realtime-2.1 gpt-realtime-2025-08-28 gpt-realtime-2.1-mini",
      ),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(snapshot, eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe(
      "start_connect_model_unsupported_mentions_gpt-realtime-2025-08-28",
    );
  });

  it("preserves the generic classifier when every mentioned public ID is configured", async () => {
    const snapshot = Object.freeze({
      ...makeSnapshot(),
      realtimeDialogue: "gpt-realtime-2.1",
      inputTranscription: "gpt-realtime-2.1-mini",
    });
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error(
        "Realtime call request failed with status 400 :: model unsupported: " +
          "gpt-realtime-2.1 and gpt-realtime-2.1-mini",
      ),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(snapshot, eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_model_unsupported");
  });

  it("does not scan beyond the capped in-memory detail", async () => {
    const probe = makeAdapterProbe();
    const detail =
      " :: model unsupported: " + "x".repeat(1024) + " gpt-realtime-2.1";
    probe.connect.mockRejectedValueOnce(
      new Error("Realtime call request failed with status 400" + detail),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe("start_connect_model_unsupported");
  });

  it("preserves param and category precedence over a public model mention", async () => {
    const paramBody = JSON.stringify({
      error: {
        message: "model unsupported gpt-realtime-2.1",
        param: "voice",
      },
    });
    const paramProbe = makeAdapterProbe();
    paramProbe.connect.mockRejectedValueOnce(
      new Error("Realtime call request failed with status 400 :: " + paramBody),
    );
    const paramEventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const paramHandle = createRealtimeSession(
      makeSessionInput(makeSnapshot(), paramEventSink, paramProbe),
    );

    await expect(paramHandle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(paramHandle.getLastConnectFailureToken?.()).toBe(
      "start_connect_bad_request_param_voice",
    );

    const categoryProbe = makeAdapterProbe();
    categoryProbe.connect.mockRejectedValueOnce(
      new Error(
        "Realtime call request failed with status 400 :: model unsupported reasoning " +
          "gpt-realtime-2.1",
      ),
    );
    const categoryEventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const categoryHandle = createRealtimeSession(
      makeSessionInput(makeSnapshot(), categoryEventSink, categoryProbe),
    );

    await expect(categoryHandle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(categoryHandle.getLastConnectFailureToken?.()).toBe(
      "start_connect_reasoning_unsupported",
    );
  });

  it.each([
    {
      name: "strict rejected-value field",
      detail:
        " :: Invalid 'session.model': 'configured-realtime-model'. Supported values are: 'provider-model'",
      expectedToken: "start_connect_realtime_model_unsupported",
    },
    {
      name: "configured ID outside the rejected-value field",
      detail:
        " :: Invalid 'session.model': 'provider-model'. Supported values are: 'gpt-realtime-2' configured-realtime-model",
      expectedToken: "start_connect_model_unsupported",
    },
  ] as const)(
    "matches a configured model only from the $name",
    async ({ detail, expectedToken }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error("Realtime call request failed with status 400" + detail),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
    },
  );

  it("enriches a realtime model failure with the first strictly parsed public supported ID", async () => {
    const probe = makeAdapterProbe();
    probe.connect.mockRejectedValueOnce(
      new Error(
        "Realtime call request failed with status 400 :: Invalid 'session.model': 'configured-realtime-model'. " +
          "Supported values are: 'gpt-realtime-1.5', 'gpt-realtime-2', 'gpt-realtime-mini'",
      ),
    );
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

    await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
    expect(handle.getLastConnectFailureToken?.()).toBe(
      "start_connect_realtime_model_unsupported_supported_gpt-realtime-1.5",
    );
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain("Supported values are");
  });

  it.each([
    {
      name: "unknown supported ID",
      supported: "'gpt-realtime-2', 'provider-model'",
    },
    {
      name: "malformed supported segment",
      supported: "'gpt-realtime-2', gpt-realtime-1.5",
    },
    {
      name: "duplicated supported ID",
      supported: "'gpt-realtime-2', 'gpt-realtime-2'",
    },
    {
      name: "oversized supported segment",
      supported: "'gpt-realtime-2'" + "x".repeat(600),
    },
    {
      name: "ambiguous rejected value",
      rejected: "configured-realtime-model and configured-transcription-model",
      supported: "'gpt-realtime-2'",
    },
    {
      name: "trailing free text",
      supported: "'gpt-realtime-2' trailing-provider-text",
    },
  ] as const)(
    "does not enrich or escape on $name",
    async ({ rejected = "configured-realtime-model", supported }) => {
      const probe = makeAdapterProbe();
      probe.connect.mockRejectedValueOnce(
        new Error(
          "Realtime call request failed with status 400 :: Invalid 'session.model': '" +
            rejected +
            "'. Supported values are: " +
            supported,
        ),
      );
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).not.toMatch(
        /^start_connect_realtime_model_unsupported_supported_/,
      );
      expect(handle.getLastConnectFailureToken?.()).toMatch(/^start_connect_/);
      expect(JSON.stringify(eventSink.mock.calls)).not.toContain(supported);
    },
  );

  it.each([
    {
      name: "empty secret",
      clientSecret: "",
      failure: undefined,
      expectedToken: "start_connect_credential_missing",
    },
    {
      name: "direct unauthorized status",
      failure: { status: 401 },
      expectedToken: "start_connect_auth_failed",
    },
    {
      name: "nested forbidden status",
      failure: { response: { status: 403 } },
      expectedToken: "start_connect_permission_failed",
    },
    {
      name: "direct rate limit status",
      failure: { status: 429 },
      expectedToken: "start_connect_rate_limited",
    },
    {
      name: "nested model status",
      failure: { error: { response: { status: 404 } } },
      expectedToken: "start_connect_model_unavailable",
    },
    {
      name: "nested service status",
      failure: { cause: { response: { status: 503 } } },
      expectedToken: "start_connect_service_unavailable",
    },
    {
      name: "browser network error",
      failure: { name: "TypeError" },
      expectedToken: "start_connect_network_failed",
    },
    {
      name: "unknown error fallback",
      failure: new Error("opaque-provider-error"),
      expectedToken: "start_connect_transport_failed",
    },
  ])(
    "classifies $name as a fixed connect failure token",
    async ({ clientSecret = "opaque-transient-input", failure, expectedToken }) => {
      const probe = makeAdapterProbe();
      if (failure !== undefined) {
        probe.connect.mockRejectedValueOnce(failure);
      }
      const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
      const handle = createRealtimeSession({
        ...makeSessionInput(makeSnapshot(), eventSink, probe),
        clientSecret,
      });

      await expect(handle.connect()).rejects.toMatchObject({ reason: "connect_failed" });
      expect(handle.getLastConnectFailureToken?.()).toBe(expectedToken);
    },
  );

  it("emits metadata only and rejects an old realtime ID even when its generation matches", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const clientSecret = "opaque-transient-input";
    const rawContent = "opaque-response-content";
    const rawError = "opaque-provider-error";
    const handle = createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      clientSecret,
    });
    eventSink.mockClear();

    probe.emit("transport_event", {
      type: "ready",
      realtimeSessionId: handle.realtimeSessionId,
      sessionGeneration: handle.sessionGeneration,
      content: rawContent,
      error: rawError,
      clientSecret,
    });
    probe.emit("transport_event", {
      type: "ready",
      realtimeSessionId: "old-realtime-session",
      sessionGeneration: handle.sessionGeneration,
      content: rawContent,
      error: rawError,
      clientSecret,
    });

    expect(eventSink).toHaveBeenCalledTimes(2);
    const currentEmitted = eventSink.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    const staleEmitted = eventSink.mock.calls[1]?.[0] as unknown as Record<string, unknown>;
    expect(currentEmitted).toEqual(
      expect.objectContaining({
        event: "realtime_ready",
        realtimeSessionId: handle.realtimeSessionId,
        sessionGeneration: handle.sessionGeneration,
      }),
    );
    expect(staleEmitted).toEqual(
      expect.objectContaining({
        event: "realtime_stale_event",
        reason: "stale_realtime_session",
      }),
    );
    for (const emitted of [currentEmitted, staleEmitted]) {
      const serialized = JSON.stringify(emitted);
      expect(emitted).not.toHaveProperty("content");
      expect(emitted).not.toHaveProperty("error");
      expect(emitted).not.toHaveProperty("clientSecret");
      expect(serialized).not.toContain(rawContent);
      expect(serialized).not.toContain(rawError);
      expect(serialized).not.toContain(clientSecret);
    }
  });

  it("delivers only exact playback-stop events and disposes only its own listener", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const firstListener = vi.fn<() => void>();
    const secondListener = vi.fn<() => void>();
    const disposeFirst = handle.onOutputAudioBufferStopped(firstListener);
    const disposeSecond = handle.onOutputAudioBufferStopped(secondListener);
    const rawProviderPayload = "opaque-output-audio-provider-payload";

    probe.emit("transport_event", {
      type: "audio_stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: rawProviderPayload,
    });
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: rawProviderPayload,
    });
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(firstListener.mock.calls[0]).toHaveLength(0);
    expect(secondListener.mock.calls[0]).toHaveLength(0);

    disposeFirst();
    disposeFirst();
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: rawProviderPayload,
    });

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain(rawProviderPayload);

    disposeSecond();
  });

  it("suppresses stale playback-stop events while retaining the stale metadata reason", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    const listener = vi.fn<() => void>();
    handle.onOutputAudioBufferStopped(listener);
    eventSink.mockClear();
    const rawProviderPayload = "opaque-stale-output-audio-provider-payload";

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: "old-realtime-session",
      content: rawProviderPayload,
    });

    expect(listener).not.toHaveBeenCalled();
    expect(eventSink).toHaveBeenCalledTimes(1);
    expect(eventSink.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        event: "realtime_stale_event",
        reason: "stale_realtime_session",
      }),
    );
    expect(JSON.stringify(eventSink.mock.calls[0]?.[0])).not.toContain(rawProviderPayload);
  });

  it("reports playback listener failures as observer degradation without failing the session", () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const onFailure = vi.fn();
    const handle = createRealtimeSession({
      ...makeSessionInput(makeSnapshot(), eventSink, probe),
      onFailure,
    });
    const thrownValue = "opaque-listener-error";
    const failingListener = vi.fn<() => void>(() => {
      throw new Error(thrownValue);
    });
    const siblingListener = vi.fn<() => void>();
    handle.onOutputAudioBufferStopped(failingListener);
    handle.onOutputAudioBufferStopped(siblingListener);
    eventSink.mockClear();

    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: "opaque-output-audio-provider-payload",
    });

    expect(failingListener).toHaveBeenCalledTimes(1);
    expect(siblingListener).toHaveBeenCalledTimes(1);
    expect(eventSink).toHaveBeenCalledTimes(1);
    const failureMetadata = eventSink.mock.calls[0]?.[0];
    expect(failureMetadata).toEqual(
      expect.objectContaining({
        event: "realtime_observer_event",
        status: "degraded",
        reason: "output_playback_listener_failed",
      }),
    );
    expect(eventSink.mock.calls.map(([event]) => event.event)).not.toContain(
      "realtime_connect_failed",
    );
    expect(onFailure).not.toHaveBeenCalled();
    expect(probe.close).not.toHaveBeenCalled();
    expect(JSON.stringify(failureMetadata)).not.toContain(thrownValue);
    expect(JSON.stringify(failureMetadata)).not.toContain(
      "opaque-output-audio-provider-payload",
    );
  });

  it("reports late playback-stop subscriptions as closed no-ops", async () => {
    const probe = makeAdapterProbe();
    const eventSink = vi.fn<(event: RealtimeMetadataEvent) => void>();
    const handle = createRealtimeSession(makeSessionInput(makeSnapshot(), eventSink, probe));
    await handle.close("user_requested");
    eventSink.mockClear();

    const lateListener = vi.fn<() => void>();
    const disposeLate = handle.onOutputAudioBufferStopped(lateListener);

    expect(eventSink).toHaveBeenCalledTimes(1);
    expect(eventSink.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        event: "realtime_observer_event",
        status: "info",
        reason: "output_playback_subscription_closed",
      }),
    );
    disposeLate();
    disposeLate();
    probe.emit("transport_event", {
      type: "output_audio_buffer.stopped",
      realtimeSessionId: handle.realtimeSessionId,
      content: "opaque-late-output-audio-provider-payload",
    });

    expect(lateListener).not.toHaveBeenCalled();
    expect(eventSink).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(eventSink.mock.calls)).not.toContain(
      "opaque-late-output-audio-provider-payload",
    );
  });
});
