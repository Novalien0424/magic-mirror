# Magic Mirror — Durable rulings

## 2026-10-10 — Black Dormant in reflective presentation (user ruling)

- In `reflective` presentation mode, a healthy Dormant stays completely black:
  no avatar, mark, silhouette, glint or on-screen wake-phrase hint. The
  reflective TV reads as a plain mirror; Raven appearing after the wake phrase
  is the intended surprise.
- 「不黑畫面」 in the PRD, Tech Spec and Implementation Plan applies to failure
  and recovery states (Maintenance, OfflineLoop, renderer recovery,
  avatar-asset failure). Those must remain visibly distinct from black
  Dormant. Operator liveness and wake health belong in the Console
  (invariant 9).
- Any post-wake acknowledgement must not spoil the black-to-reveal moment;
  prefer an audio cue or an earlier ritual start over a Dormant visual.

## 2026-10-10 — Spell effect timing under the requested review remediation

The owner requested all fixes in the performance/correctness/UI review. Its
MX-05 recommendation is adopted: an application-authorized normalized exact
full transcript commits its approved scene before the spoken cue completes.
The cue runs alongside the effect. Ambient VAD may interrupt cue speech but
does not revoke an already completed authorization. Session changes, Stop,
duplicate-turn protection and approved hardware presets retain their existing
authority. Farewell still waits for processed playback before session closure.
This supersedes older cue-before-effect implementation/evidence descriptions;
see [the remediation ledger](docs/testing/review-remediation-2026-10-10.md).

## 2026-10-05 — Realtime relationship memory and Markdown import (user authorization)

- Keep the current Realtime voice path. Ordinary replies never wait for final
  transcription, extraction or retrieval. Prefer compact conversational turns.
- The user approved the reviewed relationship-memory design and instructed
  implementation through TDD, self-review and thorough automated end-to-end QA.
  A small confirmed-person brief and selective semantic/keyword recall supplement
  the RAM-only current encounter. No implicit cross-person or cross-avatar sharing.
- New scopes default to background distilled summaries; migrated explicit-only
  scopes retain their policy. Automatic, explicit-only, off and encounter-temporary
  controls apply in Main. Turn-start ownership, control exclusions, revisions,
  source dependencies and scope epochs guard background writes and forgetting.
- SQLite stays private in a Main-owned worker thread. A pinned local
  Qwen3-Embedding-0.6B/MLX runtime supplies vectors on this final Mac; no cloud
  embedding fallback or runtime model substitution. The embedding manifest is
  versioned independently of the unchanged dialogue/transcription/extractor IDs.
- The forthcoming large Markdown is explicitly in scope: preview persona headings
  separately, then distill bounded history chunks using the configured extractor.
  Only summaries persist. The source stays in place; persona changes require the
  existing editor. Import is cancellable and requires Dormant. Already saved
  summaries remain after cancellation or failure, visibly reported.
- These rulings supersede the October 4 explicit-only/lexical-only restrictions.
  Human conversation quality, actual microphone timing and physical presentation
  remain later acceptance; automated synthetic tests do not claim those results.

## 2026-10-04 — Reusable local lasting memory (user request)

- Selected structured memories may persist in a private Main-owned SQLite file,
  scoped by avatar and person. Raw transcripts/audio, transient context and
  diagnostics retain invariant 1's RAM-only/content-free boundaries. This
  supersedes older blanket RAM-only wording for selected memory records only.
- Begin with explicit remember/correct/forget requests and authorized Console
  editing; automatic extraction is not enabled. Verbal identity confirmation
  is application-checked on a separate later turn. This is self-identification,
  not biometric authentication. Guest IDs remain Main-only.
- Retrieval is bounded lexical search with Chinese segmentation, not semantic
  search. Use existing node:sqlite, no new server, vector extension or embedding
  model. Reconsider vectors only with measured recall failures.
- Memory lives outside public configuration and the prompt inspector. Console
  edits require Dormant; voice deletion or person change replaces the cloud
  session to remove old private context. No implicit sharing across avatars.
- Private files use owner-only permissions and SQLite secure deletion. External
  backups/OS snapshots are outside app deletion guarantees; no app backups of
  this store are created. Local storage still sends selected recall to Realtime.

[AGENTS](AGENTS.md) owns execution policy and canonical invariants; [PROGRESS](PROGRESS.md) owns current delivery/evidence. This file records implementation decisions, not task status. The [pre-compaction ledger](docs/archive/decisions-before-harness-2026-09-13.md) preserves complete dated wording and earlier source links.

## 2026-10-03 — Current Sol worker routing (user decision)

- **Route.** The user changed active harness routing to exact `gpt-6.1-sol`,
  reasoning effort `max`, profile `nova-auto`, and fresh `--ephemeral`
  workers. The native macOS `--cd` path
  `/Users/novalien0424/magic-mirror` is authorized; the Windows example
  remains valid for Windows.
- **Provenance.** This Sol route supersedes historical worker-route references
  in older plans and records. Those records retain their Luna completion
  evidence as provenance, never active dispatch.
- **Boundary.** Runtime model IDs remain unchanged. Worker routing and
  target deployment authority do not accept tasks or promote phases.

## Scope and platform

- **2026-10-03 user confirmation:** this Mac is the FINAL Raven deployment
  target, with canonical workspace `/Users/novalien0424/magic-mirror`.
  Explicitly scoped local deployment work is authorized. This supersedes the
  older deferred-Mac/M4-port ruling; target TCC, signing, workers, LaunchAgent,
  power and wake evidence still require actual Mac verification. Windows
  results remain historical Windows evidence; phase acceptance is unchanged.
- **2026-08-27 historical platform ruling:** Windows was the engineering/functional host and the Mac port was deferred. The 2026-10-03 final-target authority supersedes that deferral; Windows tags still cannot establish Mac readiness.
- Phase order is Foundation → Realtime → Wake → Avatar/Audio → Scenes → Identity → Memory → Field Hardening (0–7). Remaining Phase 8 covers custom Cubism authoring/calibration and character/voice quality. Rigging is not ML training.
- Phase 2 deferred P2-D2 offline wake, 19/20 live-wake sampling, multi-speaker accuracy and 30-minute ambient/TV negatives to Phase 7; these are not passes. Dated prep-only/engineering overlap exceptions are not standing parallel-phase authority.
- **2026-09-05:** multi-avatar Console was pulled forward: one public character loaded at a time; per-avatar personality/voice/presentation/scenes/triggers and shared/locked media/actions. Public avatar IDs are not guest identities. This changes scope, not phase acceptance or Identity/Memory sequence.
- **2026-09-13:** user authorized personal skill and related harness compaction following [OpenAI guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra). Preserve general principles and domain safeguards; no runtime-model, dependency or phase changes are implied.

## 2026-10-03 — Field audio device policy (operator decision)

- **Device.** The venue PoC audio device is the **Jabra Speak2 75** (USB,
  CoreAudio UID `AppleUSBAudioEngine:Unknown Manufacturer:Jabra Speak2
  75:9842AB51A9700254000:1`), standing in for the PRD's Speak2 40 in the same
  role: one USB device for microphone, playback, and AEC. The PRD's final
  hidden-audio plan (reSpeaker XVF3800) is unchanged.
- **Operator rule.** The Jabra is both the default input and the default output
  whenever it is connected; otherwise macOS falls back to its own choice. The
  Magic Mirror app uses the same device.
- **System enforcement.** The user LaunchAgent `com.magicmirror.audio-prefer`
  (`~/Library/Application Support/MagicMirror/ops/audio-prefer`) sets default
  input, output, and system output to the Jabra at login and on every CoreAudio
  device-list change. It does not fight a manual pick between plug events.
  Its log is metadata only:
  `~/Library/Logs/MagicMirror/audio-prefer.log`.
- **App policy and historical observation.** The pre-merge field build used
  the OS default (Chromium `default` device), observed as the Jabra. Retain the
  operator's Jabra preference for the incoming audio runtime; its target-Mac
  selection is not yet verified. The Tech Spec §13.3 config uses "audio stable
  device IDs".
  Chromium `deviceId` values are per-origin hashes, so selection matches on the
  label (`Jabra Speak2 75`). If the label is missing, the app falls back to the
  OS default with a Console event giving the reason (invariant 9) and never
  blocks voice (invariant 10).

## Credentials, ownership and persistence

- **2026-08-23 personal build:** Main alone loads `OPENAI_API_KEY` from ignored root `.env`; no Console provisioning, keystore, inherited environment or alternate source. Missing/empty/read failures are metadata-only. Agents never inspect the value. Only the short-lived Realtime secret crosses to the renderer. This supersedes older credential plans.
- One Main lifecycle owner: cloud failure → OfflineLoop; local core failure → Maintenance. Unrelated adapters never gate conversation. One failed renderer recreation precedes exit 1; LaunchAgent `KeepAlive={SuccessfulExit=false}` alone owns process restart.
- Config has separate schema/config versions, atomic migrations preserving operator values, and visible Maintenance for unsupported schemas. Active→Previous→packaged Default recovery is for corrupt/missing/unreadable data, never silent model substitution.
- Main-only `node:sqlite`: `app_migrations`, foreign keys, WAL, integrity check, transactional migrations, defensive health, idempotent close. Online backup is exported `backup(sourceDb, path, options)`, not `db.backup`. DB failure does not block unrelated conversation/adapters.
- Telemetry: RAM ring 2,000; JSONL 5 MB × 5; queue 1,000 with oldest-overflow `telemetryDroppedCount`. Only time/module/event/status and optional timing, bounded error/session/scene ID/reason/source; never raw content/errors, credentials, frames or embeddings. Overflow/delivery failures remain visible and nonblocking.
- Transcript/audio, extracted memory values and injected private context stay RAM-only under canonical invariant 1. A future memory schema is not present persistence authority. Historical worker routes/H6 remain provenance; the 2026-10-03 dispatch contract in AGENTS owns current workers.

## Voice, identity and microphone

- Runtime IDs/voices are versioned config. Session snapshots freeze at creation, job snapshots at enqueue; Publish affects future sessions/jobs. Worker model routing is separate.
- Main atomically snapshots model + Realtime identity before minting; renderer receives validated/frozen identity + secret, expiry 600 seconds. Missing identity never calls the broker.
- One browser runtime owns start/rollover/stop/interrupt/dispose. `realtimeSessionId` rejects stale events; generation is diagnostic except the positive Main start-bundle generation that commits activation. Main owns pending activation/rollover and reasoned stale/wrong-state drops.
- Mic ownership is explicit release→acquire; stop caller-owned renderer tracks before returning to wake. Handoff failure is local Maintenance.
- Profile changes close old-owner history, confirm in a clean Persona+Master session, then update the agent. Guest/candidate IDs stay in Main. Final transcripts are bounded session RAM and clear on stop/offline/rollover/restart. Extraction uses turn-start ownership and skips control turns.
- Audible playback completion, including processed output tail, governs idle, rollover and farewell. Interruption stops output and coalesces duplicates.
- Rollover timer: 60 minutes. After cloud failure, one Main schedule probes the ephemeral broker at 5/15/30/60 seconds, discards secrets in RAM, and returns Dormant on success/exhaustion. Manual Start owns the next full session; no automatic session reconnect. Shutdown cancels probes.
- Console Start/Disconnect and payload-free interrupt use validated Console-only IPC through the tracked Mirror; preserve `handleSimulator` response shape. No guest IDs in model tools.
- **2026-08-27 RCA:** mock model IDs once leaked from non-isolated userData into live runs. Live flags select isolated data; provider prose is not entitlement proof. Use bounded status/transport reasons and retain failed evidence.

## Voice Studio — 2026-09-09

One embedded implementation: Signalsmith Stretch + native Web Audio, per-avatar controls and supernatural default/Raven presets. Provider speed/delivery instructions are separate from pitch/formant DSP. No neural engine, Python voice worker, virtual cable or separate changer app.

The operator relaxed added direct-speech p95 to <=180 ms and overhead above engine latency to <=40 ms. Preserve <=50 ms interruption mute and zero stale cancelled audio. The SDK receiver is muted; one MediaStreamAudioSource/shared AudioContext graph is audible. The rejected MediaElementAudioSource candidate is historical. Human sound, speakerphone echo and Mac acceptance remain distinct. [Design](docs/superpowers/specs/2026-09-09-avatar-voice-effects-design.md); current proof belongs in PROGRESS.

## Wake and scenes

- One hashed sherpa package binds phrase/platform/version/tuning/corpus. Custom phrases use its token encoding, not training; no engine fallback. Changed wake packages take effect at next app start.
- Chinese KWS uses model-owned tokens, ppinyin, 16 kHz / featureDim 80 and reset after detection. Package/corpus tuning, not invented event confidence, governs acceptance; revalidate final Mac hardware.
- Customizable wake baseline: `魔鏡阿魔鏡`. Sleep is Active-only directed intent, never a wake keyword. Preserve the current avatar's exact farewell and finish playback before Realtime close, mic release and Dormant. Quoted/negated/hypothetical/incidental mentions do not sleep.
- Scene spells require normalized exact full-transcript match once per turn. Approved typed presets alone control hardware. Public scene/trigger/action IDs are not guest IDs. Draft tests never silently publish or activate another avatar.

## Cubism, previews and asset ownership

- Official vendored Framework/Core, WebGL2 and closest 9:16 display; actual output RMS/envelope drives lip sync. MotionSync is separate scope, not a retroactive Phase 3 gate.
- **2026-09-08:** dedicated Cubism library/test page. A rig is reusable art, not a public profile or guest. Managed imports validate and rediscover; rejection is visible. Appearance assignment is an explicit draft edit.
- Selection/load owns a silent local preview, without publication, Mirror switch, mic or provider call. Expose all motion groups/indices, expressions and actual MOC IDs/bounds/defaults/readback; lifecycle uses index zero. Writable parameters need not have artwork; Speaking clips do not replace audio mouth input.
- Reset stops actions and restores defaults. Replacement/unload/page leave release timed work and overrides. Preview overrides follow automatic effects; preserve actual bounds/defaults without range-step quantization.
- **2026-09-09:** Console motion previews loop natively without repeated fade-in; expressions retain SDK indefinite pose hold. Active highlight persists until reset/replacement. This is `preview: true` only; normal Mirror playback stays one-shot.
- **2026-09-08 framing:** preserve initial model canvas-height fit and explicit Layout. Draw/resize compose fresh projection/MVP without model-matrix mutation. PPU/horizontal padding must not shrink art. Console/Mirror share renderer, 9:16 viewport, aspect and DPR. No per-ID multiplier, dynamic alpha-fit or CSS zoom workaround. Artistic extreme-pose crop calibration is separate.
- **2026-09-09 labels:** operator name/version lives in managed `avatar-label.json`; no filename/UUID guesses. Unknown stays unknown; invalid labels fail visibly without hiding valid rigs. Sidecars may travel with future exports. [Label contract](docs/testing/avatar-library-labels-2026-09-09.md).
- **2026-09-09 Raven master:** `resources/avatar/Raven/v10/` separates runtime from editable CMO/PSD. Preserve masters; new authoring gets a new version. Managed userData copies stay distinct; no direct edits or automatic publication/synchronization. Build remains Ren-only. Runtime/checksum inventory is Git-eligible with byte-preserving `-text`; large editable/QA files remain ignored and need separate backup. [Storage policy](resources/avatar/Raven/README.md).

## Evidence

Mocks, unavailable cases and real results stay distinct. Required unavailable evidence is pending, never passed. Automation does not prove physical sound/effects, operator acceptance or Mac readiness. Cubism QA must explicitly identify external rigs; built-in success cannot stand in for Raven, and hidden-Mirror Console coverage cannot establish portrait/speech acceptance.

Protected product/review documents, historical `.claude/skills` inputs and installer remain under AGENTS boundaries. [Archived ledger](docs/archive/decisions-before-harness-2026-09-13.md) retains complete rulings and links to older archives; read it only for details/history absent here.
