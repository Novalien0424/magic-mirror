# Prompts and structured controls

## Sources and execution

- `resources/config/prompts/realtime.v1.json` owns application speech/session wording and defaults. `realtime-tools.v1.json` owns native function schemas, use/avoid/speech rules and structured results. Operator configuration owns character values. Code owns assembly, authorization and ordering; no hidden model prose or regex dialogue filters.
- `src/shared/realtime-tools.ts` validates/freeze-loads the catalog and builds both prompt rules and native definitions from enabled tools. Audition exposes none. `src/renderer/realtime/realtime-tool-bindings.ts` binds only explicitly implemented handlers and validates every argument before effects. A catalog entry alone grants no execution capability.
- The current schema vocabulary is strict objects with all fields required, arrays, scalar types and enums. Unsupported keywords fail loading; extend parser, validator and parity tests together. Do not silently weaken schemas. Installed SDK 0.16.1 passes raw JSON schemas through without local validation; the renderer uses Zod conversion and the public FunctionTool interface. Shared/preload modules must have no runtime validation-library import.
- Results are small JSON objects: `status`, metadata-only `code`, and `speech` ownership. Current tools use SDK background completion; the application requests the farewell separately. Argument/handler failures return catalog results and metadata reasons, never raw exceptions. Future tools needing another completion policy require an explicit implementation and tests.

## Inspect and diagnose

Trace published avatar settings through Main, preload and session dispatch. The **Effective realtime prompt & tool** launcher opens Session, Speech, Tools & input, Audition and Sources windows. These show draft/published configuration snapshots, not live visitor history. New model-visible paths must appear here using the same builders. Both JSON catalogs are bundled: rebuild/restart after edits.

Wake detection, sleep intent, wake greeting and farewell are separate controls. Transcription hints use selected wake/sleep/enabled spell phrases; they neither authorize effects nor guarantee recognition. Local wake text requires its compiled keyword package.

Hidden spells stay in the application matcher and transcription hints, outside persona instructions and model-selected tools. Match the normalized full final transcript once per turn; no fuzzy/substring/LLM fallback, player coaching or added confirmation. Check enabled/published scope and reason metadata; inspect a failed transcript only in RAM. Follow `roleplay-control-prompts` for speech/effect ordering.

Greeting, farewell, scene dialogue and audition use response-scoped instructions, `input: []`, `tool_choice: none`; never persistent imperative user messages. Announcements must finish actual processed playback before effects; interruption/session change cancels pending effects.

## Evidence

Check schema/inspector parity, unavailable tools, invalid arguments, safe failure, duplicate/stale calls and ordinary follow-up after greeting. Windows lifecycle QA compares actual wire definitions/results and speech/playback using synthetic input, storing only flags/counts. Separate this from microphone ASR and physical output. Silent-tool prompting cannot guarantee silence before tool intent; preserve observed violations.

API guidance checked 2026-09-17: [Realtime tools](https://developers.openai.com/api/docs/guides/realtime-mcp), [voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting), [function calling](https://developers.openai.com/api/docs/guides/function-calling). Recheck installed SDK and current official docs when changing the contract.
