---
name: mm-electron-foundation
description: "Implement or debug Magic Mirror Main lifecycle, IPC, persistence, credentials, windows or worker ownership."
---

# Electron foundation

Main owns lifecycle, config, SQLite and devices. Renderers remain sandboxed with narrow typed preload APIs; every IPC handler validates its sender. Preserve the seven lifecycle states and keep Console separate from them.

- For lifecycle, IPC, SQLite or atomic config behavior: [main-process](references/main-process.md).
- For windows, worker spawning or the later Mac port: [windows/workers/macOS](references/windows-workers-macos.md). macOS guidance is deferred port work, not Windows proof.

[AGENTS](../../../AGENTS.md) owns privacy, the sole Main-loaded root `.env` credential source, canonical Electron/firewall rules and the single restart owner. Apply those boundaries without inspecting credential values. Installed dependencies and code own current APIs; this skill does not authorize upgrades or fallback packages.
