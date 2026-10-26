# Magic Mirror — current handoff, 2026-10-25

The owner rejected rigid alias/rule-based media selection and requested current
research and a simpler LLM-led design for **at least 50 songs**.
[Research, proposed journeys, implementation boundaries and QA criteria](../testing/llm-media-catalog-design-2026-10-25.md).
Key finding: the normal prompt omits the complete catalog; only a QA baseline
includes it. Recommend supplying the compact authorized catalog to the existing
LLM for direct selection, with Main validating execution. Replacement is **not
implemented or provider-tested**. This turn changed documentation only.

Existing implementation is on `field/macmini-deploy`; its overall voice-quality
QA is **not green**. The last recorded owner STOP remains binding; runtime and
hardware state were not rechecked during this research-only turn.
[Previous name repair/music audit handoff](progress-before-media-search-repair-2026-10-24.md).

## Existing delivery, pending replacement

[Research, visitor/operator journeys, repairs and limits](../testing/music-search-repair-2026-10-24.md).
The model extracts original-language title/performer/version clues; bounded
literal/phonetic retrieval keeps real versions and ambiguity. New clues trigger
search, session context narrows a pending choice, and expired context searches
fresh rather than adding another visitor round. Clear matches play immediately.
Successful asset IDs can be replayed on a later request; duplicates and
conflicting pending versions stay blocked. Main revalidates scope/availability.

Console → Avatars → Raven → Media → **Search aliases** adds editable bilingual
aliases for linked music, videos and pictures. Save applies to the next lookup;
preview, Cancel, reload and removal work. Shared aliases apply across avatars.
No production aliases were populated, and no file was renamed. Published Raven
persona/speaking style, model configuration and command authorization are unchanged.
No canned jokes, mandatory sarcasm or speech-filter regexes were added.

## Prior implementation evidence — 2026-10-24

- **413 distinct focused tests pass**, reusing unchanged passes; latest affected
  context/adapter/catalog/fixture run **194/194**. Both TypeScript projects and
  build pass. [Checks, full development failures and cleanup](../testing/music-search-repair-checks-2026-10-24.json).
- Rendered media/operator journey **23 checks, exit 0**, with actual alias
  Save/Cancel/reload/removal and decoded music/video/pictures. Alias, media and
  Raven portrait screenshots inspected. UI paths were unchanged by subsequent
  voice context/replay refinements; those have separate focused/provider checks.
- Four synthetic-input real-provider samples are retained, **all exit 2**:
  [1](../testing/music-search-repair-provider-1-2026-10-24.json),
  [2](../testing/music-search-repair-provider-2-2026-10-24.json),
  [3](../testing/music-search-repair-provider-3-2026-10-24.json),
  [final](../testing/music-search-repair-provider-4-2026-10-24.json).
  Final build: **6/6 functional turns**, **1/6 overall turn-quality judgments**.
  Search, playback, missing-version non-substitution and one clarification work.
  The final run exercised a fresh search after an expired refinement. Successful
  direct replay is covered by adapter/context tests; this sample searched again.
- QA found and repaired an expired-refinement dead end and an overrestrictive
  guard rejecting replay of a previously successful song. Remaining judge flags:
  mechanism narration, unsupported banter claim, playback preamble and weak
  naturalness/character. No raw transcript retained; no human Jabra acceptance.
  Do not call these provider runs overall passes or claim universal style quality.

## Last recorded runtime and cleanup — 2026-10-24

Final build source `5da9746c55d736c4e`, output `ada4d477c3c241ca1`, built
2026-10-24 19:30:37 Taipei; full hashes in the report/checks. Normal Electron was
absent and black-HDMI cover PID 91006 was active. Jabra output restored/read
back **70.08%** after every QA run; mute and other output levels preserved, no
input-gain edits. Production active config, saved draft and media-folder config
hashes are unchanged (full hashes in checks). The task's five marked QA roots
were cleaned: **477 files / 112,684,644 bytes**, excluding retained markers;
31 owned scratch files removed. Failures and results remain metadata-only.

## Next action / remaining boundaries

The former recommendation to maintain aliases is superseded. The proposed next
implementation is full-catalog LLM selection with no alias requirement, followed
by comparative selection/latency/character QA and human Jabra acceptance. Existing
limits are 200 files per linked folder and 512 merged resources; do not promise
larger-library coverage without addressing them. No upper catalog size was
confirmed. Keep remaining dialogue-quality failures visible; do not force
catchphrases or weaken the judge to claim a pass. The original field conversation
cannot be reconstructed after its Dormant transcript clear.

The prior [guest-name repair](../testing/guest-name-repair-2026-10-24.md) remains
unchanged. Broader failed-opening recovery and operator-rescue gaps remain in
[the journey audit](../testing/studio-journey-audit-2026-10-24.md); camera,
physical hardware and second-computer acceptance remain in [TODO](../../TODO.md).
[DECISIONS](../../DECISIONS.md) owns rulings. No phase promotion.
