import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  MIRROR_IPC_CHANNELS,
  createRealtimeIpcContract,
} from "../../src/main/ipc";
import type { TransientRealtimeSecretInput } from "../../src/shared/bridge";

describe("realtime bridge and Main IPC contract", () => {
  it("accepts only mirror transient-secret routing and exposes no Console secret path", async () => {
    const getTransientSecret = vi.fn(async (): Promise<TransientRealtimeSecretInput> => {
      return "opaque-transient-input" as TransientRealtimeSecretInput;
    });
    const contract = createRealtimeIpcContract({ getTransientSecret });

    expect(Object.keys(MIRROR_IPC_CHANNELS)).toContain("requestRealtimeClientSecret");
    const mirrorResult = await contract.handleTransientSecretRequest({
      sender: { identity: "mirror" },
    });

    expect(mirrorResult).toEqual(
      expect.objectContaining({ status: "accepted", reason: "mirror_authorized" }),
    );
    expect(getTransientSecret).toHaveBeenCalledTimes(1);
    expect(contract.console).not.toHaveProperty("requestTransientSecret");
    expect(contract.mirror).not.toHaveProperty("ipcRenderer");
  });

  it("rejects Console and unknown sender identities with metadata-only reasons", async () => {
    const getTransientSecret = vi.fn(async (): Promise<TransientRealtimeSecretInput> => {
      return "opaque-transient-input" as TransientRealtimeSecretInput;
    });
    const contract = createRealtimeIpcContract({ getTransientSecret });

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
    expect(getTransientSecret).toHaveBeenCalledTimes(0);
    expect(contract.console).not.toHaveProperty("requestTransientSecret");
    expect(contract.mirror).not.toHaveProperty("ipcRenderer");
  });

  it("composes the Main safeStorage credential broker into normal boot", () => {
    const mainSource = readFileSync(
      new URL("../../src/main/index.ts", import.meta.url),
      "utf8",
    );

    expect(mainSource).toMatch(
      /import[\s\S]*\bsafeStorage\b[\s\S]*from ["']electron["'][\s\S]*createCredentialStore\(\{[\s\S]*\bsafeStorage\b[\s\S]*\}\)[\s\S]*createClientSecretBroker\(\{[\s\S]*\bcredentialStore\b[\s\S]*\}\)[\s\S]*bootSequence\(\{[\s\S]*\bclientSecretBroker\b/,
    );
  });
});
