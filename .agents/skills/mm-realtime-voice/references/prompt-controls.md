# Prompts and structured controls

## Sources and execution

- `resources/config/prompts/realtime.v1.json` owns application speech/session wording and defaults. `realtime-tools.v1.json` owns native function schemas, use/avoid/speech rules and structured results. Operator configuration owns character values. Code owns assembly, authorization and ordering; no hidden model prose or regex dialogue filters.
- `src/shared/realtime-tools.ts` validates/freeze-loads the catalog and builds both prompt rules and native definitions from enabled tools. Audition exposes none. `src/renderer/realtime/realtime-tool-bindings.ts` binds only explicitly implemented handlers and validates every argument before effects. A catalog entry alone grants no execution capability.
- The current schema vocabulary is strict objects with all fields required, arrays, scalar types and enums. Unsupported keywords fail loading; extend parser, validator and parity tests together. Do not silently weaken schemas. Installed SDK 0.16.1 passes raw JSON schemas through without local validation; the renderer uses Zod conversion and the public FunctionTool interface. Shared/preload modules must have no runtime validation-library import.
- Results are small JSON objects: `status`, metadata-only `code`, and `speech` ownership. Sleep/media use SDK background completion; camera capture uses response completion after adding one RAM-only image with `triggerResponse: false`. The application requests farewell separately. Argument/handler failures return catalog results and metadata reasons, never raw exceptions.
- Memory adds a bounded private result only to the model's transient tool output, never diagnostics. `background_on_reset` suppresses automatic responses after deletion/person change; Main replaces the session before further private access.

## Inspect and diagnose

Trace published avatar settings through Main, preload and session dispatch. The **Effective realtime prompt & tool** launcher opens Session, Speech, Tools & input, Audition and Sources windows. These show draft/published configuration snapshots, not live visitor history. New model-visible paths must appear here using the same builders. Both JSON catalogs are bundled: rebuild/restart after edits.

Wake detection, sleep intent, wake greeting and farewell are separate controls. Transcription hints use selected wake/sleep/enabled spell phrases; they neither authorize effects nor guarantee recognition. Local wake text requires its compiled keyword package.

Hidden spells stay in the application matcher and transcription hints, outside persona instructions and model-selected tools. Match the normalized full final transcript once per turn; no fuzzy/substring/LLM authorization fallback. Check active-avatar enabled/published scope and reason metadata; empty legacy root collections do not establish an empty avatar catalog. Inspect failed text only in RAM. Follow [roleplay-control-prompts](../../roleplay-control-prompts/SKILL.md) for concise contextual dialogue and cue wording; do not repair ASR by adding regex speech filters, broader silence rules, coaching/confirmation gates or extra model constraints.

[Normalization](../../../../src/main/scenes/spell-trigger.ts) applies NFKC, Unicode
punctuation removal, Han spacing and an explicit fixed-prefix script equivalence;
it is not general Simplified/Traditional or homophone conversion.
[Transcript controller](../../../../src/renderer/mirror/scene-transcript-controller.ts)
rejects a mismatch before interruption, cue announcement or scene IPC. After a
match it interrupts old output and calls Main before requesting the application
announcement. Under the owner's 2026-10-10 review-remediation request (MX-05),
scene execution no longer waits for speech completion; later VAD may cancel
the cue but cannot revoke an already authorized scene.
[Main sender authorization](../../../../src/main/ipc.ts) and
[scene runtime](../../../../src/main/scenes/scene-runtime.ts) check the request,
enabled spell/scene, duplicate turn and cooldown. Approved presets own hardware
effects; fluent dialogue or audible response counts confer no authorization.

Greeting, farewell, scene dialogue and audition use response-scoped instructions,
`input: []`, `tool_choice: none`; never persistent imperative user messages.
Farewell still finishes processed playback before session closure. Spell cue
speech runs alongside its authorized scene; session change and Stop still clean
up the scene. Do not reintroduce the old cue-completion authorization gate.

## Evidence

Choose checks for the failing boundary: schema/inspector parity, arguments,
duplicate/stale events, exact matching or cue/playback ordering. Lifecycle/spell
QA uses synthetic text; Raven conversation QA sends synthesized PCM through a
virtual microphone and real WebRTC ASR. Neither proves physical microphone or
speaker acceptance. Prompt assertions and audible counts alone do not establish
spoken compliance; keep invalid/failed quality evaluations visible.

The [2026-10-10 RCA](../../../../docs/testing/wake-spell-rca-2026-10-10.md)
records an earlier ASR mismatch and a later exact-match/scene pass with unchanged
recognition settings. Extra speech remained a separate quality failure. Compare
outbound transcription configuration, returned server fields, recognition and
cue-only speech separately: an absent echo of a request field is not proof the
provider ignored it. The published avatar had no spells/scenes; the QA fixture
supplied one. These are dated results, not a universal diagnosis or accuracy rate.

Prompt/transcription guidance checked 2026-10-10: [voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting), [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription). API/tool contract details still come from installed source and [Realtime tools](https://developers.openai.com/api/docs/guides/realtime-mcp).
