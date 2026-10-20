# Persona spell behavior and video fades — 2026-09-15

## Root cause and requested behavior

The prior application prompt explicitly instructed the character to explain how
to cast and quote the correct command. That coaching rule was an implementation
mistake: it conflicted with the requested immersive persona. Metadata from the
operator's 17:27 Asia/Taipei retest includes three exact-match rejections and an
accepted spell at 17:27:43. Logs cannot recover the avatar's words because actual
transcripts remain RAM-only. The user report and the old prompt identify the
coaching cause; the accepted event separately demonstrates matching worked on
one attempt.

The conversational prompt now contains short, consistent rules: stay in persona,
never reveal or correct spells, leave prefixed incantations to the application,
and speak an application performance cue exactly. The hidden spell catalog stays
in the exact matcher and transcription hints. Correct matches request only
`施放咒語`; scene dispatch waits for output start and processed playback completion.
Interruption, unavailable output, timeout, teardown or session replacement cannot
release the pending skill. Ordinary non-control conversation retains its existing
path. This adds no fuzzy matching or model authority over scene execution.

The approach follows the [official Realtime prompting guide](https://cdn.openai.com/API/docs/realtime-prompting-guide.pdf): short bullets, precise wording and removal of conflicting instructions, followed by actual model checks.

## Persistent guidance

- User skill: `C:/Users/b8901/.codex/skills/roleplay-control-prompts/SKILL.md`.
- Personal harness: `C:/Users/b8901/.codex/AGENTS.md` routes hidden-command character work to that skill.
- Repository reference: `.agents/skills/mm-realtime-voice/references/prompt-controls.md` records the application-specific behavior and playback boundary.

The reusable skill distinguishes persona dialogue, transcription hints and
application authorization. It forbids inventing coaching/confirmation behavior
and requires evidence appropriate to the failing boundary. Skill validation and
the harness link check passed. These instructions guide future sessions; they
are not a claim that model behavior can never deviate.

## Validation

Focused prompt, command, announcement and session-adapter tests: 49 tests / 5
files passed. Runtime ownership, playback completion and voice-effects regression:
45 tests / 4 files passed. Scene config, Console IPC, Mirror projection and boot
IPC checks: 121 tests / 4 files passed. Fade implementation focused checks:
65 passed (overlaps the above; do not sum). All commands exited 0.

`npm run typecheck:web`, scoped Node typecheck (191 files), `npm run build`,
runner syntax and diff whitespace checks passed. Full `npm run typecheck:node`
retains only pre-existing TS7016 in `tests/unit/qa-artifacts.test.ts` for the
missing declaration of `scripts/qa-artifacts.mjs`; the scoped check excludes it.

- `node scripts/run-phase4-qa.mjs --spells-live`: exit 0, 3 checks. Real provider
  reply to a synthetic help request passed the no-coaching comparison. The
  accepted synthetic transcript produced exactly the prefix, output playback
  stopped before scene start, the scene completed once, and duplicate input was
  rejected. [Artifacts](../../.artifacts/phase4-qa/2026-09-15T09-52-46-260Z/).
- `node scripts/run-phase4-qa.mjs --video-fades`: exit 0, 10 checks, 6 screenshots.
  Real Console imported embedded-audio video, authored 800 ms in/out, saved and
  published, then played the scene. 151 browser samples showed intermediate
  opacity and video GainNode values during both fades. [Artifacts](../../.artifacts/phase4-qa/2026-09-15T09-53-51-811Z/).
  Fade controls and portrait start/return screenshots inspected; controls are
  visible, and the avatar remains properly framed during the transition/return.

The live check uses synthetic text and provider output events, not microphone
speech. No-coaching comparison is a bounded regression case, not a guarantee
against all model deviations. Physical speakers, room acoustics and human wake
accuracy remain operator checks. No phase promotion.

## Video and audio behavior

Console → Avatars → Spells & scenes → video action exposes **Fade in ms** and
**Fade out ms**. Each accepts 0–10000; 0 preserves immediate legacy playback.
Changes follow Save → Check → Publish. The current operator settings are
preserved; the QA's 800 ms values belong only to its isolated fixtures.

| Event | Picture and embedded video sound |
|---|---|
| Video starts | Opacity and its own gain rise over Fade in ms. |
| One-shot approaches end | Playback position starts the final fade; media releases after it. |
| Explicit stop | Configured fade-out, then release. |
| Replacement / disposal | Immediate release; old timers cannot detach or change new media. |
| BGM stopped | Only BGM's owner changes; video fades use their separate gain. |

CSS initial style is resolved before transition, and a fade-in cleanup timer
cannot truncate an overlapping ending fade. Media position is rechecked so a
stall before the ending interval does not prematurely start the fade.
