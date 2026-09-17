# Avatar CRUD audit — Windows, 2026-09-15

## Changes

- New and Duplicate open Persona and select the name field for immediate keyboard editing. The editing header tracks that name; switching profiles and saving/reloading retain the rename.
- Confirm deletion now removes the inactive avatar from both saved draft and published catalogs in a Main-owned transaction. No extra Save/Publish is required for deletion. Other saved and unfinished edits remain intact; shared models, media and reusable actions are retained. The deleted avatar's resource access locks are removed as disclosed in the dialog.
- The dialog uses one explicit confirmation, with Cancel initially focused and Escape supported. Cancel and confirmation are disabled during the write; failures stay visible in the dialog. Active/last-avatar protection remains in both Main and the editor.
- Mirror excludes profiles already removed by older versions from the saved draft. It always identifies the actual active avatar. Selecting that avatar explains that it is already active, even when unrelated edits await publication.
- Persona text fields stay editable while Save/check processes its captured snapshot. Conflicting saves, overlapping mutations and switching during a conversation remain guarded. The existing activation path must still require a saved/published draft because it uses that draft to switch; removing this check alone would overwrite edits.

## Implementation boundaries

Persistence and transaction compensation: `src/main/config-service.ts`.
Console authorization, serialization and bridge: `src/main/console-config.ts`,
`console-data.ts`, `ipc.ts`, `src/preload/console.ts`, `src/shared/bridge.ts`.
Editor state and feedback: `src/renderer/console/App.tsx`,
`AvatarCharacterEditor.tsx`, `DeleteAvatarDialog.tsx`, `ActiveAvatarPanel.tsx`,
`avatar-management.ts`, `profile-workspace.ts`.
Focused regressions live in the corresponding unit tests and
`src/main/profile-console-qa.ts`.

The existing Previous slot remains a rollback snapshot when published configuration changes. Deletion does not erase that backup or delete shared asset files. No visitor data, credentials, dependency changes or phase promotion are involved.

## Verification

- Initial UI regression failed at `profile_duplicate_opens_name`: Duplicate from Appearance did not open an editable name field. Preserved artifact: [initial failure](../../.artifacts/phase4-qa/2026-09-15T13-04-25-693Z).
- Transaction tests first failed because the immediate deletion operation did not exist; now verify removal, other-draft retention, active protection and restoration of all slots after a simulated write failure.
- Final focused command: `npx vitest run tests/unit/avatar-management.test.ts tests/unit/profile-workspace.test.ts tests/unit/console-config-models.test.ts tests/unit/console-config-ui.test.ts tests/unit/config-service.test.ts tests/unit/console-ipc.test.ts tests/unit/boot-ipc.test.ts tests/unit/realtime-privacy-cleanup.test.ts` — exit 0, **173 tests, 8 files**.
- `npm run typecheck:web`, `npm run build`, `git diff --check` — exit 0.
- `npm run typecheck:node` — exit 1 solely for pre-existing TS7016 at `tests/unit/qa-artifacts.test.ts:6` importing `scripts/qa-artifacts.mjs`.
- First corrected Windows UI run: [31 checks, 29 screenshots](../../.artifacts/phase4-qa/2026-09-15T13-14-19-367Z), runner exit 0. Covers actual keyboard rename, save/reload, independent profiles, one-at-a-time activation, confirmation/Cancel/Escape, immediate deletion, retained unfinished edits, and no reappearance after reload. Screenshot review found misleading activation-reason priority, then corrected with a unit regression.
- An intermediate rerun [exited without a QA result](../../.artifacts/phase4-qa/2026-09-15T13-17-14-721Z), runner exit 2, after voice QA. Inferred race: reload was requested before refreshed saved state cleared the unsaved guard. The harness now waits for clean saved UI state before reload; it does not bypass the preservation guard.

Final UI run: `node scripts/run-phase4-qa.mjs --profiles` — **exit 0, 31 checks, 29 screenshots**, one pass result and no timeout. [Final artifacts](../../.artifacts/phase4-qa/2026-09-15T13-20-47-567Z) include the stamped build and evidence. Reviewed the final deleted-avatar screenshot: the current avatar remains identified, its action says “Already on the Mirror,” and the removed profile stays absent. The test suite covers 1440×900 and 1024×768 layouts.

## Scope and limits

This supersedes the draft-only deletion behavior in the [previous delivery](avatar-management-2026-09-15.md). Tests use isolated synthetic userData and the canonical Windows Electron executable. They do not mutate operator profiles or establish physical sound, provider speech, wake accuracy, Mac behavior or phase acceptance. The native Computer Use connection was unavailable; production Console controls/IPC and Electron keyboard events were exercised by the repository QA harness. The user explicitly confirmed edits were saved and authorized restarting the normal Console.

## Operator handoff

Normal `npm run dev` session **2667**, `http://localhost:5173/`, was relaunched from the canonical checkout at approximately **21:23 Asia/Taipei**. Main and both renderers reported ready; Mirror was shown. Left running for operator testing. Open Console with Ctrl+Shift+D. Development output replaces stamped QA output; rebuild before any future QA run.
