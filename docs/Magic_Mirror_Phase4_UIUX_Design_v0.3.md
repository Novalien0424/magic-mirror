# Magic Mirror Phase 4 UI/UX Design — Console Scenes

**Version:** 0.3.2
**Date:** 2026-08-28
**Status:** Build-ready Phase 4 design
**Related:** `Magic_Mirror_PRD_v0.3.md`, `Magic_Mirror_Tech_Spec_v0.3.md`, `Magic_Mirror_Implementation_Plan_v0.3.md`

## 1. Outcome and boundary

The Console must let an operator create a spell, link it to a scene, assemble that scene from reusable typed actions, test it, and publish it without editing JSON. The screen is a compact authoring tool for ordered stages—not a general workflow builder. There are no branches, arbitrary scripts, hidden waits, or model-generated device parameters.

The dominant question on every screen is: **what will happen, in what order, for how long, and did it actually happen?**

## 2. Information architecture

Add **Scenes** to the existing Console navigation. To keep this personal-build tool compact, the workspace is one vertical editor with four fieldsets: Managed music, Spells, Reusable actions, and Ordered scene stages. A persistent bar at the bottom shows the active version and draft-change count, then provides **Save Draft**, **Test Draft**, **Publish**, and **Stop All**. Edits remain local to the open editor until Save Draft; closing or navigating away does not activate unsaved work.

## 3. Spells section

Each row shows Enabled, Name, Exact phrase, Linked Scene, and Cooldown in milliseconds. Phrase is plain text and must be unique after the same normalization used at runtime. Save Draft and Test Draft run the authoritative validation; empty phrases, duplicate normalized phrases, and missing scene links cannot be published. Runtime spell matching still occurs against the final transcript in renderer RAM and no transcript text is written to telemetry.

## 4. Reusable actions section

The section lists reusable actions as cards. Each card begins with Name and Kind; changing Kind replaces the payload editor and does not retain hidden values from the previous kind.

| Kind | Operator fields | Runtime／QA evidence |
|---|---|---|
| Avatar dialogue | Exact text to speak | Dispatch or visible `no_active_realtime_session`; real output end when available |
| Cubism motion | Motion group from active manifest | Started, finished, returned to lifecycle motion |
| Cubism expression | Expression from active manifest | Applied acknowledgement and visual preview |
| Lighting | `on`／`off`／`value`, approved preset, bounded value when supported | Mock or physical capability, command and result |
| Fog | `on`／`off`／`value`, approved preset, bounded value when supported | Mock or physical capability, command and result |
| Music | `play`／`stop`／`fade`, managed asset and bounded gain/fade when applicable | Actual audio-graph start／ended／fade result |

Dialogue text is an authored product value, not chat history. The Realtime model is instructed to speak it exactly; Phase 4 trusts model compliance and does not record or compare the spoken content.

**Upload music** opens the native file picker. A successful import shows title, format, and asset ID; it never shows or stores the original arbitrary filesystem path in an action. Unsupported files remain outside the library and return a stable error.

For Lighting and Fog, the page badge distinguishes `Mock` from `Physical not connected`. On the current no-hardware build, focused tests use deterministic mock success／failure／timeout adapters. A mock result can pass the adapter contract but never counts as physical evidence.

## 5. Ordered scene stages section

Scenes are vertical cards containing an ordered Stage timeline. Every Stage card contains:

- Up／Down buttons.
- Stage name.
- Required Duration in milliseconds or seconds, displayed consistently.
- Linked-action checkboxes; all selected actions start together when the Stage begins.
- Add／unlink action controls and Delete Stage.

Between cards, the connector says **“After Duration expires”**. A fixed note above the timeline says: “Duration starts the next Stage. It does not automatically turn off, stop, undo, or reset an earlier action.” When a Stage turns something on without a later explicit off/stop action, preview shows a non-blocking warning.

Authors save and test the draft, then **Run Published Scene** executes the active validated version. Runtime and Phase Test evidence report dispatched, acknowledged, completed, failed, or timeout outcomes; the Stage clock, never adapter feedback, advances the run.

## 6. Run controls and feedback

Each Scene card has **Run Published Scene**. The publish bar has **Stop All**, and the page status region announces the latest Console operation. Detailed per-action results and skip reasons (`transcript_unavailable`, `not_exact_match`, `duplicate_turn`, `cooldown`, `disabled`, and `invalid_config`) stay in metadata-only runtime／Phase Test evidence. One action failure marks the run partial but does not freeze the Stage clock or block unrelated adapters.

## 7. Draft, test, and publish

Edits first update local form state. **Save Draft** validates and durably writes the draft through the existing Console config boundary. Publish requires:

1. Schema and referential validation pass.
2. Every enabled spell links to an enabled scene.
3. Every scene has at least one Stage and every Stage has a valid positive Duration.
4. Every action reference resolves and every typed payload is valid.
5. Music play actions reference an existing managed asset.
6. The saved draft has a passing Test Draft result; saving another edit invalidates that result.

Publish atomically replaces Active and retains Previous. A failed publish leaves Active untouched. The status region shows completion or a stable validation／operation error.

## 8. Accessibility and interaction details

- Every reorder operation has keyboard buttons.
- Status is conveyed by text and icon, never color alone.
- Invalid deletes remain local or fail draft validation and cannot alter Active.
- Duration and bounded values use numeric inputs with explicit units, minimums, and maximums.
- Operation updates use an `aria-live="polite"` status region.
- Narrow Console widths stack list and editor; the timeline remains vertical and does not require horizontal scrolling.

## 9. Visual QA and acceptance captures

Automated Console tests cover editor controls, bridge boundaries, invalid-draft rejection, and Active remaining unchanged after a failed publish. The real Electron Phase 4 harness captures each Ren motion group in an active frame and after lifecycle motion resumes, plus every configured Ren expression on a non-black Avatar frame. Cubism start／finished events prove motion execution rather than still-image loading, and image hashes plus a foreground-pixel gate require visibly distinct frames. Actual music QA additionally requires a managed-asset fetch and analyser activity from the real output graph. Lighting and fog run through deterministic adapters; physical-output captures remain deferred until hardware is connected.

### Authoritative integrated QA case

The fixture spell `Mirror begin the ceremony` must enter through the same normalized exact completed-transcript matcher as a visitor turn. An appended phrase must not match, and replaying the same final turn ID must not run the scene twice.

| Ordered stage | Duration | Linked actions | Required evidence |
|---|---:|---|---|
| Opening | 700 ms | Verbatim opening dialogue, Ren `Waking` motion, music play, light ON | Correlated renderer acknowledgements, audible-path dispatch, active Avatar frame, real music analyser |
| Effect | 700 ms | Ren expression, fog ON, fog value | Expression capture and deterministic mock adapter results |
| Release | 300 ms | Music fade, fog OFF, light OFF | Fade completion and mock OFF results; feedback does not advance the clock |
| Ending | 700 ms | Verbatim ending dialogue, Ren `Scene` motion, music stop | Correlated acknowledgements, visibly changed Avatar frame, stop completion |

The scene timeline must report approximately 2.4 seconds regardless of when observational action feedback arrives. The deterministic lane runs without a Realtime session and must report both dialogue actions as `failed:no_active_realtime_session` while unrelated actions continue, producing `partial_failure`. The live-provider lane must connect a real session, acknowledge both verbatim dialogue dispatches, complete the scene, and observe non-zero mouth movement from actual output audio. No transcript, spoken-audio copy, or dialogue comparison is persisted. Lighting and fog remain marked mock-only until physical hardware is available.
