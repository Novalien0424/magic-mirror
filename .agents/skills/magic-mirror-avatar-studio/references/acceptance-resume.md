# Delivery and resume

Continue in the user's job directory. Keep original/repainted art, import PSD, CMO/CAN, runtime and evidence distinct; never leave the only useful source in a temporary download. Do not copy source into the product repository unless requested.

## Durable state

Keep one current checkpoint: scope, accepted baseline, artifact identity, observed result, unresolved defect and next authorized action. Use [job-template.json](../assets/job-template.json) only if it helps; an adequate checkpoint needs no duplicate status file. Empty fields do not mean passed. Runtime acceptance defaults to bundle/import/display, not conversation testing.

Record ownership, mappings and frame paths only as needed. Separate accepted limitations from unresolved defects. Pending operations are not results; blockers identify an actual missing capability/error.

On compaction, link historical logs rather than preloading them. New feedback can reopen a pass; a summary does not itself trigger host compaction. Preserve historical capture labels and archive hashes; record later acceptance in the current checkpoint, not by rewriting old evidence.

On resume, verify the source needed for the next action; hash changed/ambiguous files rather than every archive. Reacquire tools/UI when the requested operation needs them. Hash differences may be user edits; inspect before replacing. Window handles and coordinates may be stale. MOC cannot losslessly recover CMO.

## Evidence and completion

| Boundary | Evidence |
|---|---|
| Artwork/PSD | Usable separated surfaces, native reopen/import and visual comparison |
| Rig | Actual neutral/intermediate/extreme and relevant combined forms |
| Bundle | Genuine matching export, complete references and actual Core load |
| Import/display | This export visible through normal Magic Mirror UI; identify Console or Mirror |
| Product integration | Separately authorized application behavior and physical/device evidence |

Use [perceptual QA](perceptual-qa.md) for affected checks. Choose anatomy-appropriate forms: a bird beak does not automatically need human vowels, and an arm repair does not require a new frontal head pose. Preserve validated behavior and check shared-parent/mask regressions.

```sh
node .agents/skills/magic-mirror-avatar-studio/scripts/validate-bundle.mjs --project /Users/novalien0424/magic-mirror --model '<job-root>/runtime/avatar.model3.json'
```

Exit 0 establishes static validity only. Official samples can clarify format/tool behavior when needed; their success cannot stand in for this model. Use current compatibility/targets, not historical performance numbers.

Use normal import/preview and record the loaded export identity. Preserve drafts; saved library import, draft assignment and publication are distinct. Deliver the actual editable source and matching runtime. If making archives, verify their payload hashes after readback; unchanged clips/art can be reused with provenance. Agent inspection is not user acceptance.

When the user accepts the result, mark it complete and retain its source/evidence as the next baseline. A later learning-only request updates instructions/checkpoint, not the accepted model, old evidence or verified archives. Reopen authoring only for new requested work. Promote reusable diagnosis and operation lessons to the skill; leave coordinates, object IDs, tuning, ports and version histories in the job.
