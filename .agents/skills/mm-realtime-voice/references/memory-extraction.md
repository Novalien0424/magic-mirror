# Responses extraction boundary

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Memory extractor (Responses API, Phase 6)

- Structured Outputs shape is nested under `text.format`, not
  `response_format`:
  `{ type: 'json_schema', name, schema, strict: true }`. Strict mode means all
  properties are required and `additionalProperties: false`. Use the helper
  `zodTextFormat()` from `openai/helpers/zod`.
- Parse only completed final-answer messages: `phase: 'final_answer'`, omitted
  phase or null phase. Exclude commentary and every other explicit phase even
  if its text happens to satisfy the schema. Combining all `output_text` parts
  can reject a valid final answer or authorize a preliminary proposal. Keep
  refusal, schema, source-evidence and ownership validation after phase selection.
  Installed `openai/src/lib/ResponsesParser.ts` and the
  [official parsing contract](https://github.com/openai/openai-python/blob/main/helpers.md#parsing-responses-api-output)
  agree; apply the same boundary to memory intent and QA judgments.
  Interpreter failures report bounded body/envelope/completion/final-output/payload
  stages without response text. Preserve strict validation; a generic schema
  failure alone does not identify which boundary failed.
- The intent interpreter bounds the provider envelope separately from the final
  assessment: 64 KiB HTTP body, 2 KiB final text, exact schema and an 8-second
  deadline. Preserve consent validation. Ordinary biography/corrections use
  automatic learning; `remember` is reserved for explicit save requests.
  An authorized save excludes only its own turn and carries the queued batch
  across its single epoch increment (`MemoryLearning.carry`); corrections,
  forget, policy and temporary still invalidate. Commits re-check topic revisions.
- Take the model from config and the `JobModelSnapshot` captured at enqueue.
  Pricing and model selection are not fixed by this reference.
- Snapshot boundary rule (P1-D5/D6, P6-D8): sessions freeze a
  `SessionModelSnapshot` at creation; jobs freeze a `JobModelSnapshot` at
  enqueue. A mid-session Publish never retargets live sessions or in-flight
  jobs. Only the next session or job picks up the new revision.
