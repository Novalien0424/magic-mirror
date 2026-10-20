# Avatar selection, editing identity and deletion — Windows, 2026-09-15

## Result

- Mirror has a published-avatar selector and explicit Activate avatar action. The current avatar is named prominently, with one active avatar at a time. Existing Main authorization, Dormant-only switching and unpublished/unsaved-draft guards remain enforced with visible reasons.
- Avatars has a full-width editing selector and named header above settings. The sidebar separately names EDITING NOW and ACTIVE ON MIRROR; each settings section identifies the edited avatar.
- Delete avatar opens a modal with a required checkbox, Confirm deletion, Cancel and Escape. Deletion removes only the selected draft profile and its disclosed resource locks; shared models/media remain. Save/check and Publish apply the deletion. Active and last remaining avatars cannot be deleted.
- No new IPC or persistence path was needed. Existing configuration transactions validate and publish the updated catalog. Operator configuration was not changed by QA.

## Changed files

- `src/renderer/console/ActiveAvatarPanel.tsx`, `DeleteAvatarDialog.tsx`, `avatar-management.ts`: selector, confirmation and bounded draft deletion.
- `src/renderer/console/App.tsx`, `styles.css`: integration and visible editing context.
- `tests/unit/avatar-management.test.ts`: active/last/stale guards and retained resources/other edits.
- `src/main/profile-console-qa.ts`: actual Windows selection, deletion confirmation and persistence checks.

## Verification

- `npx vitest run tests/unit/avatar-management.test.ts tests/unit/profile-workspace.test.ts tests/unit/console-config-models.test.ts tests/unit/console-config-ui.test.ts`: exit 0, **39 tests in 4 files**. The initial run caught missing React imports in the new components under the existing server-rendering test harness; corrected and rerun.
- `npm run typecheck:web`: exit 0.
- `npm run typecheck:node`: exit 1 solely for existing TS7016 at `tests/unit/qa-artifacts.test.ts:6` importing `scripts/qa-artifacts.mjs`; no new diagnostics.
- `npm run build`: exit 0.
- `git diff --check`: exit 0.
- `node scripts/run-phase4-qa.mjs --profiles`: exit 0, **30 checks, 29 screenshots**, including existing profile/voice behavior and the five new management cases. Artifact root: `.artifacts/phase4-qa/2026-09-15T12-44-51-701Z` (build provenance, evidence JSON, screenshots).

Reviewed `profile-mirror-active-selection.png`, `profile-editing-identity.png` and `profile-delete-confirmation.png`: names, selector, separate active/editing labels, checkbox and cancel/confirm controls are legible without clipping. The existing responsive matrix also checks 1440 and 1024 layouts. Confirmation remains disabled until checked; Escape and Cancel preserve the avatar; confirmed deletion remains draft-only until Save/Publish; reload verifies the published removal and unchanged active selection.

## Limits and runtime

Windows evidence only. No provider speech, physical sound, wake accuracy, hardware-adapter or phase-exit claims. The existing Node declaration issue remains separate maintenance. The user confirmed there were no unsaved edits before the normal dev app was stopped for application and QA. Normal dev is relaunched after QA; rebuild stamped output before future QA because dev overwrites `out/`.

At **20:46 Asia/Taipei**, normal dev session **69488** at `http://localhost:5173/` reported Main and both renderers ready, with Mirror shown. Left running for the user; Console shortcut is Ctrl+Shift+D.
