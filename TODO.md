# Open work

## Remaining verification / maintenance

- [ ] Operator test of the delivered Console Stop/Abort and automatic Save/check flow,
  including physical sound and live queued scene dialogue cancellation. See
  [delivery evidence](docs/testing/console-stop-save-check-2026-09-15.md).

- [ ] Operator retest: persona never teaches spells; `施放咒語，下雨` yields only
  `施放咒語` before the skill. Check physical sound, interruption and video fades.
- [ ] Measure per-phrase wake accuracy with representative approved positives
  and negatives, then separate validation samples. Reproduce first-boot wake
  failure; detector activation alone is not accuracy evidence.
- [ ] Resolve existing Node typecheck TS7016 for `scripts/qa-artifacts.mjs`
  in `tests/unit/qa-artifacts.test.ts` when maintenance is in scope.
- [ ] Complete remaining Phase 4 physical adapters, default/Raven sound/echo,
  operator media and long-run acceptance before phase exit. See the
  [Windows checklist](docs/testing/phase4-scene-media-windows-checklist.md).
- [ ] Revisit previously authorized profile QA artifact cleanup when requested
  for execution; prior tool-policy denials and exact paths remain in the
  [profile delivery record](docs/testing/profile-console-2026-09-09.md).

Keep only open items here; remove completed entries. Current runtime and evidence
belong in [PROGRESS](PROGRESS.md), durable rules in [AGENTS](AGENTS.md) and
[DECISIONS](DECISIONS.md).
