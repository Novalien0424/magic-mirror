# Historical memory delivery progress — 2026-10-05

Superseded delivery/runtime status, retained for evidence. See [current PROGRESS](../../PROGRESS.md).

## Historical: real two-visit memory smoke — 2026-10-05

User authorized real API conversations and full synthetic transcript recording.
[Test and full-transcript judgment](../testing/relationship-memory-real-conversation-2026-10-05.md):
two fresh WebRTC sessions, eight real audio/ASR utterances, normal Console
start/disconnect, automatic summary extraction, and two correct follow-up recalls.
No guest history was preloaded; seven summaries were learned through production.
Seven live checks passed in 266 seconds. Full synthetic transcripts remain in
local ignored artifacts; ordinary visitor recording stays disabled.

The test exposed and fixed an adapter bug: an unsolicited rejected memory save
was marking ordinary speech as control and suppressing automatic learning.
Main now owns memory-intent classification from visitor words. TDD regression,
110 focused tests, typechecks and build pass. Earlier failed runs are preserved.

**Memory recall passed; conversation quality did not.** The avatar repeated
confirmation questions, incorrectly described automatic memory as explicit-only,
averaged 51 words per visitor turn and added one unsupported first-visit claim.
The [implementation-grounded conversation review](../conversation-quality-architecture-review-2026-10-05.md)
records the research, exact local gaps, pinned OpenAI/LiveKit/Pipecat source study,
proposed dialogue protocol and ordered regression/live-test criteria. This is a
documentation-only proposal, not another runtime acceptance result.
Next: bind confirmation to the delivered question, synchronize identity/policy
even with an empty brief, then improve compactness and historical-import dates
before a bounded real-route rerun and human acceptance.
No additional paid run was spent retrying wording. Existing Markdown import is
ready for the user's future file; no actual user history was imported here.

Normal app restored through the existing LaunchAgent, PID **24396**, with operator
configuration unchanged. Avatar, camera, wake listening and local embeddings report
ready; [restoration evidence](../../.artifacts/phase4-qa/2026-10-05T06-09-23-569Z/runtime-restored.json).

## Historical: Realtime relationship memory implemented — 2026-10-05

The user authorized implementation through TDD, self-review and thorough automated
end-to-end QA, including a forthcoming large Markdown containing persona and history.
Realtime voice/model IDs remain unchanged. Delivered: scoped private SQLite v2 in a
Main worker, turn-bound background summary learning, confirmed-person brief,
semantic-first plus keyword recall, revision/epoch/dependency guards, correction and
forget cleanup, automatic/explicit/off/temporary modes, and a cancellable Markdown
import with separate persona review. Raw conversation evidence stays RAM-only.

[Implementation, import guide and review](../relationship-memory-implementation-2026-10-05.md)
links the design and evidence. [Earlier planning/foundation progress](../archive/memory-planning-progress-2026-10-05.md)
is historical. The architecture is no longer waiting for permission to implement.

Focused regression: 258 tests passed across 23 files. Node/web typechecks and build
pass. The real local Qwen3/MLX
smoke passed bilingual similarity and concurrent query-priority checks (1.44 s load,
14.2 ms warm mean; two synthetic relevance fixtures). More than 1 MiB of synthetic
Markdown was chunked and distilled with a synthetic extractor; raw-history/persona
markers did not enter SQLite and restart/isolation/correction/deletion checks passed.

The [final natural-provider live Electron run](../../.artifacts/phase4-qa/2026-10-05T04-09-01-242Z/evidence.json)
passed 23 checks: production Console edits,
policy/reload/draft retention/import, configured cloud extraction, actual Realtime
confirmation/context acknowledgment/remembered answer, local cross-language recall,
SQLite restart, guest/avatar isolation, and forget. Real WebRTC used a silent
synthetic microphone and synthetic ASR edges; it does not pass human microphone
or conversational-quality acceptance. Earlier natural-provider failures and their
repairs are retained in the implementation report; these fixtures do not prove
general conversational recall quality. No phase or packaged-deployment promotion.

Normal app restored through the existing LaunchAgent, PID **17514**. Operator
configuration v15 is byte-for-byte unchanged across restoration. Startup reports
Cubism, camera tracking, wake listening and local embeddings ready;
[metadata evidence](../../.artifacts/memory-implementation-2026-10-05/runtime-restored.json).

Next: use **Avatars → Memories → Import Markdown** for the user's actual file,
one person at a time. Persona is previewed separately; only distilled history is
saved. Human testing will assess omissions, recall cues, interruptions and natural
turn length. No user history has been imported in these synthetic tests.
