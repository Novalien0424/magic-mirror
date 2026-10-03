# Structured Realtime tools — 2026-09-17

## Contract

`resources/config/prompts/realtime-tools.v1.json` is the versioned catalog for
native tool names, argument schemas, use/avoid/speech rules, availability,
handler IDs, completion policy and structured results. The existing
`return_to_dormant` skill is migrated. Character/speech templates remain in
`realtime.v1.json`; that session template includes the catalog's enabled rules.

```text
Tool JSON + public avatar settings
  → shared validation and one-pass template resolution
  → native Realtime definitions + session instructions + Console inspector
  → renderer argument validation → explicitly bound application handler
  → catalog JSON result → SDK background completion
  → application-owned farewell request → playback completion → sleep
```

`src/shared/realtime-tools.ts` has no runtime dependencies in the sandboxed
preload. Unsupported catalog/schema fields fail loading. Supported schemas are
strict objects with all properties required, arrays, scalar types and enums;
the current sleep tool accepts only `{}`. Disabled tools contribute neither
functions nor usage rules. Audition has no tools.

`src/renderer/realtime/realtime-tool-bindings.ts` uses the installed SDK's public
`FunctionTool` interface. SDK 0.16.1 passes raw JSON schemas through without
local validation, so the binding validates parsed arguments with the installed
Zod converter before effects. Unknown/inherited handler names cannot execute.
Exceptions and invalid arguments produce fixed catalog JSON, never exception
text or visitor data. An invalid sleep call also releases audio suppression.

The result envelope is `{status, code, speech}`. Status is accepted, ignored,
rejected or failed; code is metadata-only; speech identifies application or no
speech ownership. Background completion prevents an automatic model follow-up.
The application supplies the configured farewell through response-scoped
instructions, empty input and no tools, preserving existing playback gates.

Spells retain their configured application routes: normalized full-transcript
equality once per turn, followed by announcement playback before scene dispatch.
They are visible separately in Tools & input and are not model-selected tools.
No linguistic regex router or dialogue filter was added.

## Add a future skill

1. Add its catalog entry, concise rules, schema and metadata-only result codes.
2. Bind an explicit handler in the session adapter; authorize effects and own
   cancellation/idempotency there. JSON does not grant execution capability.
3. Extend schema/completion support only when needed, with focused rejection,
   handler and wire/inspector parity tests. Current completion is background;
   a new policy cannot be enabled solely through configuration.
4. Rebuild/restart; catalogs are bundled, not hot-loaded. The inspector captures
   draft/published public settings and does not expose live visitor history.

AGENTS, the repository Realtime/UI QA skills and the installed
`roleplay-control-prompts` skill are updated with this contract. The harness
checks native windows, actual wire definitions and structured function output,
keeping only comparison flags/counts. Runtime model IDs are unchanged.

## Rationale and limits

Official guidance checked 2026-09-17:
[Realtime function tools](https://developers.openai.com/api/docs/guides/realtime-mcp),
[voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting),
[function calling](https://developers.openai.com/api/docs/guides/function-calling).
Native schemas plus clear per-tool rules follow that guidance; the local file
layout and handler registry are application architecture choices. Schemas do
not guarantee intent classification or silence before the model declares a tool.
The prior [sleep silence failures](realtime-prompt-audit-2026-09-17.md) remain
relevant; a later passing run does not establish their elimination.

## Validation

- Focused Vitest command over realtime-tools, prompt-inspection,
  realtime-session-adapter, realtime-privacy-cleanup, avatar-prompt,
  avatar-commands, spell-announcement, profile-workspace, boot-ipc and console-ipc:
  exit 0, 159 tests. Includes `invokeFunctionTool`, a real SDK session with its
  scripted transport, and the shared OpenAI transport payload serializer.
  The SDK commits the catalog JSON with `startResponse: false`.
- Web typecheck and build: exit 0.
- Skill Creator static validation: Realtime voice, UI QA and installed
  roleplay-control-prompts each exit 0.
- Commit validation of accumulated session changes: 37 affected Node test
  files, 485 tests passed, exit 0. No Electron smoke overlapped the running app.
  Staged whitespace check passes excluding the pinned native `.patch` file,
  whose blank context lines require their leading space; it was preserved.
- Node typecheck: exit 1, existing TS7016 in `qa-artifacts.test.ts:6` for
  `scripts/qa-artifacts.mjs`; no other reported error.
- `git -c core.safecrlf=false diff --check`: exit 0.
- Windows lifecycle runner, `.artifacts/phase4-qa/2026-09-17T02-53-44-455Z`:
  exit 1 (Electron 2), generic `phase4_qa_failed` after Session capture.
  A metadata-only failure-stage marker was added to avoid losing the boundary.
- One retry, `.artifacts/phase4-qa/2026-09-17T02-55-21-404Z`: exit 1
  (Electron 2), failure stage `2_capture`. Session/Speech window captures passed;
  Tools & input content, isolation and catalog checks completed before its
  Electron capture failed. Neither attempt reached a provider conversation;
  no new live speech or wire pass is claimed. The capture cause remains open.
- Normal app restarted with canonical `npm run dev`, session 14915,
  `http://localhost:5173/`. Native Console showed Raven, Dormant/Ready, published
  v20 and the preserved saved draft awaiting publish. No publish was performed.
  Raven Tools & input was opened through normal controls and visually reviewed:
  schema, structured results, policy, spell routes and file sources are present.
  Screenshot: `.artifacts/realtime-tool-architecture-2026-09-17/raven-tools.png`.
  This normal-window observation does not replace the failed lifecycle run.
