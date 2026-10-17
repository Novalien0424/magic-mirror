# Open work

Current reproduced failures and deferred acceptance: [unresolved issues](docs/testing/open-issues-2026-10-13.md).
The items below are additional open operator/maintenance checks.

## Owner acceptance (2026-10-17 delivery)

- [ ] Look through the compact Console on the portrait display with the TV mouse
  and note any placement or wording changes. See the
  [Console revamp evidence](docs/testing/console-ux-revamp-2026-10-17.md).
- [ ] Human Portrait Studio visit at the mirror (physical Jabra route). Scripted
  live visits pass; no human acceptance is claimed.

## Remaining verification / maintenance

- [ ] Owner wake check: say the wake phrase 10× with real loop media at the
  production Dormant level and 10× about 10 dB lower. See the
  [2026-10-14 review](docs/testing/review-fixes-2026-10-14.md).
- [ ] Camera hardware: the Arducam stalls below the app (99% invalid UVC
  payloads; minimal capture gets 0 frames). Try another cable/port or a powered
  hub, then five minutes in Photo Booth, then a known-good UVC webcam (a
  purchase needs owner approval).
- [ ] Live QA of the online search phrase (DECISIONS 2026-10-14): run
  `default_fallback`, `youtube_modes` and `local_scope` with mini, then say
  「在雲上找找」 plus a title through the real microphone.
- [ ] Operator test of the delivered Console Stop/Abort and automatic Save/check flow,
  including physical sound and live queued scene dialogue cancellation. See
  [delivery evidence](docs/testing/console-stop-save-check-2026-09-15.md).

- [ ] Operator retest: persona never teaches spells; `施放咒語，下雨` yields only
  `施放咒語` before the skill. Check physical sound, interruption and video fades.
- [ ] Measure per-phrase wake accuracy with representative approved positives
  and negatives, then separate validation samples. Reproduce first-boot wake
  failure; detector activation alone is not accuracy evidence.
- [ ] Complete remaining Phase 4 physical adapters, default/Raven sound/echo,
  operator media and long-run acceptance before phase exit. See the
  [Windows checklist](docs/testing/phase4-scene-media-windows-checklist.md).
- [ ] Revisit previously authorized profile QA artifact cleanup when requested
  for execution; prior tool-policy denials and exact paths remain in the
  [profile delivery record](docs/testing/profile-console-2026-09-09.md).

Keep only open items here; remove completed entries. Current runtime and evidence
belong in [PROGRESS](PROGRESS.md), durable rules in [AGENTS](AGENTS.md) and
[DECISIONS](DECISIONS.md).
