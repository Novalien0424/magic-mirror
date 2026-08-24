import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  MIRROR_IPC_CHANNELS,
  createRealtimeIpcContract,
} from "../../src/main/ipc";
import type { RealtimeSessionStartBundle } from "../../src/main/realtime/session-start-bundle";

const SESSION_START_BUNDLE: Readonly<RealtimeSessionStartBundle> = {
  snapshot: {
    configVersion: 7,
    fingerprint: "synthetic-config-fingerprint",
    sdkVersion: "0.16.1",
    realtimeDialogue: "synthetic-realtime-model",
    inputTranscription: "synthetic-transcription-model",
    memoryExtractor: "synthetic-memory-model",
    voice: "synthetic-voice",
    reasoningEffort: "low",
    turnDetectionProfile: "semantic-vad",
    takenAt: "2026-08-22T00:00:00.000Z",
  },
  identity: {
    realtimeSessionId: "opaque-realtime-session",
    sessionGeneration: 1,
  },
  clientSecret: {
    value: "ek_synthetic-client-secret",
    expiresAt: 1_800_000_000,
  },
};

describe("realtime bridge and Main IPC contract", () => {
  it("accepts only mirror transient-secret routing and exposes no Console secret path", async () => {
    const issueRealtimeSessionStartBundle = vi.fn(async () => SESSION_START_BUNDLE);
    const contract = createRealtimeIpcContract({ issueRealtimeSessionStartBundle });

    expect(Object.keys(MIRROR_IPC_CHANNELS)).toContain("requestRealtimeClientSecret");
    const mirrorResult = await contract.handleTransientSecretRequest({
      sender: { identity: "mirror" },
    });

    expect(mirrorResult).toEqual({
      status: "accepted",
      reason: "mirror_authorized",
      value: {
        snapshot: SESSION_START_BUNDLE.snapshot,
        identity: SESSION_START_BUNDLE.identity,
        clientSecret: SESSION_START_BUNDLE.clientSecret.value,
        expiresAt: SESSION_START_BUNDLE.clientSecret.expiresAt,
      },
    });
    expect(issueRealtimeSessionStartBundle).toHaveBeenCalledTimes(1);
    expect(contract.console).not.toHaveProperty("requestTransientSecret");
    expect(contract.mirror).not.toHaveProperty("ipcRenderer");
  });

  it("rejects Console and unknown sender identities with metadata-only reasons", async () => {
    const issueRealtimeSessionStartBundle = vi.fn(async () => SESSION_START_BUNDLE);
    const contract = createRealtimeIpcContract({ issueRealtimeSessionStartBundle });

    const consoleResult = await contract.handleTransientSecretRequest({
      sender: { identity: "console" },
    });
    const unknownResult = await contract.handleTransientSecretRequest({
      sender: { identity: "unknown" },
    });

    expect(consoleResult).toEqual(
      expect.objectContaining({ status: "rejected", reason: "unauthorized_sender" }),
    );
    expect(unknownResult).toEqual(
      expect.objectContaining({ status: "rejected", reason: "unauthorized_sender" }),
    );
    expect(issueRealtimeSessionStartBundle).toHaveBeenCalledTimes(0);
    expect(contract.console).not.toHaveProperty("requestTransientSecret");
    expect(contract.mirror).not.toHaveProperty("ipcRenderer");
  });

  it("composes the Main environment credential broker into normal boot", () => {
    const mainSource = readFileSync(
      new URL("../../src/main/index.ts", import.meta.url),
      "utf8",
    );

    expect(mainSource).toMatch(
      /import\s+\{\s*createEnvironmentCredentialSource\s*\}\s+from ["']\.\/environment-credential-source["']/,
    );
    expect(mainSource).toContain(
      "const credentialSource = createEnvironmentCredentialSource()",
    );
    expect(mainSource).toMatch(
      /createClientSecretBroker\(\{[\s\S]*credentialStore:\s*credentialSource/,
    );
    expect(mainSource).toMatch(
      /bootSequence\(\{[\s\S]*\bclientSecretBroker\b/,
    );
    expect(mainSource).not.toContain("safeStorage");
    expect(mainSource).not.toContain("createCredentialStore");
  });
});
