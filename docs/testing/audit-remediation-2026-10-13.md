# Audited repairs and authoritative Raven — 2026-10-13

The owner authorized implementation and QA after the
[remaining-errors audit](remaining-errors-and-character-audit-2026-10-13.md),
and changed Raven's character direction to calm authority with dry disdain for
human fussing. This ledger retains failures as well as subsequent checks.
Production model IDs and seven tools remain unchanged. Hardware/provider QA
uses the canonical checkout, isolated data and the session TV-off exemption.

## Application repairs

- The camera tool snapshots the visitor-turn generation and checks it, media
  playback, control ownership, sleep and session closure after capture returns.
  Late images are discarded before `addImage`, with `camera_result_stale`
  metadata. Regression tests cover a new ordinary turn and media start.
- Camera permission/device availability has dedicated state. Native stderr,
  other diagnostics and `camera_starting` no longer restore availability;
  fresh frame delivery does. Both unavailable states have regression tests.
- Language hints ignore explicitly quoted titles and classify the surrounding
  leading clause. English requests containing Chinese titles and simple noun-
  subject sentences now select English; Chinese requests with English titles
  stay Chinese. Bare ambiguous Chinese copular titles stay neutral. This is
  a conservative hint, not a universal linguistic classifier or ASR gate.
- A fresh live memory failure crossed the old 8 KiB provider-envelope limit.
  The interpreter now independently bounds the HTTP envelope at 64 KiB and final
  assessment text at 2 KiB. Strict final-phase/schema/consent validation and the
  8-second deadline remain. Regression checks accept a 12 KiB envelope while
  rejecting oversized bodies and payloads. Automatic learning is now explicitly
  distinguished from an explicit `memory.remember` request in the catalog.

## Raven and evaluation

The versioned `raven-authoritative-persona.v1.json` defines calm, self-possessed
authority, dry wit, and brief refusal of idle praise/repetition demands. Supported
skills take precedence over that discretion; genuine distress receives restrained
care. It never requires humiliation, aggression, deception or a repeated catchphrase.
The shared catalog now permits persona-defined boundaries while preserving skill
execution and accuracy. The older uniformly accommodating sage direction is
superseded in DECISIONS and the character skill reference.

The character scenario has ten turns, including flattery, unconditional obedience,
role replacement, useful judgment, accurate corrections, language changes,
unavailable local media and fatigue. Judge v8 scores character separately and
accepts appropriate refusal without equating relevance with obedience. It keeps
the same minimum score of 3/4 for every applicable dimension and requires every
semantic criterion to pass.

The first live run (`2026-10-13T06-18-08-473Z`) completed all ten interactions and
15/16 runtime/check rows, but its v7 quality verdict failed strict validation
(`raven_qa_judge_verdict_invalid`). Its grades were discarded, so there is no
character-quality verdict for that attempt. No private response was retained;
the precise malformed component cannot be recovered. The harness now constrains
each turn's schema separately and computes turn/overall pass flags from validated
criteria and scores, avoiding redundant model arithmetic. Missing, duplicate,
foreign and content-bearing results remain rejected. The failed attempt is not
converted into a pass.

The first valid v8 run (`06-26-57-224Z`) passes 6/10 complete quality turns and
9/10 character scores. It fails role continuity, local-miss completeness,
emotional attunement and corrected facts. The revised candidate (`07-02-57-259Z`)
again passes **6/10 complete quality turns**, with **10/10 character scores** at
least 3/4. Role replacement, empty flattery, repetition, truthful AI identity and
the return to Chinese pass. Local scope/completeness now pass, but a quick-tool
preamble fails that turn. The remaining failures are an unnecessary question
instead of quiet companionship, incomplete corrected details, and an invented
fact in the English-with-Chinese-title turn. The runtime route checks pass 15/16
in both runs; the failed row is the overall quality check. No general reliability
or vocal-performance acceptance follows from these samples.

Measured with `o200k_base`, the current shared template is **443 tokens**, the
rendered authoritative Raven session **1,079**, and seven tool definitions **616**.
These are local token counts, not provider billing or a universal optimum. The
persona examples replace the previous persona rather than duplicating it.

At **15:14 Taipei**, Raven's authoritative personality and speaking style are
published as **v18**, using the existing schema-validating, atomic config service
under the Electron operation lease. Active and draft had to match the recorded
v17 hash before writing. Only those two avatar fields, the derived legacy persona
projection and revision change; the previous slot retains v17. Active and draft
hashes match after publication. Voice, model IDs, effort, media/presets and TV
policy are preserved. This implements the owner's character direction; it is
not a claim that the remaining model-quality failures passed.

The published-v18 `media_stop` regression (`07-14-13-119Z`) passes **8/8**:
real-provider playback, negated stop, exact **「停止播放」**, silent application
execution, subsequent conversation, microphone release and provider-error checks.
The published-v18 `additional_capabilities` run (`07-15-28-862Z`) passes **9/10**:
WebGL recovery, own/shared-folder playback, all four synthetic-image grounding
criteria, interruption/follow-up, release and provider-error checks. The Chinese
folder title fails discovery: neither the model query nor final ASR contains its
literal title, and the current-turn fallback finds no match. Command-lexicon
equivalence is true but does not authorize applying command folds to media titles.
The earlier title pass is not a guarantee of current recognition reliability.

All five captured Raven screenshots were inspected: external Raven rig visible
on black, no error overlay. This is virtual landscape evidence, not portrait-TV
acceptance. Screenshots remain scratch evidence until reviewed cleanup; the
durable archive contains metadata and check logs only.

## Hardware investigations

Fresh native camera QA still fails sustained delivery: production mode obtains
0/6 required snapshots; a lower-bandwidth 320×240 YUY2, 5 fps trial obtains 4/6
before stalling. Neither reaches the deliberate-stall phase. The lower-bandwidth
trial measures reset initiation 2.900 seconds after the last frame and a fresh
frame 4.556 seconds after reset, followed by another stall. All six fresh UVC log
summaries contain invalid-payload counters. The experiment is reverted, with its
worker patch retained for reproduction. No production format or idle watchdog
change is justified; app-owned targeted reset remains awake-only.

The new `wake_aec_alignment` experiment compares far-end-only Jabra/Mac playback,
then 16/32 kHz Jabra capture, before another overlapping-speech wake campaign.
It uses the actual post-gain played PCM as reference, releases the normal owner
before capture, and closes capture before restoring that owner. Only freshness,
queue and alignment metrics persist. Alignment alone cannot establish effective
barge-in or human wake accuracy.
All three cells fail to align despite fresh input and zero dropped references,
queue overruns or backpressure. A separate three-cell comparison at explicit
48 kHz stereo output, with the post-conversion reference, also never aligns.
Production AEC remains disabled. This does not prove a Jabra hardware defect.

The alternate `wake_browser` experiment captures through Chromium processing
and feeds the same local detector. Its first attempt reaches 4/5 quiet positive
detections and 0/5 negative triggers, then cannot play its background data URL
under the existing content policy. This is failed/incomplete delivery evidence,
not a qualified AEC path. The harness now uses an allowed, RAM-only blob URL and
pads native visitor playback as the established physical QA route does.
The repaired run (`07-09-45-007Z`) completes all 30 trials but detects only **2/5
quiet positives** and **0/10 speech-background positives**, with no negative
triggers in 15 trials. Fresh input continues; browser capture closes and native
ownership restores. It remains an unqualified alternate route. No production
capture replacement, Jabra setting change or detector-threshold relaxation is
deployed on this evidence.

## Live memory outcome

The initial two-visit run calls `memory.remember` twice for ordinary biography
and reports `memory_interpretation_body_oversized`. After the envelope and prompt
repair, ordinary biography/corrections call no memory tool, automatic learning
commits, and the explicit save succeeds without interpreter errors.

Both attempts stop at `raven_qa_return_identity_mismatch`: Main reports an
unmatched return name, and final ASR is not literally identical to the scripted
introduction. No transcript/name values are retained, so the exact variation
cannot be reconstructed. Private memory remains locked; dependent confirmation,
recall and quality judgments are **not executed**. No fuzzy private-profile
matching or fabricated recall pass is introduced. Historical timeout and other
schema failures are not all explained by this one reproduced envelope defect.

## Research and interpretation

- [OpenAI voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting)
  supports scoped behavioral priorities, personality/delivery separation and
  changes driven by evaluations. Neither a short prompt nor few tools alone
  establishes optimization. The configured mini model remains the test subject.
- [Realtime evaluation](https://developers.openai.com/cookbook/examples/realtime_eval_guide)
  supports separating audio understanding, ASR, application execution and reply
  quality. No transcript score here certifies vocal acting or human experience.
- [Decibri AEC](https://decibri.com/docs/audio/aec) distinguishes an arriving but
  unaligned reference from reference starvation. The new comparison tests that
  boundary rather than enabling an unqualified production canceller.
- [Jabra's specification](https://www.jabra.com/_/media/Jabra_VXi_Product-Documentation/Jabra-Speak2-75/Technical-specifications/RevC/EN-Speak2-75-Tech-Spechs-180924.pdf)
  advertises full duplex and signal processing. This does not establish how the
  tested USB route treats simultaneous synthetic speech; device processing is a
  hypothesis until route comparisons isolate it.
- [Arducam's troubleshooting guidance](https://docs.arducam.com/UVC-Camera/Troubleshooting/)
  discusses USB negotiation/performance, but does not identify our invalid-payload
  fault or guarantee a software cure. Lower bandwidth is an application experiment,
  not a vendor-confirmed fix. No manual USB work or firmware flashing is requested.

## Verification ledger

Initial new regressions: 11 failed, 184 passed, reproducing the audited boundaries
and nearby title cases. After the application fixes: 195 passed. Initial focused
prompt/memory checks: 81 passed. Both TypeScript projects and the build pass after
adding the bounded camera reason to the metadata allowlist. The initial missing
allowlist type error is retained. The judge helper's initial test assertion used
an incorrect one-element array match; fixing that assertion retains the required
failing-score behavior. Further live results and final checks are recorded below.

Evidence directory: [audit-remediation artifacts](../../.artifacts/audit-remediation-2026-10-13/).
No transcripts, conversation audio, captured camera images, private memory,
embeddings or credentials are archived. No phase or human/portrait/soak acceptance
is implied.

Final full `npm test`: **2,062 passed, one skipped**, 184 passing files, exit 0
in 72.41 seconds, including sequential Electron integration. Both TypeScript
projects, build and source/output verification pass. The three changed domain
skills validate with the existing isolated validation environment (system Python
lacks PyYAML). The scoped application/QA diff and whitespace checks pass.

## Remaining failures and next boundary

1. **Camera stream reliability:** rapid app-owned USB reset is operational, but
   fresh images still stop. Further unchanged resets/format guesses are not a
   demonstrated cure. Firmware, transport and macOS UVC remain unisolated; no
   manual unplug/replug or unrelated-device reset is requested.
2. **Wake during playback:** six native AEC alignment cells and the alternate
   Chromium route fail. Effective cancellation and representative human wake
   remain unqualified. Changing thresholds cannot repair an unproven audio path.
3. **Returning identity:** two-visit QA stops at a differently resolved name.
   A safe spelling/correction recovery flow needs separate evidence; approximate
   private-profile matching is not introduced. Recall tests are not executed in
   these two runs, so the prior poor recall finding is still open.
4. **Realtime wording/accuracy:** character continuity is improved in the final
   sample, while premature tool speech, unnecessary questioning, incomplete
   corrections and invented details persist. More prompt text is not justified
   by these results. A controlled model/effort comparison and owner listening
   are next evidence, not silent production substitution or regex speech filters.
5. **Chinese title recognition:** the final capability case loses the literal
   title in both ASR and the model query; safe discovery returns no match. The
   language-hint repair does not claim to repair acoustic recognition.
6. **Historical interpreter failures:** the reproduced envelope failure is fixed;
   earlier generic schema errors and the timeout are not retrospectively proven
   to share that cause. Bounded stage diagnostics remain available.

No 24-hour soak, portrait-TV, physical-button, packaged/signing or human-microphone
acceptance is claimed. Normal Raven remains stopped as at task entry; installed
TV policy is intact. Published v18 will be used on the next normal start.

## Run index (2026-10-13 UTC)

| Run suffix | Archive case | Outcome |
| --- | --- | --- |
| 06-18-08-473Z | character-initial | Invalid v7 judge; no usable grades. |
| 06-26-57-224Z | character-retest | 6/10 quality, 9/10 character. |
| 06-35-40-676Z | camera-native | 0/6 sustained snapshots. |
| 06-36-39-703Z | camera-low | 4/6; trial reverted. |
| 06-38-06-644Z | wake-alignment | None of three cells align. |
| 06-40-33-439Z | memory-initial | Oversized envelope, return-name mismatch. |
| 06-47-43-173Z | wake-native-alignment | None of three cells align. |
| 06-50-23-106Z | memory-retest | Save/learning repaired; return mismatch persists. |
| 07-00-20-166Z | wake-browser-initial | Harness playback failure; incomplete. |
| 07-02-57-259Z | character-final | 6/10 quality, 10/10 character. |
| 07-09-45-007Z | wake-browser-retest | 2/5 quiet and 0/10 speech positives. |
| 07-14-13-119Z | media-stop | 8/8 on published v18. |
| 07-15-28-862Z | capabilities-final | 9/10 on published v18; Chinese title fails. |

Scoped implementation files are the camera tracker, Realtime adapter/event
allowlist, visitor-language helper, memory interpreter and their regressions;
the prompt/tool catalogs and authoritative persona; the conversation fixture,
judge validation and native/browser audio QA drivers. DECISIONS, PROGRESS and
the memory/character/QA skill references record the new boundaries. Prior edits
in the shared checkout are preserved. The native camera experiment is reverted.

The [archive manifest](../../.artifacts/audit-remediation-2026-10-13/manifest.json)
records file sizes and SHA-256 digests. Named completed runs use the guarded
QA-artifact review/cleanup helper after metadata archival; see
[cleanup receipts](../../.artifacts/audit-remediation-2026-10-13/cleanup.json).
No unrelated scratch run is eligible for this cleanup.
