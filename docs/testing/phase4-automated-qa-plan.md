# Phase 4 automated Console and visual audit

Scope: Windows Phase 4 candidate, including the real Console editor and the
portrait Mirror display. Human acceptance, physical lighting/fog, and Mac
deployment remain pending. No Phase 5 engineering is included.

## Execution and acceptance

1. Verify the canonical Electron firewall rules and the connected displays.
   Require the Mirror on the portrait display; keep Console on another display.
2. Extend the isolated Phase 4 harness with a Console mode. Substitute only
   native file-picker selection. Drive real DOM controls and production IPC;
   inspect saved/published state without bypassing the editor for mutations.
3. Exercise import cancel/rejection/cleanup, finite visual authoring,
   Draft/Test/Publish, run/completion/Avatar return, invalid Stage combinations,
   missing links, rejected-save preservation, unsaved-edit publication safety,
   Stage reorder/delete, scene/action enablement, and Stop All.
4. Reproduce discovered product defects, patch their cause, and rerun the
   relevant cases. Add focused runtime tests for uncovered timeout or stale
   event boundaries using injected clocks.
5. Run Node/web typechecks, build, repository tests, real Console automation,
   and the existing synthetic Avatar/media QA. Inspect captured portrait and
   Console images directly. Frame changes and nonblack pixels are mechanical
   evidence; visual inspection separately checks framing and readability.
6. Create a reusable QA skill tied to these commands and evidence limits.
   Record exact results, artifact directories, outstanding human observations,
   and final diff review in a dedicated report. Do not accept/tag Phase 4.

Use synthetic fixtures and isolated user data. Do not capture operator content,
conversation audio/transcripts, credentials, or unrelated desktop windows.
The native Windows picker itself is outside automated selection coverage.
