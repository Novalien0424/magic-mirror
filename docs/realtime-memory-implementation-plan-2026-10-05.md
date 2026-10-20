# Realtime relationship memory implementation plan

Authorized 2026-10-05: implement the reviewed relationship-memory architecture with TDD, self-review and QA. Preserve the existing Realtime model and voice. Existing research/design edits are retained.

1. Storage: failing migration/isolation/revision/idempotency/deletion/hybrid-recall tests, then private SQLite implementation and Main worker facade.
2. Embeddings: failing helper contract/cancellation/privacy tests, then a pinned local multilingual runtime and synthetic semantic check. No credential access by workers; no cloud fallback.
3. Learning and integration: failing tests for source-bound ownership, exclusions, background proposals, stale commits and confirmation/brief/recall, then Main extractor/coordinator and Realtime tool/context wiring.
4. Console: learning policy, facts/episodes and search through authorized IPC. Preserve unsaved edits and Dormant-only mutations.
5. QA: focused regression tests, typecheck/build, isolated rendered Console memory QA, synthetic integration and real configured-provider contract checks where available. Run Electron sequentially from canonical checkout. Preserve failures and distinguish real voice/manual checks.

Plan self-review: storage worker and embedding helper are independent substantial tasks and use the AGENTS CLI route. Root owns shared contracts, integration, extraction, UI and QA. All mutations serialize; ordinary speech cannot wait for final ASR; only eligible final evidence may be learned. Cancelled tool results must not create speech. Model/schema validation does not prove factual truth. Existing data migrates privately without unmanaged backups, and no automatic profile sharing or model replacement is allowed. Apply all invariants 1–12, with the approved selected-summary persistence extension recorded during implementation.

The architecture and its same-author self-review remain the acceptance design. Implementation evidence and unresolved acceptance limits will be recorded in PROGRESS; this plan is not a runtime pass.
