import { describe, expect, it } from "vitest";

import { ScriptedRealtimeTransport } from "@openai/agents/realtime/testing";

import {
  createDeterministicRealtimeTransport,
  DETERMINISTIC_REALTIME_TRANSPORT_METADATA,
} from "../../src/renderer/realtime/realtime-transport";

describe("deterministic realtime transport", () => {
  it("uses the official scripted transport and declares deterministic-not-live evidence", () => {
    const transport = createDeterministicRealtimeTransport();

    expect(transport).toBeInstanceOf(ScriptedRealtimeTransport);
    expect(DETERMINISTIC_REALTIME_TRANSPORT_METADATA).toEqual({
      deterministic: true,
      live: false,
    });
  });

  it("uses official events for interruption, completion, and response-before-transcription ordering", async () => {
    const transport = createDeterministicRealtimeTransport();
    const events: string[] = [];

    transport.on("audio_interrupted", () => events.push("audio_interrupted"));
    transport.on("*", (event) => {
      if (
        event.type === "response.done"
        || event.type === "conversation.item.input_audio_transcription.completed"
      ) {
        events.push(event.type);
      }
    });

    await transport.runScenario({
      scenario: async ({ expectCall }) => {
        await expectCall("connect", (call) => call.options.apiKeyProvided);
      },
      exercise: async () => {
        await transport.connect({ apiKey: "opaque-transient-input" });
        expect(transport.status).toBe("connected");
        events.push("ready");
        transport.emit("audio_interrupted");
        transport.emit("*", { type: "response.done" } as never);
        transport.emit(
          "*",
          { type: "conversation.item.input_audio_transcription.completed" } as never,
        );
      },
    });

    expect(events).toEqual([
      "ready",
      "audio_interrupted",
      "response.done",
      "conversation.item.input_audio_transcription.completed",
    ]);
    transport.disconnect();
    transport.assertComplete();
    transport.assertClosed();
  });

  it("returns stable metadata-only failure reasons without fallback or retry gates", async () => {
    const transport = createDeterministicRealtimeTransport();
    const connectFailure = Object.freeze({ reason: "connect_failed" });
    transport.failNextCall("connect", connectFailure);

    await expect(transport.connect({ apiKey: "opaque-transient-input" })).rejects.toMatchObject({
      reason: "connect_failed",
    });

    await transport.connect({ apiKey: "opaque-transient-input" });
    const activeFailure = Object.freeze({ reason: "active_failed" });
    transport.failNextCall("sendEvent", activeFailure);

    let thrown: unknown;
    try {
      transport.sendEvent({ type: "response.create" } as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ reason: "active_failed" });

    transport.disconnect();
    transport.assertClosed();
  });
});
