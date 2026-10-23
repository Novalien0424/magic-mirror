# Magic Mirror — current handoff, 2026-10-23

Branch `field/macmini-deploy`; uncommitted working changes based on `305c1bf`.
Interactive Studio repairs and the requested name-list control are built and
deployed in the canonical checkout. Normal LaunchAgent Main PID **30434**,
direct Console check at **10:45 Taipei**: Raven **v20**, **Up to date · 0 changed
areas**, original Conversation mode, Dormant with wake listening. Console is
on Avatars → Interactive Studio, focused on the empty name list. Default Gate
opening/four questions/one revision/farewell remain published; no synthetic
names or QA settings were written to production. No commit/push/phase promotion.

[Current repair, operator/name-list journey, failures, QA and cleanup](docs/testing/soul-studio-repair-2026-10-23.md) ·
[Original complete journey and self-review](docs/superpowers/specs/2026-10-22-soul-studio-journey.md) ·
[Earlier requested transcript/image sample](docs/testing/soul-studio-sample-2026-10-23.md) ·
[Original implementation QA](docs/testing/soul-studio-journey-2026-10-22.md).
[TODO](TODO.md) owns other open acceptance; [DECISIONS](DECISIONS.md) owns rulings.

## Delivered

- Name list is directly beside name confirmation. One correctly spelled name
  per line, up to 1,000 names/40 characters; Off, Suggest, or Only-listed mode.
  Existing per-avatar local storage and pronunciation/spelling matching are
  reused; only up to three candidates reach the model. A later visitor reply
  confirms; another spelling requires a new read-back. This grants no memory
  access. Save/Publish/reload/reset preservation and name-off validation work.
- Fixed app speech cancellation races with natural/cleared/joined playback.
  The previous `scene_dialogue_cancel_failed` did not recur in either new
  complete spoken visit; both generated two images and reached farewell/Dormant.
- Comments use a focused versioned prompt shared with Prompt Inspector,
  preserving character/voice/operator edits. Latest spoken run: four short
  comments, no extra questions. Fixed stage-reset scope and misleading success
  copy. QA waits for full reveal/offer playback and visible image opacity.
- Fixed duplicate revision announcements by using the native preamble when
  present and awaiting its processed tail. Handles step-before/after-tool-reply
  ordering. No-preamble requests keep the application cue.

## Fresh evidence and remaining boundary

- Final rendered Console journey: **23/23 passed**, exit 0, 17 screenshots;
  name entry/modes/validation, all prior authoring, publication, reload, reset,
  inspector, mode/skill controls and narrow layout. Relevant images reviewed.
- Live silence journey: **21/21 passed**, exit 0, 256.600 seconds. Real 30-second
  name/question/preference deadlines, pause, image, transfer/deferred printer,
  exact farewell, Dormant and release. Zero provider protocol errors.
- Focused final Main/adapter/name/UI checks: **232 passed**; subsequent name-off
  validation check: **18 passed**. Earlier focused prompt checks: 81 passed.
  Typecheck, final build/fingerprint and diff checks pass. No full suite rerun.
- Two fresh spoken provider runs both completed the journey but **failed one
  quality check each**: first comment brevity; bounded retry duplicate repaint
  announcement (two lines). The retry passed all four comment checks. Both
  failures remain recorded. The final repaint fix has deterministic playback
  coverage, **not another live provider pass**. Earlier revision captures were
  taken during fade-in; visible revised-image evidence remains open.
- Acceptance is therefore still open for one fresh authorized live revision
  check and its final image capture. No additional provider retry was silently
  substituted. Name lookup has Main/adapter and real operator-UI coverage;
  human microphone/pronunciation acceptance remains untested. Printing is the
  requested no-op adapter. Virtual PCM/WebRTC is not physical acoustic evidence.

## Restoration and cleanup

All seven task QA runs were reviewed, dry-run checked and removed with the
marker-aware cleaner: **590 files / 118,008,142 bytes** excluding markers.
Task scratch (39 entries) removed. Normal settings hashes remained unchanged;
final output volume/mute matched the captured state; input gain untouched.
The five previously requested deliverables remain under
`.artifacts/deliverables/soul-studio-2026-10-23/` (PNG, mirror screenshot,
readable/raw synthetic transcript, provenance). The prior Drive PNG upload
to AI_Stuff/AI_Avatar is unchanged. Other runs/assets/credentials were preserved.

Next action: operator may enter actual names and publish. Future live acceptance
should exercise listed-name confirmation, then verify exactly one revision
announcement and a fully visible revised soul. Keep the existing one-retry bound.

The earlier image-capability/camera transport handoff is retained in
[the archive](docs/archive/progress-before-soul-studio-2026-10-22.md);
intermittent USB camera reliability was outside this task.
