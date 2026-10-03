---
name: mm-electron-foundation
description: "Implement or debug Magic Mirror Main lifecycle, IPC, persistence, credentials, windows or worker ownership."
---

# Electron foundation

Main owns lifecycle, config, SQLite and devices. Renderers remain sandboxed with narrow typed preload APIs; every IPC handler validates its sender. Preserve the seven lifecycle states and keep Console separate from them.

- For lifecycle, IPC, SQLite or atomic config behavior: [main-process](references/main-process.md).
- For windows, worker spawning or deployment on the final Mac: [windows/workers/macOS](references/windows-workers-macos.md). Current AGENTS/DECISIONS override deferred-port wording. Verify TCC on the actual signed launch chain and packaged workers; Windows results do not prove Mac readiness. Native fullscreen event gates do not apply to `simpleFullscreen`.

[AGENTS](../../../AGENTS.md) owns privacy, the sole Main-loaded root `.env` credential source, canonical Electron/firewall rules and the single restart owner. Apply those boundaries without inspecting credential values. Installed dependencies and code own current APIs; this skill does not authorize upgrades or fallback packages.
