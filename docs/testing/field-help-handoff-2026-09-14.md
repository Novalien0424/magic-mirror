# Field help — paused handoff, 2026-09-14

## Request and authorization

Add explanatory tooltips to every input field and dropdown throughout the Magic Mirror Console, including sliders, checkboxes, textareas, dynamic rig parameters and conditional scene fields. Explain meaning, choices, units, limits and application timing in plain language. The operator asked to research best practice and implement, then requested clock-out and continuation in a new session. Do not continue implementation until that session.

The operator explicitly said “discard all changes” in reply to the failed Console save (`avatarCatalog: invalid_avatar_catalog`). This meant the unsaved Console draft, including Raven, not Git/source changes. The development session was stopped after that authorization. No new permission is needed for that discarded draft. Check for newly opened sessions and new unsaved edits before a future reload.

## Preserved work

Canonical checkout: `C:/Project/magic-mirror`, main, HEAD `3b20c81`. Existing dirty audio-volume implementation and harness/document edits remain intact; no commit or phase promotion.

Tooltip work lives only in detached worktree `C:/Project/magic-mirror/.worktrees/field-help`, based on the same HEAD. Its tracked modifications are a copy of the canonical audio baseline, applied from `.worktrees/field-help-base.patch`; do not mistake these for new tooltip changes or overwrite newer canonical work with them. Its node_modules junction points to canonical node_modules. Never run Electron from this worktree.

New files in that worktree:

- `src/renderer/console/HelpField.tsx`: reusable label wrapper, separate accessible help trigger, merged aria-describedby, body portal, viewport positioning, delayed hover, focus, click/tap pinning, Escape and outside dismissal. The trigger uses a keyboard-operable span with role=button to remain usable inside disabled fieldsets. Needs interaction QA and styles.
- `src/renderer/console/field-help-text.ts`: field-specific explanation catalog, effect-key mapping and dynamic Cubism parameter help. Review claims against actual ranges and behavior while integrating.
- `tests/unit/field-help.test.ts`: SSR description/label checks, disabled-fieldset help accessibility and viewport placement.

Latest focused result before clock-out: `npx vitest run tests/unit/field-help.test.ts` in the worktree, exit 0, 3 tests passed. No integrated UI, build or interaction verification yet. No product component has been wrapped, and tooltip CSS has not been added.

## Design and sources

Keep the visible field label and essential instructions. Place a visible question-mark help control beside each field. Explanations open on hover, keyboard focus and click/tap; remain readable while hovered; dismiss with Escape without moving focus. Keep tooltip content noninteractive and connect both field and help trigger to its description. Render outside scrolling panels to avoid clipping.

- WCAG 2.2 hover/focus requirements: https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
- WAI-ARIA tooltip pattern (work in progress, not a finalized normative pattern): https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/
- GOV.UK select hints and descriptions: https://design-system.service.gov.uk/components/select/

## Next implementation steps

1. Compare canonical and worktree changes before transfer. Copy only the three new tooltip files into canonical, or finish implementation in the worktree and transfer a tooltip-only patch. Preserve existing edits.
2. Add HelpField wrappers and explanation imports throughout `App.tsx`, `AvatarCharacterEditor.tsx`, `PresentationEditor.tsx`, `VoiceStudio.tsx`, `CubismStudio.tsx`, `ResourceAccess.tsx`, `SceneActionFields.tsx` and `SceneComposer.tsx`. Inventory all input/select/textarea elements with rg, including conditionals and inputs outside labels. Do not wrap non-input waveform/wake meters.
3. VoiceStudio needs help on its hidden local-file input and visible chooser label; CubismStudio parameter ranges need dynamic explanations. Remove redundant native title help on Editing avatar and trigger fields when custom help replaces it.
4. Add CSS for the wrapper grid, 44px help target, checkbox label layout, keyboard focus and fixed contrast tooltip. Existing direct-child label rules in form grids, scene spell rows and Cubism toolbar may need narrow adjustments to accommodate wrappers. Retain responsive layouts.
5. Add rendered coverage checks that every configuration control has a resolvable substantive description, covering scene action kinds/commands and dynamic fields. Verify hover delay, keyboard focus, Escape, click/tap pinning, movement into popup, outside dismissal, disabled fieldsets and viewport bounds in real Windows Electron.
6. Use mm-ui-qa and its current runbook. Build and run Electron only from canonical. No overlap normal Electron and QA. Existing persistent Private TCP/UDP firewall rules were verified exact against canonical electron.exe this session; recheck only if installation/path changes or actual lookup fails.
7. Focused tests/typecheck, final diff review and narrow Electron screenshots/interactions should precede a completion claim. Full Node typecheck previously has an existing TS7016 failure for tests/unit/qa-artifacts.test.ts importing scripts/qa-artifacts.mjs. Audio task evidence documents its scoped check; do not misreport a full pass.
8. Once tooltip work is complete, restart canonical `npm run dev` for operator testing (earlier user request), record fresh runtime state and evidence in PROGRESS.

## Runtime and prior delivery

Development session 34678 was stopped after discard authorization. A subsequent process/port check found no Electron process and no port-5173 listener. No server was restarted at clock-out. The development build occupies out/; rebuild a stamped bundle before QA.

Independent BGM / Avatar audio / Sound effects controls were already delivered locally and verified before this tooltip work; see [audio evidence](audio-volumes-2026-09-14.md). Their tests are historical for this handoff, not fresh tooltip evidence. Do not revert them. Phase 4 remains active and unaccepted; no phase status changed.
