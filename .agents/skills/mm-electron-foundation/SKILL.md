---
name: mm-electron-foundation
description: "Implement or debug Magic Mirror Electron Main: lifecycle, IPC, SQLite/config persistence, credentials, BrowserWindows, crash recovery or worker ownership."
---

# Electron foundation

Main owns lifecycle, config, SQLite and devices. Renderers remain sandboxed with narrow typed preload APIs; every IPC handler validates its sender. Preserve the seven lifecycle states and keep Console separate from them.

- Lifecycle, IPC, SQLite or atomic config: [main-process](references/main-process.md).
- Kiosk BrowserWindows, crash recovery, worker spawning or Mac TCC: [windows/workers/macOS](references/windows-workers-macos.md). Verify TCC on the actual signed launch chain and packaged workers.

Installed dependencies and code own current APIs; this skill does not authorize upgrades or fallback packages.
