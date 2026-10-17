# Portrait Studio — implementation plan

**Date:** 2026-10-17 · **Branch:** `feature/portrait-studio` (worktree
`.claude/worktrees/portrait-studio`, base `8cf702a`) · **Design page:**
https://claude.ai/artifact/MbwyHbzsXNafqhMAFYAFqr

A second interactive mode. Raven asks the visitor's name and N configurable
questions, paints one portrait on the owner's ChatGPT plan, reveals it on the
glass with the name, and offers a bounded number of changes. Operators choose the
default mode after wake and a start script per mode.

## 1. Owner rulings (2026-10-17)

| ID | Ruling | Consequence |
|---|---|---|
| R1 | The owner logs in to ChatGPT on this Mac; tokens are saved locally like `.env`. | Ignored root file `.env.chatgpt` (dotenv format, `0600`), written by `npm run chatgpt:login` and by Main on refresh. Voice keeps the `.env` API key. Invariant 12 is amended for this file only. |
| R2 | Test models; prefer `gpt-image-2.5-flare`. | A live probe decides; the chosen ID is pinned in versioned config. |
| R3 | Operators can enter a guest name list; the model chooses from it. | Main shortlists candidates by pronunciation; the model picks and confirms with the visitor. |
| R4 | No QR. A printer skill comes later; keep it flexible. | A `KeepsakeSink` seam; display is the only sink now. |
| R5 | The visitor's name is always asked first and never added to memory. | Studio turns are control turns; no memory tools in the studio agent. |
| R6 | Default mode is configured in the Console; each mode can have its own start script. | Per-avatar `experience.defaultMode` and `experience.startScripts`. |
| R7 | No generation limit. | No daily cap. Plan-limit errors still degrade visibly. |
| R8 | Questions approved; configurable in the Console, including how many. | 1–8 questions, each with zh/en text and a prompt slot. |

## 2. Non-goals

Printing, QR or download, saving images, a second wake phrase, the Responses
image tool, an API-key image provider, Bluetooth button, Electron QA inside the
worktree (forbidden by AGENTS; done later on the canonical checkout).

## 3. Verified external contracts

**ChatGPT (Codex) sign-in** — from `openai/codex` `codex-rs/login` source:

- Authorize `https://auth.openai.com/oauth/authorize` with `response_type=code`,
  `client_id=app_EMoamEEZ73f0CkXaXp7hrann` (public Codex client),
  `redirect_uri=http://127.0.0.1:1455/auth/callback` (fallback port 1457),
  `code_challenge` + `code_challenge_method=S256`, `state`,
  `scope=openid profile email offline_access`, `id_token_add_organizations=true`,
  `codex_cli_simplified_flow=true`, `originator`.
- Code exchange: `POST https://auth.openai.com/oauth/token`, form-encoded
  `grant_type=authorization_code, client_id, code, redirect_uri, code_verifier`
  → `id_token, access_token, refresh_token`.
- Refresh: same URL, **JSON** `{grant_type: "refresh_token", client_id, refresh_token}`;
  the refresh token rotates. Codex refreshes after 8 days or on expiry/401.
- Account ID: JWT claim `https://api.openai.com/auth` → `chatgpt_account_id`.

**Image generation** — from Hermes Agent `plugins/image_gen/openai-codex`:

- `POST https://chatgpt.com/backend-api/codex/images/generations`, or
  `/images/edits` with `images: [{image_url: "data:image/png;base64,…"}]`.
- Body: `prompt, model, n: 1, quality, size, background: "opaque"`.
- Headers: `Authorization: Bearer`, `ChatGPT-Account-ID`, `originator`,
  `User-Agent`, `x-codex-image-turn-id`.
- Response JSON `data[0].b64_json`; no streaming. Hermes: low ≈15 s, medium
  ≈40 s, high ≈2 min for `gpt-image-2`.
- This route is unpublished; model availability for 2.5 is unproven (probe).

## 4. Architecture

```
Renderer (Mirror)                                  Main
 RealtimeSession ── updateAgent ──┐                 ┌─ studio-runtime (state, RAM images, abort, activity hold)
  ├ Conversation agent            │  mirror:studio  ├─ prompt-builder (versioned template)
  │   start_portrait_studio ──────┼───────────────▶ ├─ guest-names (pinyin/OpenCC shortlist)
  └ Studio agent                  │                 ├─ image-provider (Codex backend) ◀─ chatgpt-auth token file
      studio_* tools ─────────────┘                 ├─ studio-ipc (sender auth, identity/current checks)
 Portrait layer ◀── studio_state command ────────── └─ media protocol host `studio` (RAM only)
 Adapter.studioEvent ◀── (image ready, failure) ──
```

### 4.1 Shared contracts — `src/shared/portrait-studio.ts` (new, dependency-free)

- `AvatarExperience`: `defaultMode: 'conversation' | 'portrait_studio'`,
  `visitorMayRequest: boolean`, `afterPortrait: 'continue' | 'farewell'`,
  `startScripts: { conversation: string; portrait_studio: string }` (≤500 chars;
  empty conversation script = existing `presentation.wakeGreeting`),
  `studio: { nameQuestion: {zh,en}, questions: {id, zh, en, slot}[] (1–8),
  artStyle (≤600), nameLettering: 'nameplate' | 'painted', quality:
  'low'|'medium'|'high', revisionsAllowed 0–3, holdSeconds 10–300 }`,
  `guests: { names: string[] (≤1000, each ≤40), match: 'off'|'prefer'|'only' }`.
- Slots: `subject | setting | mood | palette | companion | style | detail`.
- `DEFAULT_EXPERIENCE` = approved defaults (conversation mode, four questions).
- `parseAvatarExperience`, `parseStudioRequest`, `parseStudioReply`,
  `parseStudioView` for preload boundaries.
- Session-visible subset (`AvatarSessionSettings.experience`) **omits guest
  names**; the renderer never receives the list.

### 4.2 Config

- `avatar-config.ts`: `experience: experienceSchema.default(DEFAULT_EXPERIENCE)`
  (same pattern as `mediaSkill`; no schema-version bump); `avatar-profiles.ts`
  type and defaults; `profile-workspace.ts` default for new avatars.
- `resources/config/portrait-studio.v1.json` (versioned, packaged): provider
  `chatgpt_codex`, base URL, `modelId`, size `1024x1536`, `timeoutMs` 180000,
  `originator`, image prompt frame and slot phrases, studio-agent instructions,
  application lines (zh/en) for painting, reveal, failure, keepsake. Model ID
  comes only from here (invariant 11). Console shows it read-only.

### 4.3 Main

- `src/main/chatgpt-auth/token-file.ts`: read `.env.chatgpt`
  (`CHATGPT_ACCESS_TOKEN, CHATGPT_REFRESH_TOKEN, CHATGPT_ID_TOKEN,
  CHATGPT_ACCOUNT_ID, CHATGPT_LAST_REFRESH`); write atomically with `0600`;
  single in-flight refresh; refresh when access-token `exp` < now+5 min, when
  last refresh > 8 days, or once after a 401; status for Console
  (`signed_in | missing | expired | refresh_failed`). Values never logged.
- `scripts/chatgpt-login.mjs` + `npm run chatgpt:login`: self-contained PKCE
  login (opens the browser, loopback server, code exchange, writes the file).
  Constants mirrored in TS; a unit test asserts parity.
- `src/main/studio/image-provider.ts`: `generate({prompt})`,
  `edit({prompt, image})` → `{ok: true, png: Buffer} | {ok: false, code}`;
  20 MB response bound; codes `studio_auth_required, studio_quota_exhausted,
  studio_image_refused, studio_model_rejected, studio_provider_contract,
  studio_image_timeout, studio_image_unavailable`; one retry only for a
  connection error or a 401 after refresh.
- `src/main/studio/prompt-builder.ts`: deterministic; answers are quoted data
  (≤80 chars, control characters stripped); name included only when
  `nameLettering === 'painted'`; change requests are quoted.
- `src/main/studio/guest-names.ts`: OpenCC (s→t) + NFKC; toneless pinyin keys
  from the wake lexicon for Han; lowercase alphanumerics for Latin; accepted
  folds in/ing and en/eng (DECISIONS 2026-10-11). Ranked shortlist ≤3:
  exact text > same pinyin > same given-name pinyin. Never returns the full list.
- `src/main/studio/studio-runtime.ts`: one owner. Phases `name → confirm →
  questions → painting → reveal → revising → keepsake → closed`. Holds name,
  answers and images in RAM (≤2 images). Starts generation itself when the
  name is confirmed and all answers are in. `AbortController` per run;
  `close(reason)` on exit, sleep, Dormant, session change. Idle held via
  `noteSceneActivity` during painting/reveal/keepsake. Dispatches
  `studio_state` view commands and `studio_event` (ready/failed/keepsake_done)
  to the Mirror. `KeepsakeSink` seam (display only). Metadata-only telemetry.
- `src/main/studio/studio-ipc.ts`: registers `mirror:studio` (tool requests)
  and `console:studio` (status, live start/exit, test portrait); sender
  authorization and session-identity checks like `mirror:media-skill`.
  Hook-in: ~5 lines in `ipc.ts`.
- `index.ts`: `magic-mirror-media://studio/<opaque-id>` served from the RAM
  store with `Cache-Control: no-store`; unknown id → 404.

### 4.4 Renderer session

- Catalog: `availability: 'conversation' | 'studio' | 'all'`;
  `resolveRealtimeTools(..., availability)`. New tools:
  `start_portrait_studio` (conversation, only when `visitorMayRequest`),
  `studio_set_name {name, confirmed}`, `studio_answer {question, answer,
  language}`, `studio_revise {change}`, `studio_finish {}`, `studio_exit {}`
  (studio). `return_to_dormant` → `all`.
- `src/shared/studio-prompt.ts`: `buildStudioAgentPrompt(avatar, experience)`
  = persona + studio script + studio tool rules. Prompt Inspector shows it.
- Adapter: build both agents; `enterStudio()` / `exitStudio()` via
  `session.updateAgent`; studio-default sessions start in the studio agent and
  speak the studio start script instead of the wake greeting. Tool results
  carry the next instruction (`next`), e.g. the next question text. New
  `handle.studioEvent(event)`: on `ready` add the image (`addImage`,
  `triggerResponse: false`) then a response-scoped instruction to reveal and
  offer a change; on `failed` speak the in-character line; on `keepsake_done`
  swap back or say farewell (`afterPortrait`). While the studio agent is
  active, every settled turn is marked `control` (no extraction).
- `realtime-runtime-owner.ts`: forward `studio_event` to the current handle.

### 4.5 Mirror UI

- `src/renderer/mirror/portrait-studio-layer.tsx` + CSS: feathers progress
  (N+1), question card, name chip with guest-match highlight, answer chips,
  painting frame with app-drawn ink animation, reveal frame with nameplate
  (brush font, exact characters), change chip, keepsake hold countdown.
  The avatar fades during painting/reveal (same mechanism as video media);
  no avatar resizing. Respects black Dormant (layer absent when Dormant).
- `App.tsx`: handle `studio_state` and `studio_event` commands.

### 4.6 Console

- New avatar section **Experiences** (`ExperiencesEditor.tsx`): default mode,
  visitor may request, after portrait, start script per mode, name question,
  questions list (add/remove/reorder, 1–8, zh/en/slot), art style, name
  lettering, quality, changes allowed, hold seconds, guest list (one name per
  line) and match mode. Draft → Test → Publish like other avatar settings.
- ChatGPT panel: sign-in status and last refresh (never token values), the
  command to sign in, configured image model (read-only), **Generate test
  portrait** (shown in the Console only, not saved).
- Live bar: **Start Portrait Studio** / **Back to conversation** for the
  current session.

## 5. Invariants

1 RAM-only answers/name/images; metadata-only telemetry. 2–4 studio name is a
caption, not identity; no memory tools in the studio agent; guest list stays in
Main. 5–6 studio turns are control turns. 7 no new spoken commands. 8 no mic
change. 9–10 every failure spoken or logged with a reason; conversation always
available. 11 image model from `portrait-studio.v1.json` only; rejection is
visible, never downgraded. 12 amended: Main also reads ChatGPT tokens from the
ignored root `.env.chatgpt`; they never reach renderers, Console or logs.

## 6. Milestones and checks

| M | Work | Checks |
|---|---|---|
| M0 | DECISIONS entry, invariant 12 wording, this plan; Fable review | review findings resolved |
| M1 | `chatgpt-login.mjs`, token file, image provider, live probe (owner signs in once) | unit tests; probe picks model and records latency |
| M2 | Shared contracts, config schema, versioned resource | parser/schema tests |
| M3 | Prompt builder, guest names, studio runtime, studio IPC, media host | unit tests per module |
| M4 | Catalog availability, studio prompt, adapter agent swap, runtime owner | catalog + adapter tests with fake session |
| M5 | Mirror layer | renderer test of view states |
| M6 | Console editor, ChatGPT panel, live bar, inspector | console tests; `typecheck:node`, `typecheck:web` |
| M7 | Full focused suite, `npm run build`, live end-to-end probe from Node | results recorded in PROGRESS; Electron QA handed to canonical checkout |

## 7. Risks

- Unpublished Codex backend may change → provider seam, contract test,
  `studio_provider_contract` reason.
- Plan usage limits (no app cap per R7) → visible quota reason.
- Using the public Codex client ID for a kiosk → owner-accepted (R1).
- Merge conflicts with Codex's uncommitted work in `ipc.ts`, `index.ts`,
  `boot.ts`, `avatar-config.ts`, `realtime-session-adapter.ts`, catalog JSON,
  `AGENTS.md`, `DECISIONS.md` → keep hook-ins small; rebase before integration.
- Token rotation: the worktree and canonical checkout must not share one
  refresh token; move (not copy) `.env.chatgpt` at integration.

## 8. Fable review (2026-10-17) and resolutions

| # | Severity | Finding | Resolution in the build |
|---|---|---|---|
| 1 | high | Full PNG via `addImage` exceeds data-channel limits and stays billed in history | Renderer downscales to a ≤512 px JPEG, sends it with its own item id, and deletes the item after the reveal response. |
| 2 | high | Reveal/failure `response.create` can collide with an active response | Adapter studio-speech queue flushes only when no response is active; 15 s fallback with a metadata reason. |
| 3 | high | `updateAgent` resends full session config; drops memory-dialogue instructions; pending identity question could fire mid-studio | `enterStudio` cancels the memory dialogue and clears `pendingQuestion`; `exitStudio` re-applies the memory dialogue's current instructions. `updateAgent` added to `SessionLike` and the test fake. |
| 4 | high | Session rollover / identity change would discard a painting | Studio activity holds the idle timer. Rollover runs only after 60 minutes of one session (`REALTIME_ROLLOVER_AFTER_MS`) or on identity changes, which the studio agent cannot trigger (no memory tools). A replacement during a studio closes it with a visible `studio_session_replaced` reason instead of showing a stale image. |
| 5 | medium | Static tool completion could double-respond; duplicates unspecified | Every studio reply is model-spoken except `*_duplicate`/`*_stale` codes (background). Painting/repainting lines are model guidance, so the app never speaks over them. Duplicates return `ignored`. |
| 6 | medium | Control marking misses entry/exit turns | All studio tool names join the control-tool set, plus the studio-active flag. |
| 7 | medium | Name/answers remain in Realtime history after exit | Adapter records studio-turn item ids and deletes them on exit or keepsake end. |
| 8 | medium | Token file concurrency | File re-read on every use; refresh compare-and-swap on the refresh token; `refresh_failed` clears when the file changes. |
| 9 | medium | Idle hold release on every path | One `finally` release keyed by run id; unit-tested. |
| 10 | low | Parser/catalog/prompt changes; who starts studio-default | Explicit parser updates; conversation prompt excludes studio tools. Studio-default start is Main's: it starts the run when a woken session becomes active and sends `enter` (self-audit §10; the original renderer request arrived while Main was still `activating`). |
| 11 | low | Farewell must reuse the existing owner | `afterPortrait: farewell` uses the adapter's existing farewell + `onReturnToDormant` path. |
| 12 | scope | Cuts | Keep `painted` lettering and `only` matching (small); edits fall back to regenerate-with-change only if the probe shows edits failing. |

## 9. Build status and evidence (2026-10-17)

- **Live model probe** (owner-authorized, owner's ChatGPT plan `prolite`, Codex
  backend `/images/generations` and `/images/edits`, originator `magic_mirror`,
  1024×1536, medium): all three candidates generated (HTTP 200).
  `gpt-image-2.5-flare` 21.7 s, `gpt-image-2.5-sunburst` 21.2 s, flare edit
  26.1 s (composition kept, only the requested change applied), `gpt-image-2`
  also succeeded in the first run. Nameplate prompts drew no text; one
  painted-mode sample lettered 「王曉明」 correctly. **Chosen: `gpt-image-2.5-flare`**
  (already in `portrait-studio.v1.json`). Images stayed in the session scratchpad.
- **Checks in the worktree:** `npx tsc --noEmit -p tsconfig.node.json` and
  `-p tsconfig.web.json` exit 0; `npx electron-vite build` succeeds (main,
  preload, renderer). `npx vitest run tests/unit tests/main tests/renderer
  --exclude tests/unit/smoke-contract.test.ts`: 1829 passed, 20 failed, 1 skipped.
  All 20 failures reproduce on an export of base `8cf702a` (second-audit §1
  items such as `memory-dialogue:47` and `field-help-coverage`); none are new.
  `smoke-contract` spawns Electron and is excluded in worktrees.
- **Not yet done (needs the canonical checkout):** Electron QA of the Mirror
  layer and Console section, a spoken end-to-end visit, and moving
  `.env.chatgpt` (move, don't copy: refresh tokens rotate) to the canonical root.

## 10. Self-audit (2026-10-17, before push)

Three read-only Opus reviewers (Main/auth, Realtime session, UI) audited
`be99005`; each finding was checked against the code before fixing.

| Finding | Fix |
|---|---|
| Studio-default never started: the renderer's `start` reached Main while it was still `activating` | Main starts the run when a woken session becomes active and sends `enter`; rollover never restarts it; the renderer greets with the start script on `enter`, or the wake greeting after `closed`/10 s. Renderers may request only `source: visitor`. |
| Reveal image fetch failed CORS (every reveal would be blind) | Studio media response sets `Access-Control-Allow-Origin` like other media. |
| Multi-line start script dropped the `enter` event silently | `enter` parser accepts line breaks like the saved setting; help text corrected. |
| Entering the studio during an identity question replaced the session | No cancel: a visitor start is refused with guidance; Console/default `enter` waits up to 20 s for the question to settle, else exits with a reason. Memory tool and pending questions are refused while the studio is active. |
| Idle queue fired on `speech_stopped` into the server's auto-reply, ran one task per trigger | 1.5 s grace after speech stops; drains until a task starts a response; reveal and farewell retry once when the server rejects them. |
| Agent swap could fail the session on "Tool X not found" | Classified as degraded `realtime_tool_not_found`; the SDK already answered the call. |
| Studio outlived a replaced session; events had no session identity | Main closes the run on any identity change (`studio_session_replaced`/`_ended`); `studio_event` carries identity and other sessions ignore it (`studio_event_stale`). |
| Reveal held the idle timer indefinitely | Hold only while painting and during the keepsake countdown. |
| A failed refresh stuck until restart; a failed save lost rotated tokens | Failure keyed to the failed refresh token (a new login clears it); rotated tokens stay in RAM and are saved on next use; malformed rotated tokens are rejected. Studio availability uses `get()`, so a valid token still works after a failed scheduled refresh. |
| Login fallback port resolved to the busy port | Per-attempt listeners; resolves the bound port. |
| Smaller items | Console start rechecks the session after its awaits; Main rejects an unearned `session_default`; keepsake guidance; studio call/output pairs deleted together; turns begun in the studio stay control turns; swap failure rolls back; studio speech failures reported; overlay waits for the wake entrance; long operator text clamped; fade timer coalesced; "only guests" needs a non-empty list. |

Checks: both typechecks exit 0; `npx electron-vite build` succeeds; Node suites
1845 passed, 20 failed, 1 skipped. The 20 failing tests are identical by name to
the same files run on the base `8cf702a` export. Not runtime-verified: CORS
effect, call/output deletion against the live API, and timing of `enter` after
wake (Electron QA).

## 11. Rebase onto `field/macmini-deploy` and integration audit (2026-10-17)

Squashed and rebased onto Codex's `d5bb775` (operator Loop Video, Stream Deck
START/CONSOLE/PLAY LOOP/STOP, Raven reliability, SDK 0.20.0, TV mouse). Conflicts
in 14 files were resolved by keeping both sides. Integration changes:

- Tool results follow Codex's `{status, code, next}`: studio guidance is `next`;
  duplicate/stale studio replies stay background. `avatarRealtimeTools` owns the
  studio entry filter (missing experiences mean defaults, as in Main); the entry
  tool is hidden when no studio bridge exists. Studio tools join the preamble
  diagnostics; the reveal (`mirror_studio`) is application-owned, so command
  suppression never cancels it.
- Studio speech waits for Codex's cue queue, a spoken-command prefix, an identity
  question and media; the forced fallback never passes those. Studio tools and
  `studio_exit` from a command-suppressed reply are stale, not local exits.
  Agent swaps restore a visitor's brief and media's no-reply turn detection.
- Main: a spell (or Console scene test) closes the studio like it replaces media;
  a Console start that wins the race with the studio-default start is not reported
  as a failure. STOP/shutdown, PLAY LOOP, START and crash-restored loops were
  audited: each closes the studio through existing Main paths.
- The studio overlay keeps its motion under Reduce Motion, following the
  reflective-performance ruling; the field Mac has Reduce Motion on.
- QA: `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
  portrait_studio` runs a spoken visit (request, name, four answers, real painting,
  reveal, one change, keepsake, follow-up) with metadata-only studio evidence.

Checks: typechecks exit 0; build succeeds; Node suites 2,450 passed, 1 failed, 1
skipped. The failure (`youtube-search` root-path assertion) also fails on a clean
`d5bb775` export outside the canonical path. Codex's adapter suite passes unchanged.
