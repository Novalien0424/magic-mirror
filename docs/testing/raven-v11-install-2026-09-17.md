# Raven V11 local installation — Windows, 2026-09-17

Source: [PR #1](https://github.com/Novalien0424/magic-mirror/pull/1), head
`71246556bb3670fb1bf06d3df021b278e9c0fa73`.

The 29 asset, renderer, test and skill files were applied locally; the remote
PROGRESS addition was replaced by this current Windows installation record.
The existing Console changes were preserved when applying its three text edits.
No remote merge, push, dependency change or phase promotion was performed.
V10 remains unchanged. V11 reuses its MOC/atlas and adds a versioned performance
profile; it is not a newly authored rig or replacement artwork.

## Static and focused checks

- 50 tests: Raven performance (actual vendored SDK), Cubism preview and framing.
- 19 tests: native bundle validation, managed import and avatar model source.
- `npm run typecheck:web`: exit 0.
- Node typecheck: exit 1 only for the pre-existing TS7016 missing declaration
  at `tests/unit/qa-artifacts.test.ts:6` for `scripts/qa-artifacts.mjs`.
- `npm run build`: exit 0, rebuilt after the Windows harness adjustment.
- Avatar-studio bundle validator: exit 0, 17 files, seven groups, five expressions.
- 28 non-overlapping files match PR bytes (allowing checkout line endings).
- Repository and installed avatar skills: validator exit 0; installed reference
  links resolve. The repo validator needed Python UTF-8 mode on this host.
- V10 diff against PR base: empty.

Manifest: `resources/avatar/Raven/v11/runtime/raven-lord.model3.json`.
SHA-256: `b1510464205e8688a8fdf6e0e75bc22ac20e339134406ce401a3b9009d5a9857`.

## Windows evidence

Before stopping the normal app, Console showed Dormant, Raven active, published
version 19 and Up to date. No unsaved edits were present.

The first isolated run at `.artifacts/phase4-qa/2026-09-16T23-04-01-263Z`
was interrupted after inspection found an obsolete harness expectation that
Waking must loop. It is incomplete evidence, not a product pass or failure.
The updated harness reads the explicit manifest profile, checks the selected
clip remains active and verifies V11's finite endpoint stays unchanged for
another 3.5 seconds after its initial 6.5-second wait.

Final isolated run: `.artifacts/phase4-qa/2026-09-16T23-06-26-917Z`,
`MIRROR_CUBISM_QA_MODEL` set to the V11 manifest and
`npm run test:phase4:qa:cubism`: exit 0, 227 checks, 22 motion controls,
15 expressions, eight captures. This includes built-in Ren, managed Ren and
V11, finite pose hold, reset/cancellation, every parameter range and unchanged
synthetic configuration. These captures show mostly the library controls due
to scroll position; they do not establish the avatar's appearance alone.

Normal Console native Browse/import completed after restarting development
session **47300** from the canonical checkout, with no concurrent QA runtime.
Library label saved as **Raven · v11**. Managed asset ID:
`model-3249b785-d88b-465c-b4e3-600f00c3052c`.
All 17 imported runtime files match the repository V11 bytes, including the
versioned performance metadata. Published configuration remains v19, Up to date;
the existing Raven profile and live rig assignment were not republished.

The normal Console preview was scrolled into view and directly inspected:
Raven's portrait, clothing and beak render; Dormant closes the visible eye.
Current visual evidence is under `.artifacts/raven-v11-install-2026-09-17/`.
This establishes installed Console display, not physical output-audio timing,
prolonged motion quality, live Mirror V11 acceptance or artistic approval.

## Skills

Applied the PR's repository `mm-live2d-avatar` performance-audit reference.
Updated the installed `magic-mirror-avatar-studio` router and added performance
ownership guidance. Corrected prior blanket prohibitions on authored eyelids
and the universal 0.8 mouth blend: ownership and replacement weight now follow
the explicit model profile. AI references remain separate from rig exports;
numerical checks remain separate from current render and artistic acceptance.
