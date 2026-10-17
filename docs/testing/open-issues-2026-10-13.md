# Unresolved issues — 2026-10-13

Current investigation: [focused research](focused-research-2026-10-13.md).
Earlier failures remain in the [previous ledger](audit-remediation-2026-10-13.md).
Completed work belongs in PROGRESS; this file keeps unresolved boundaries.
The [2026-10-14 review](review-fixes-2026-10-14.md) adds unit-tested fixes and re-reads; each affected issue notes it below.

Published Raven is v18: calm authority, independent judgment and restrained dry
wit. Production remains `gpt-realtime-2.1-mini` / low, `gpt-live-transcribe`,
`gpt-5.6-luna` for memory/judge, cedar and seven tools. Isolated model comparisons
do not publish settings. All twelve invariants and the installed TV policy apply.

## 1. Camera cannot sustain fresh frames

Fresh production QA obtains 2/6 snapshots and fails before deliberate-stall QA.
Reset begins about 2.95 s after the last frame; new frames return about 2.84 s
after the request, then stall again. Recovery remains app-owned and awake-only.
The independent four-second reset deadline handles a blocked helper, but that
path has unit evidence only; this hardware sample did not block.

The same signed helper/LaunchAgent with image processing bypassed also fails:
three sampled advancing-timestamp receipts over startup plus 60 seconds,
48.035 s maximum gap and two exhausted resets. Matching macOS UVC summaries
report invalid payloads. Read-only PROBE/COMMIT values match VGA YUY2 near 15 fps.
Standalone Swift probes are not equivalent launch-context controls.

Still unknown: camera firmware versus USB transport versus Apple's current UVC
parser. Public sources examined do not expose its counter definition. macOS
OpenCV/FFmpeg also use AVFoundation. Next useful evidence is packet/header/transfer
errors or a controlled alternate device/host. Another unchanged reset or format
guess adds little. No unverified firmware flash, unrelated reset or manual unplug.
2026-10-14: next discriminators are five minutes in Photo Booth and a known-good
UVC webcam on the same port; a synchronous helper spawn failure now degrades
instead of exiting Main. Later: five more robustness fixes landed, and
`camera_native` reproduced the identical stall (ready 1.3 s, stale 3.0 s, reset
restores frames, stale again). With 0 frames in a minimal standalone capture and
~99% invalid UVC payloads, the stall is below Magic Mirror; a one-time
cable/port or powered-hub swap is the cheapest added discriminator.

Code: [tracker](../../src/main/camera/tracker.ts),
[helper](../../deploy/macos/camera-tracker.swift),
[controls](../../src/main/camera/native-qa.ts). Evidence: `camera-native`,
`camera-delivery`, `uvc-delivery-control.json` in the
[current archive](../../.artifacts/focused-research-2026-10-13/).

## 2. Wake fails over the tested speech playback

Raising Mac stimulus hardware gain by 10 dB gives quiet 6/6 across original and
raised PCM, but original speech-bed positives remain 0/6. Reducing the bed by
20 dB gives 3/3; another run repeats quieter-bed 3/3 and original-bed 0/3.
Negatives remain clear. These are small synthetic stress samples, not human
accuracy estimates; foreground and background use the same TTS voice.

Still unknown: delivered phrase, Jabra DSP, acoustic timing and detector robustness.
Independent ASR fails the quiet acoustic control despite clean-PCM success, so its
playback misses cannot localize the cause. dBFS is not SPL/SNR; fresh-stream replay
and live decoding have different preceding context. Jabra firmware is current.
Temporary speaker gain was restored; production AEC/settings are unchanged.

Next: representative near-end speech with measured playback levels/reference and
working acoustic positive controls. Keep one mic owner and distinguish Dormant
local wake from Active Realtime media-wake. No unqualified threshold tuning or
implicit cloud fallback. Evidence: `wake-levels`, `wake-louder`, `wake-asr`.
2026-10-14 re-read: with the 0.07 bed the Jabra captures the near-end phrase
about 6 dB lower (−37 vs −31 dBFS) while cancelling the bed; pooled 0/15 vs 8/9
with a 20 dB quieter bed. This fits device near-end suppression. Next: owner
voice at the production Dormant loop level and 10 dB lower.

## 3. Corrected commitment and identity robustness

The fresh two-visit run reaches recall: intended identity and separate confirmation
pass both visits; automatic learning and explicit save execute. Material recall
passes; preference is factually correct but fails tool-silence grading. Corrected
commitment generation/recall fail semantic criteria. Correction ASR differs from
the script; metadata cannot identify the changed fields or faulty layer.
Two older identity mismatches remain relevant. Spelled-name repair was not needed
and has no fresh live exercise yet.

Static audit finds no demonstrated revision-overwrite bug. This fixture changes
a deadline within one utterance; it does not replace an already persisted old
commitment. Its old keyword-only learning barrier was insufficient proof of queue
completion; the repaired gate now also observes actual Main queue inactivity.

Next discriminator: bounded RAM-only field comparisons across final ASR,
committed summary, returned recall and final reply; retain only availability and
field-validity booleans. Fix the first failing boundary. A separate two-turn case
is needed for persisted revision replacement. No fuzzy identity or seeded recall.
Evidence: `memory-initial` and the correction audit in `worker-evidence`.

The two final gate retests add unresolved failures: correct identity followed by
rejected question delivery; then a biographical “I remember…” turn taking an
accepted explicit-save route, invalidating one pending automatic observation.
ASR differs from the script. Later correction commits, but the stricter learning
gate fails and recall is skipped. These are `memory-settled-initial` and
`memory-settled-retry`, not recall passes. Gate subconditions now have separate
metadata for future runs. The existing 45-second fixture wait is not a production
completion guarantee.

Direct fixed-text interpreter controls pass 6/6, including rejection of biography,
quotation and negation. Actual ASR/turn/payload attribution and the confirmation
delivery failure stage remain unknown. No evidence supports loosening consent,
silently changing memory models, or treating a keyword-only summary check as a
semantic verdict. See `intent-calibration`.
2026-10-14: two application causes are fixed, pending live QA — a recall tool
reply during a pending question cancelled it (`memory_question_rejected`), and
an explicit save discarded pending automatic evidence. The fixture gate still
skips recall when it fails. Live QA then passed the learning gate and all three
recalls; later first-identity failures each had inexact ASR of the synthetic
name (`recognition.exact=false`).

## 4. Dialogue/tool-delivery reliability and test attribution

Fresh mini character scenario: overall quality 8/10, character 9/10. Local-miss
handling and precise factual correction fail; earlier companionship/creative-image
failures do not recur. The matched full model passes 10/10 overall and character,
including correction despite an ASR discrepancy. One pair supports further full
model trials, not production substitution or a general reliability claim.

Grader controls classify 10/10 good/bad/adversarial candidates correctly, but extra
diagnostic tags can be wrong: invented history was labelled a private-context
leak without supplied private context. Calibration does not prove historical
grades correct. Provider buffer events support preamble timing, not physical
speaker delivery or complete delivery of cancelled speech.

Do not append broad prompt rules, filter speech with regex, silently switch
models or pool different prompts/rubrics/probes/routes. Owner listening,
held-out paraphrases and longer encounters remain unexecuted.
2026-10-14: production previously dropped some authored tool rules; all now
render, so the prompt changed and 10-13 scores no longer describe production.
The mini/full pair is n=1 (p = 0.5); rerun interleaved with repeats. Five
interleaved runs each: mini 37/50, full 48/50; mini measured preambles before the
local search in nearly every run, unchanged by two prompt wordings (reverted).

## 5. Chinese title and clarification reliability

Fresh capabilities QA passes 10/10 including the original Chinese folder title;
the earlier no-match failure remains. Once-only local title/alias/artist
clarification is implemented, but this sample did not need its repair branch.
Repeated title accuracy and spoken correction are not accepted. Keep actual asset
selection/playback receipts separate from ASR/query guesses. Evidence: `capabilities`
and earlier `capabilities-final`.
2026-10-14: an alias merely contained in the visitor sentence (often an artist)
now returns `media_discovery_weak` and asks instead of auto-playing.

## 6. Older interpreter errors

Older generic schema errors/timeouts do not recur in the fresh two-visit sample.
Bounded stage/HTTP/status/size/timing diagnostics now support a recurrence; there
is no justification to weaken consent/schema or extend the deadline. The earlier
oversized-envelope repair is distinct from these unknown causes.

## Deferred acceptance

Representative human microphone and voice acting; portrait TV; 24-hour TV-present
soak and ten conversations; T1–T5 power/cold boot; physical Flic/Karabiner;
packaging/signing. Published Raven has no production spells/scenes. These are
unexecuted acceptance boundaries, not new defects. See [TODO](../../TODO.md).
