# Magic Mirror — current handoff, 2026-10-31

## Current delivery

Runtime: **uncommitted working tree** on `field/macmini-deploy` over 45354fe, built
and running on the canonical Mac (build source `797e5bf2e796788f`, output
`caf5fdfb1b8df269`, 2026-10-31 16:19 Taipei). Owner review and commit pending.
[Audit and QA report](https://claude.ai/artifact/QPzGYwcT5HiRbhFSXNi7DV) ·
[prior handoff](docs/archive/progress-before-dance-floor-2026-10-30.md).

What changed (rulings in [DECISIONS](DECISIONS.md) 2026-10-31, product in [PRD](PRD.md)):

- Dance Floor: Console Stop/Stop All end Dance and return to Conversation; loop-wrap
  clock fix; beat-locked groove; "Ready to Party?" welcome; 90% default volume
  (saved setting updated); real-track movement QA (100% beat-locked, 4 ms median).
- Speakers: music plays on every external output with Bluetooth delay aligned to a
  185 ms floor (Jabra, Edifier M330 II, A1, TV in sync by ear); the Mac mini speaker
  is excluded. STOP/START/Dance/QA return the Jabra to 70% unmuted (its firmware
  mutes at step 0); START does it after the app owns the Jabra.
- Studio: conversation-started visits return to conversation; bounded cue retry;
  thank-you loop, language-after-switch, comment and sticker prompt fixes.
- Conversation: dropped-connection detection, idle timer after barge-in, identity
  question language and lead-in, self-introduction → identify, photo portrait stays
  create_image, default Traditional-Chinese hint.
- Console: two-Console save conflicts, Save & apply scope, unsaved editor refreshes,
  Models errors, tailnet developer controls blocked, rollback confirmation.
- QA harness: 16 stale unit tests repaired; Phase 4/Raven drivers updated; judge v9.

## Last observed runtime — not a live health guarantee

- Production restarted 16:24 Taipei: Dormant, wake listening, black cover cleared,
  Jabra 70% unmuted holding. TV ADB wake/standby still fails (known).
- Unit 2,907 passed / 1 skipped; typecheck clean. Final real-Electron Dance and
  MusicLoop QA passed on this build; earlier batch results are in the report.

## Next work / unresolved boundaries

1. Owner: review/commit; decide quality-judge gate vs rate (mini 40% / full 67%
   per-turn pass) and harness-review edits listed in the report.
2. Field: one STOP→START to confirm Jabra 70% unmuted; Dance in the room with all
   four speakers; real guests for Studio names/wake.
3. Open items in [TODO](TODO.md), including the audit follow-ups not fixed today.
