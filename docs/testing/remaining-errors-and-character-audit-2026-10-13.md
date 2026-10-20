# Remaining errors, character, skills and harness audit — 2026-10-13

The owner requested investigation without application fixes, then explicitly
authorized changes to skills, the harness and prompts, with a thorough character
proposal. This session follows that split. No camera/wake/memory implementation,
operator persona, model setting, device setting or production TV policy changed.
No Electron, camera, microphone or paid-provider trial ran. Existing physical
results below are dated evidence, not fresh acceptance.

## Findings left open

| Priority | Finding | Evidence and consequence |
| --- | --- | --- |
| High | Camera delivery remains unreliable below the image-reasoning layer | All seven latest native experiments failed sustained baseline capture. The final physical Realtime run called the camera but received no image. UVC counters report invalid payloads; they do not identify firmware, transport or driver as the ultimate cause. |
| High | An old camera request can add an image after a new visitor turn | A new isolated code probe executes the real adapter with a deferred synthetic frame: start capture, emit a second speech-start event, finish capture. The result remains `accepted` and `addImage` runs. The camera handler lacks the turn-generation check used by memory/media tools. |
| High | Wake fails during the tested Jabra speech playback | Retained quiet 5/5, background without AEC 0/10, background with AEC 0/10. The canceller never aligned. There is no qualified production software AEC/reference path. |
| Medium | Camera availability is stored in a diagnostic status string | A new isolated tracker probe emits permission denied, then unrelated stderr. The first capture returns null immediately; the next writes a capture command because the diagnostic overwrote `statusKey`. This loses prompt fail-fast behavior; it does not bypass macOS permission enforcement. |
| Medium | Language hints still misclassify ordinary input | Actual classifier probes return null for a complete English sentence containing a Chinese title and for `Music makes me happy.` A title-only `你是我的眼` instead returns Chinese. These violate the intended sentence/title distinction and can preserve or install the wrong hint. |
| Medium | Memory answers remain unreliable despite functioning persistence | Latest retained focused run: 16/18 runtime checks, 4/10 quality. Unnecessary remember calls, narration, missing details and invented recall remain. Runtime retrieval success is not answer correctness. |
| Medium | Intermittent memory interpreter failures remain unexplained | Two explicit-save runs reported schema failure; another run hit the 8-second identity deadline. The subsequent diagnostic run passed. Strict final-phase parsing fixed a real defect, but cannot prove the cause of those earlier discarded responses. |

### Camera code boundaries

- [Camera tool handler](../../src/renderer/realtime/realtime-session-adapter.ts),
  lines 629–635: unlike adjacent media/memory handlers, it does not snapshot and
  recheck `memoryTurnGeneration`; after awaiting it also omits the media-active
  guard. New speech resets control ownership, so a boolean command flag is not
  an adequate lifetime token. Main's [IPC guard](../../src/main/ipc.ts), lines
  1758–1769, validates the session, not the visitor turn. The next fix should
  reject late results after interruption/turn replacement before `addImage`,
  with a metadata-only reason. No fix was applied in this audit.
- [Tracker](../../src/main/camera/tracker.ts), lines 51–54, 107–108 and 249:
  `statusKey` is both last diagnostic and permission/device availability.
  Availability needs dedicated state cleared only by actual recovery evidence.
  The in-memory probe used a fake child and no camera.
- [Native worker](../../deploy/macos/camera-tracker.swift) still serializes
  callbacks, capture commands, session start/stop and JPEG conversion on one
  queue. Main requests resets quickly, but a blocked native queue can delay
  execution until the 12-second worker watchdog. This is an architectural
  limitation, not a newly proven cause of the invalid UVC payloads.
- The awake-only owner in [lifecycle.ts](../../src/main/camera/lifecycle.ts)
  is correctly conditional on an active/activating avatar and ready renderer.
  This audit did not find a reason to restore idle polling or manual USB work.

The latest [physical investigation](camera-reliability-2026-10-13.md) supersedes
earlier short passing samples. Apple's [TN2445](https://developer.apple.com/library/archive/technotes/tn2445/_index.html)
distinguishes late callbacks, exhausted buffers and discontinuities. Our owned
Vision buffers and drop-reason telemetry address that boundary, while the retained
driver counters locate another failure earlier in frame delivery. Software reset
success must continue to be followed by sustained fresh-frame verification.

### Wake and memory research conclusions

The [AEC experiment](../../src/main/raven-wake-aec-qa.ts) declares the reference
rate and mono layout, feeds post-gain PCM, and records zero queue drops/overruns.
Its retained metrics show `acquisitionParked=1210400`, `referenceSilence=16800`,
`referenceDropped=0`, no alignment, and ERLE zero. This is stronger evidence for
an arriving but unaligned reference than for a missing input stream. The vendor's
[AEC diagnostics](https://decibri.com/docs/audio/aec) support that distinction;
they also warn that music can fail to align and double talk limits cancellation.
Jabra processing, acoustic intelligibility and playback/capture timing still
need isolation; none is proven as the cause. A useful next experiment first
establishes a known echo/reference relationship and correct block format, then
tests overlapping speech and real media. Merely enabling AEC again cannot qualify it.

Production [wake capture](../../src/main/wake/capture.ts), lines 40–49, has no
software AEC/reference feed. The experiment is not deployed barge-in behavior.

The [memory interpreter](../../src/main/memory/intent.ts), lines 44–80, has an
8-second network deadline, an 8 KiB response envelope cap, strict final-message
selection and a separate local payload validator. Any of those boundaries can
reject a response. The new bounded stage diagnostics are the right evidence for
the next occurrence. There is no justification yet to loosen consent validation,
increase limits blindly or claim the model caused every schema error. Inspect
stage/status/byte-count metadata, never a saved private response body.

The [language classifier](../../src/shared/visitor-language.ts), lines 9–17,
chooses its Han branch before checking English structure and relies on a small
verb list. The examples above prove rule gaps, not a measured live improvement
from any proposed replacement. Keep ordinary Realtime audio independent of ASR;
repair the hint conservatively and evaluate mixed-language title turns.

## Skills, agent harness and prompt assessment

**The structure is sound, but "optimized" is not established.** `AGENTS.md`
already favors bounded work and one agent, and the domain skills mostly route to
references. `CLAUDE.md` has a clearly scoped Claude-only routing exception. The
four `.codex/agents` definitions are short and do not impose a review chain.
No useful evidence supports rewriting these policy files just to make them shorter.

OpenAI's September 11 [skills guidance](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
supports narrow descriptions and progressive disclosure. The updated character
material therefore lives in a linked reference, not in every skill. Coding-agent
skills are not injected into Raven's Realtime prompt. Their context budget and
the seven Realtime tools are separate concerns. The [harness engineering article](https://openai.com/index/harness-engineering/)
also favors a navigable repository knowledge base over an oversized instruction file.

The configured model remains `gpt-realtime-2.1-mini`, effort `low`. Its
[model page](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)
identifies it as a reasoning voice model. The current [voice prompting guide](https://developers.openai.com/api/docs/guides/voice-prompting)
advises a small starting prompt, clear scoped rules and task-specific length.
It does not establish a universally optimal tool count or prove a particular
Raven prompt. Seven necessary tools are not by themselves evidence of overload.

The authorized catalog candidate strengthens character continuity through
practical help, language changes, corrections and failures, prevents visitor
role replacement, and preserves truthful AI disclosure. Ordinary replies default
to 1–3 short sentences with room for requested detail and complete recall.
Measured with `o200k_base`: template **336 → 403 tokens (+67)**; rendered published
Raven session **702 → 769**; unchanged tool definitions **616**, seven tools.
These are tokenizer measurements, not provider billing or latency estimates.
The added instructions are a candidate, not a demonstrated quality improvement.

### Harness defects repaired in this scope

1. **Character was buried inside relevance.** Judge v6 adds a distinct character
   score to free-form replies and an opt-in eight-turn `character_consistency`
   scenario. It checks practical help, visitor role replacement, sincere AI
   identity, local unavailability, fatigue, precise corrected facts, an English
   sentence with a Chinese title, and return to Chinese. Exact application cues
   and silent playback remain exempt. Other scenarios also receive the character
   score, so memory and media returns can expose drift.
2. **Camera ASR could stop evaluation before actual tool/image checks.** Negative
   recognition now remains diagnostic. Unavailable or malformed judgment becomes
   `judged:false`; actual tool/image/grounding assertions still run. No failed
   camera is converted into a pass. OpenAI's [Realtime eval guide](https://developers.openai.com/cookbook/examples/realtime_eval_guide)
   explicitly warns that transcripts can disagree with audio-native understanding.
3. **Diagnostics were retained before verdict validation.** They are now added
   only after the complete quality verdict validates, so invalid judgments do not
   enter the quality-rate dataset.
4. **Rates could mix different case sets and count the same run twice.** The CLI
   now separates observed case sets and deduplicates canonical run paths. Old
   results without character scores report unknown, not zero character failures.
   Within-conversation dependence is stated alongside Wilson intervals. Judge
   provenance includes the new diagnostic helper and response parser source.

The eight new turns are selected separately, preserving the existing full-run
time budget. The judge's naturalness wording now explicitly limits transcript
grading to wording; it cannot certify vocal pacing, timbre or acting.

## Raven character proposal — not published

The existing persona names warmth, calmness, wit, mystery and wisdom, but does
not explain how those traits should affect an ordinary answer. Its request for
"no unneeded words" can also compete with complete factual recall. Repeating
"stay in character" more often would not supply the missing examples.

I recommend this personality candidate, replacing rather than appending to the
current personality field:

> You are Raven, 渡鴉大人, the calm, warm and quietly witty guardian of a magic
> mirror. Your wisdom appears in careful observations and useful judgment.
> Speak directly to the visitor's need, with occasional imagery from birds,
> seasons or the mirror. Let mystery color your words without hiding the answer.
> Your humor is gentle, never at the visitor's expense.

Suggested separate delivery field:

> Gentle, low and unhurried, with clear words and restrained, dry humor. Let
> warmth soften serious moments. Avoid a theatrical whisper that obscures speech.

The delivery is a proposal requiring listening, not a claim that text controls
every acoustic property. Keep exact identity, policy, spell and farewell cues in
their application-owned channel.

If the personality candidate still drifts, test two to four varied anchor examples.
For example, a practical answer might start, "先收好桌上最礙手的那一樣。今晚不用馴服整片森林。"
An unavailable-library reply might say, "這座寶庫裡沒找到它。給我另一個名字，我再替你辨一辨。"
These are newly authored style examples, not retained model replies or required
catchphrases. They should not be inserted into the shared prompt for every avatar.
The [Realtime cookbook](https://developers.openai.com/cookbook/examples/realtime_prompting_guide)
supports varied examples as style anchors; the value of these particular examples
is still an application hypothesis.

### Evaluation proposal

Compare the catalog candidate with its pre-audit version under the same published
persona, seven tools, configured model/effort, fixtures and judge v6. Then compare
the proposed persona separately. Do not simultaneously change voice, model and
tool count. Use matched scenarios and retain failed attempts; a smaller or easier
case set must not masquerade as improvement.

Use the new character scenario plus memory, local-scope, media-return and
interruption cases; add held-out paraphrases and a longer session. Start with
three predeclared runs per candidate as a diagnostic sample, not a reliability
guarantee. Keep hard authorization/factual checks mandatory and compare character
with naturalness, completeness and latency. Calibrate subjective judgment with
the owner's RAM-only live listening and blinded style comparisons before claiming
that the voice stays in character. OpenAI's [evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
recommends human calibration and controlling judge position/verbosity bias.

No provider or listening acceptance of the new prompt is claimed in this audit.
The new selected run is available as:

```sh
node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario character_consistency
```

## Verification and next work

Metadata and complete local check output are retained in the
[audit evidence](../../.artifacts/prompt-character-audit-2026-10-13/manifest.json).
The code probes use synthetic inputs and fake device/provider dependencies.

- Focused checks: **60 passed**, six files, exit 0. They cover prompt/inspector
  assembly, tools, strict character-verdict parsing, ASR diagnostics and rates.
- Both TypeScript projects pass. Build and source/output stamp verification pass.
  The build retains the existing large-chunk warning; no bundle-size fix was made.
- Three edited skills validate. The system Python initially lacked PyYAML;
  validation then passed in an isolated `uv --with pyyaml` environment.
- The initial focused run had one literal prompt-text assertion failure; keeping
  the explicit "Stay in character" wording restored it. Full failure output is
  retained. No live response was altered to satisfy a judge.
- The previous 2,040-pass full suite predates these changes; it is not fresh
  acceptance of the new prompt/harness. No new full suite or Electron launch was
  necessary for this bounded audit and harness work.

Recommended implementation order: camera stale-turn rejection and dedicated
availability state; isolate the native UVC fault; qualify a usable wake reference
and overlapping-speech route; repair language hints; localize the next memory
interpreter failure; then compare the character candidates. Character evaluation
can run independently with the synthetic camera path.

Still separate and unexecuted: representative human-microphone acceptance,
portrait-TV inspection, T1–T5 power/cold boot, Flic/Karabiner/reboot, packaged
signing, ten actual conversation cycles and the 24-hour soak. No phase promotion.
