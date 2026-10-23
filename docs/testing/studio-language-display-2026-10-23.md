# Studio language and display journey — 2026-10-23

Requested journey, reviewed before the language implementation:

1. The operator keeps the published opening, configurable name question, name
   list, question count/content, image options and farewell. Removed caption
   controls must not imply that invisible captions can still be configured.
2. A new visit starts in Traditional Chinese. An English name or complete English
   answer does not switch the reply language. Name confirmation displays only
   the proposed name; denial and correction still return to confirmation.
3. The confirmed (or timeout fallback) name prefixes question one only. Later
   questions and all comments continue without repeatedly addressing the name.
4. A visitor explicitly requesting English or Chinese changes the selected reply
   language. The current question is repeated using its existing bilingual script,
   without consuming an answer. Unsupported languages do not change the selection.
5. Questions, answers, painting captions, change instructions and countdowns never
   appear as text on the Mirror. Progress graphics and artwork remain. The exact
   visitor name can appear at confirmation and on the finished artwork.
6. Existing silence, image revision, deferred printer and farewell ordering remain.
   Default settings are restored after isolated QA; only owned artifacts are cleaned.

Self-review: language must have an explicit application action rather than being
inferred from answer text or a tool's language hint. Main owns that selection for
Studio; versioned prompts own interpreting the visitor's explicit request. No
speech regex/filter, new language service, schema migration or new operator toggle
is needed. Stored legacy screen text remains readable for compatibility but is no
longer a visible control or rendered caption. Verify real controls and rendered
phases separately from synthetic-provider speech; do not claim human-mic evidence.

Implementation follows that flow. The versioned tool catalog now exposes the
explicit Chinese/English action. Ordinary ASR and name/answer language hints no
longer select a reply language; Main repeats the current bilingual question and
keeps its answer index. The shared conversation/image paths retain the explicit
selection too. The obsolete caption editor is removed; stored data stays compatible.

Fresh verification:

- Focused Studio/Main/adapter/catalog/prompt/Mirror/editor tests: **197 passed**;
  affected conversation adapter and memory-dialogue tests: **132 passed**. Node
  and web typecheck, production build and fingerprint verification passed.
- `node scripts/run-phase4-qa.mjs --studio-journey`: **23/23 passed**, exit 0,
  17 screenshots. Run `2026-10-23T08-17-08-439Z`. Real rendered authoring,
  validation, name list, Save/Publish/reload/reset, inspector and narrow layout
  passed; removed caption controls are absent and policy help is visible.
- `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
  portrait_studio --studio-story soul_language`: **27/27 passed**, exit 0,
  353.473 seconds, 8 screenshots. Run `2026-10-23T08-17-34-520Z`.
  Four answers, explicit English then Chinese switches without consuming answers,
  22 spoken lines with **zero language mismatches**, name only before question one,
  four short comments without questions, image/preference/revision, deferred printer,
  verbatim farewell and Dormant/release passed. Zero protocol errors.
- Two 1254×1254 PNGs; generation 42.750 s, revision 47.184 s. Exactly **one**
  repaint announcement. Reviewed confirmation, question/English-switch and revised
  image screenshots: only the exact name is text; revised soul is fully visible.
  This closes the preceding live-revision and fade-capture evidence gaps. Earlier
  failed attempts remain in the preceding repair report; they are not relabelled.
- Synthetic PCM/WebRTC with real providers proves integration, not a human
  microphone or physical-acoustic pass. No transcript retained. QA output was
  reduced to minimum and restored by a guaranteed guard. Input gain was untouched.

Initial local checks correctly failed three obsolete/new expectations (old
automatic-English startup, positional first tool and spaced English-name readback),
then ten catalog tests with positional fixtures/missing new mock handler. These
were repaired; the final runs above passed. The first typecheck caught the missing
metadata reason and was repaired. The first QA guard could not boot out an already
absent LaunchAgent (exit 3); it restored audio/config, confirmed Electron absent,
then the corrected guard completed one Console run and one provider run. No
provider retry was needed.
Full local failure output is retained in
[the failure log](studio-language-local-failures-2026-10-23.txt).

Build: 2026-10-23 16:15:29 Taipei, source
`7b796ad8071d9c043904eeddb84cbe78109670febfe5dbeef594039bd807f6ee`, output
`e688dd12862d8a59a0761b58edf8cb738e862774a573934e7d94b84f2e003089`.
Published, draft and previous config hashes remained unchanged. A saved operator
draft awaiting publication and Interactive Studio/Loop Video state were found
before QA and preserved. No synthetic configuration was published to production.

Cleanup: both exact owned run IDs are reviewed under this report and removed with
the marker-aware cleaner after dry-run inspection. Existing requested soul
deliverables and the prior Drive upload remain untouched.
