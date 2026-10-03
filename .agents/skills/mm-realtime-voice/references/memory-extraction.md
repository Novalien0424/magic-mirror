# Responses extraction boundary

Repository implementation reference; installed code, current DECISIONS and focused contract tests outrank historical SDK/version observations. Follow AGENTS for execution policy.

## Memory extractor (Responses API, Phase 6)

- Structured Outputs shape is nested under `text.format`, not
  `response_format`:
  `{ type: 'json_schema', name, schema, strict: true }`. Strict mode means all
  properties are required and `additionalProperties: false`. Use the helper
  `zodTextFormat()` from `openai/helpers/zod`.
- Take the model from config and the `JobModelSnapshot` captured at enqueue.
  Pricing and model selection are not fixed by this reference.
- Snapshot boundary rule (P1-D5/D6, P6-D8): sessions freeze a
  `SessionModelSnapshot` at creation; jobs freeze a `JobModelSnapshot` at
  enqueue. A mid-session Publish never retargets live sessions or in-flight
  jobs. Only the next session or job picks up the new revision.
