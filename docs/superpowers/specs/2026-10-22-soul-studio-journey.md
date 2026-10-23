# Gate thirty-three — Interactive Studio journey

Owner request and clarification: 2026-10-22. Written before implementation.
This is the implementation and QA contract for the new guided Studio visit.
No phase promotion, new provider/model, printer hardware, or new credential route.

## Complete user journey

1. **Operator setup.** Select an Avatar, enable its Image generation skill, and
   open Interactive Studio. The opening, name question, farewell, question text,
   question count/order, art direction, comments and failure/offer guidance remain editable through
   the existing Save/Publish UI. Keep 1–8 questions; do not create a flow editor.
   Apply the requested content to Raven without replacing unrelated Avatar edits.
2. **Entry.** Studio mode uses the existing Studio wake phrase and starts the
   opening after wake. A visitor may also request Studio from Conversation when
   enabled. Existing image-skill authorization and optional photo consent remain.
3. **Opening.** Speak the configured opening (a one-second pause separates the
   opening from the separate name question):

   「歡迎來到Gate thirty-three. 在這連結現實與虛幻的地方，唯有捨棄你的肉身，吾才能引渡你前往下一個世界」

   Then: 「準備好的話就告訴我你的名字」.
4. **Name.** Start a 30-second silence deadline after the question's actual
   playback finishes. A supplied name is displayed and read back. Only a later
   visitor reply can confirm it. A denial clears it and asks for the name again;
   a corrected name receives another read-back. A 30-second silent name or
   confirmation step adopts 「無名之人」, without treating it as identity, and
   proceeds. Visitor speech cancels the silence deadline; it never interrupts
   someone who is answering. A fresh silent wait starts after a repeated prompt.
5. **Questions.** Address the confirmed/fallback name (for example
   「王曉明啊，…」 or 「無名之人啊，…」), then ask the configured question. The
   defaults, in order, are:

   1. 「你的靈魂唯有轉換成為度界之獸，才能進入這個Gate thirty three, 現在讓我們來嘗試描繪你的靈魂吧。說說看最近這一年裡面，有哪一個時刻最讓你印象深刻 為什麼?」
   2. 「很好- 那麼說說看是否曾經有哪一件事情，讓你覺得 這就是我啊 這就是我會做的事情。」
   3. 「很好 -那麼說說看，現在的你有什麼事情是覺得兩件都想要，但是卻很難同時做到的事情?」
   4. 「很好 -那麼說說看，如果可以的話 你希望生活裡多一點什麼?」

   For a spoken answer, give one or two short, grounded, in-character sentences
   about that answer, then ask the next question without waiting for a reply to
   the comment. Do not invent biography or start an extra follow-up exchange.
   Each question has the same 30-second silence deadline after playback. On
   timeout, record exactly 「未回答」, say exactly 「不回答 也是一種回答」, and
   continue. This is the owner's explicit clarification, not an inferred answer.
6. **Painting.** After the final answer's comment (or silence acknowledgment),
   speak 「現在 讓我們來嘗試描繪你靈魂的形狀」. Only after that playback completes,
   request the image. Interpret the answers symbolically as one imaginary soul
   creature; never invent a personal answer for 「未回答」. While generation runs,
   ask 「你自己覺得 你的靈魂會是什麼形狀?」 and allow conversation.
7. **Reveal takes priority.** As soon as the image is ready, cancel ongoing
   painting chatter and clear its audible output; do not wait for it to finish.
   Show the soul and say 「讓我們來看看描繪出來的靈魂形狀」. Then ask
   「看看你的靈魂形狀 還喜歡嗎? 還是你覺得有哪邊不像 想要做更多想像的」.
   A visitor can accept it or request one revision (default). Keep the existing
   bounded revision setting, and never let a model finish/change a reveal before
   a visitor has had a turn. With no revision left, proceed after the final reveal.
   A silent preference question also times out after 30 seconds: acknowledge
   「不回答 也是一種回答」 and keep the current picture.
8. **Revision.** Apply the visitor's change to the existing soul. Preserve it if
   the revision fails. A completed revision interrupts painting chatter and uses
   the same reveal cue, then moves to the final phase once changes are exhausted.
9. **Transfer.** Speak 「現在讓我們把你的靈魂傳遞出去」. After actual playback,
   invoke the Main-owned printer skill adapter exactly once with the current
   RAM image. It is deliberately a no-op/deferred adapter today: no printer,
   spool file, archive, download, QR, or claim of successful physical printing.
   Failure/deferred status is metadata-only and cannot block the farewell.
10. **Farewell.** Speak the configurable Studio farewell, default
    「願你的靈魂順利穿越」, then return to Dormant and restore wake ownership.
    The picture remains during transfer and disappears at completion. This new
    ending replaces the old timed phone-photo hold and applies to completed
    Studio visits, including visitor-requested entry. An explicit early Studio
    exit still returns to conversation. Sleep/cancel/session replacement aborts
    timers, queued speech and image work, and removes transient Studio history.

## Pauses and pronunciation research

Official OpenAI documentation was searched and opened on 2026-10-22:

- [Realtime voice prompting](https://developers.openai.com/api/docs/guides/voice-prompting)
  documents delivery/pacing instructions and reference pronunciations. It does
  not establish an exact-duration SSML break contract for this integration.
- [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
  documents response cancellation and WebRTC output-buffer clearing.

Implementation inference: use the existing speaking-style field for natural
conversation pacing and pronunciation examples (e.g. pronounce Gate thirty-three
in English, pause briefly between ideas). Do not promise exact pauses in freely
generated speech. Add explicit `[pause=1s]` syntax to operator-authored fixed
speech, including Conversation greeting/farewell and Studio opening/questions/
farewell. Parse only authored scripts, never regex-rewrite generated dialogue.
Split into speech segments, wait for actual processed playback completion, then
wait the requested silence before sending the next segment. Timing includes
provider/network latency beyond that minimum silence. Cancellation owns every
segment and gap. Add inline help/examples and a preview through existing controls.
No new TTS service, SSML dependency, voice model, or runtime model change.

## Implementation analysis

- Reuse existing Studio config/editor and immutable session snapshots. New
  defaults do not silently overwrite every saved Avatar. Apply Raven's requested
  content through the operator workflow and preserve any unsaved draft first.
- Main owns a numbered current step, the 30-second timer, answer/name state,
  image generation and the printer adapter. Renderer reports a matching step's
  actual spoken completion and visitor speech; stale step/session signals cannot
  arm or fire a later step. Timer defaults are application decisions, not tools
  the model can invoke to invent answers.
- Application-owned speech supplies the exact questions and transition lines.
  The model records the visitor answer and supplies the short comment; a
  completion callback advances to the next scripted question without another
  visitor turn. No speech filters. Prompt text belongs in versioned catalogs.
- Name denial needs an explicit native tool path, distinct from a correction.
  Preserve the later-turn read-back guard and guest-list privacy.
- Reuse the existing processed-audio interruption and completion owner for
  pauses, reveal preemption and speech-before-printer ordering. Preserve one mic
  owner and the current sleep/farewell lifecycle.
- Extend the existing keepsake sink as a named no-op printer adapter. Keep old
  persisted hold fields readable for compatibility, but do not expose an inactive
  hold control or wait 45 seconds in the new ending.
- Preserve image capability checks, consent, RAM-only images/transcripts,
  Studio extraction exclusion, session cleanup and metadata-only diagnostics.

## Pre-implementation self-review

Reviewed the plan against all ten requested stages and invariants 1–12 before
source implementation. Corrections made during this review:

1. A timer started when a question is requested would consume the visitor's
   time while Raven speaks. Start it only after actual playback and output tail.
2. Prompt-only pauses, deadlines, automatic progression and interruption are
   insufficient. Application code owns those boundaries; prompts own comments.
3. A confirmation denial must return to the name question, not merely repeat
   the rejected name. A timeout must not confirm an unaccepted name.
4. Long reflective questions/answers need schema and UI limits that fit their
   text; do not truncate a visitor's reason to the old 80-character answer cap.
5. The final answer still needs its short comment before the painting cue.
6. Ready images must cancel painting chatter, not join the old idle speech queue.
7. The transfer cue must finish before the printer adapter is invoked; a tool
   call or response generation completion alone is not playback evidence.
8. A stale timeout, paused segment or provider result must not advance a later
   visitor/session. Cleanup and duplicate handoff tests are required.
9. Preserve the previous image on revision failure and degrade without stopping
   unrelated conversation or waiting on future printer hardware.
10. Keep the editor simple: existing fields and a pause marker, no generic flow
    designer. Physical speech/likeness evidence cannot be inferred from virtual QA.

## QA journey and acceptance (defined before implementation)

- **UI authoring:** real rendered controls edit opening/pause marker, name line,
  all four questions, add/reorder/remove a fifth question, farewell, and stage
  text; Save/reload/Publish and prompt preview preserve values. Inspect screenshots.
- **Complete real-provider journey:** configured opening and name prompt; deny
  an initial name, supply a corrected name and confirm; four reflective answers;
  short answer comments followed by next questions without visitor follow-ups;
  painting cue then image request; waiting question/chatter; ready interrupts
  chatter; reveal/offer; one revision; transfer playback then one deferred printer
  call; exact farewell then Dormant, no Studio memory save or remaining images.
- **Silence journey:** real 30-second name timeout to 無名之人; silent story
  question records 未回答 and speaks the exact acknowledgment; subsequent
  question remains usable; silent reveal accepts existing image and finishes.
  Cover confirmation timeout and all question positions with deterministic tests.
- **Pause evidence:** scripted marker not spoken, next segment begins only after
  previous actual playback plus requested gap; interrupt during a gap cancels
  remaining segments. Real-provider metadata measures the gap; physical acoustic
  timing stays a separate human check when the output is muted.
- **Focused behavioral tests:** timer arm/expiry/cancel/stale step, denied name,
  comment ordering, early/duplicate tools, image preemption, final-cue ordering,
  no-op/failing printer once, variable question counts, privacy cleanup and image
  permission regression. Typecheck/build and affected UI/session integration.
- **Runtime discipline:** preserve operator draft and capture current runtime
  before stopping normal Electron for isolated QA. Never overlap normal Electron,
  Electron QA or full npm test. Capture volume/mute, test at minimum output while
  preserving mute/input gain, and restore in guaranteed cleanup. Retain failures;
  external/flaky runs get at most one retry. Restore the normal app afterward.
- Record exact commands/exits/case counts and metadata-only evidence in the QA
  report. No visitor transcripts, audio, private context, credentials or portraits
  in diagnostics; synthetic UI screenshots stay scoped to the fixture.

## Implementation review after live evidence

Two real-provider samples missed a required recording tool despite correct audio
delivery. The resulting repair requires a native tool decision during name,
confirmation, story-question and image-preference turns; a repeat-question tool
allows clarification without inventing an answer. Painting remains conversational.
Application speech explicitly disables tools. This enforces the handoff in the
protocol instead of relying only on phrasing. See the [QA record](../../testing/soul-studio-journey-2026-10-22.md)
for failures, the retry boundary and final verification status.
