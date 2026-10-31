# Magic Mirror — current handoff, 2026-10-31

## Current delivery

Runtime: `field/macmini-deploy`, audit fixes committed as f338c9d and pushed; the
all-speakers and quality-rate follow-up is committed on top. Built and running on
the canonical Mac (production restarted 17:07 Taipei).
[Audit and QA report](https://claude.ai/artifact/QPzGYwcT5HiRbhFSXNi7DV) ·
[prior handoff](docs/archive/progress-before-dance-floor-2026-10-30.md).

What changed (rulings in [DECISIONS](DECISIONS.md) 2026-10-31, product in [PRD](PRD.md)):

- Dance Floor: Console Stop/Stop All end Dance and return to Conversation; loop-wrap
  clock fix; beat-locked groove; "Ready to Party?" welcome; 90% default volume;
  real-track movement QA (100% beat-locked, 4 ms median).
- Speakers: every music source (MusicLoop, Dance, conversation music, operator
  loop, YouTube) plays on every external output, Bluetooth aligned to a 185 ms
  floor; the Mac mini speaker is excluded. Main publishes "Magic Mirror Speakers"
  (`music-loop --shared-output`), audio-prefer makes it the default output while
  the app runs; voice/cues are pinned to the microphone's speakerphone (Jabra) and
  embedded local-video audio stays there. STOP/START/Dance/QA return the Jabra to
  70% unmuted.
- Studio: conversation-started visits return to conversation; bounded cue retry;
  thank-you loop, language-after-switch, comment and sticker prompt fixes.
- Conversation: dropped-connection detection, idle timer after barge-in, identity
  question language and lead-in, self-introduction → identify, photo portrait stays
  create_image, default Traditional-Chinese hint.
- Console: two-Console save conflicts, Save & apply scope, unsaved editor refreshes,
  Models errors, tailnet developer controls blocked, rollback confirmation.
- QA: reply-quality and barge-in judges report rates only; tool use, effects,
  privacy and cues stay hard gates. `raven-quality-rates.mjs` compares with the v9
  baseline (`resources/testing/raven-quality-baseline.v1.json`).

## Last observed runtime — not a live health guarantee

- 17:07 Taipei: START passed (app started, Jabra 70% unmuted read back; TV ADB
  still fails, known). `MUSIC_OUTPUT music_output_shared_ready outputs=4
  wireless=2`; default output = Magic Mirror Speakers, alerts and input = Jabra.
- Routing QA on this build (outputs at 1%): `--active-bgm`, `--media-skill`,
  `--operator-loop` and `run-youtube-qa.mjs --audible` passed; a CoreAudio watcher
  showed TV, Edifier, Jabra and A1 running together for music and Jabra alone for
  voice. Moving the default away left only the Jabra stream (voice pin holds).
- Unit + renderer: all pass except `phase4-qa-runner` mode checks, which refuse
  while production Electron runs (`electron_already_running`); typecheck clean.

## Next work / unresolved boundaries

1. Field: listen to conversation music and YouTube on all four speakers; check
   voice Stop and guest turns while music plays (other speakers are not
   echo-cancelled by the Jabra). Dance in the room; real guests for Studio/wake.
2. Owner: mini vs full dialogue model (quality rate below target); harness-review
   edits listed in the report; whether to delete retained QA artifacts.
3. Open items in [TODO](TODO.md), including the audit follow-ups not fixed today.
