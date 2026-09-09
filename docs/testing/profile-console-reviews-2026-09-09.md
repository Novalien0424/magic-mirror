# Profile Console design reviews

Both substantive planning calls requested `fable`, high effort, safe mode,
toolless, USD 2 best-effort budget, through the repaired Windows MCP server.
The actual second CLI process was observed with `--model fable`.
The bridge reports the first modelUsage key as raw_response.model (Haiku),
so that field is not reliable evidence of the primary reviewer model; the
requested model and observed CLI argument are recorded explicitly.

1. Request 449cc442bfd940f1aa070229223dab4f; session
   a937c848-792b-47d5-98a9-f5947b8fcdd9; concerns, medium confidence;
   USD 0.550190; exit 0. Adopted three destinations and scoped shared library,
   persistent draft owners, persisted scope diff, resync conflict handling,
   preview cancellation and isolated cleanup assertions. Rejected empty
   farewell/no-rig defaults because current strict schema requires supported
   defaults; retained built-in Ren and valid farewell. Check was already gated
   while dirty. Inspector is already preview-only. Review was design-only.
2. Request 386e4b5dea914cfc929e068b86a3434a; session
   f655ca4c-7287-4c6f-9ea6-7ce10a64e0df; concerns, medium confidence;
   USD 0.609114; exit 0. Corrected the impossible invalid-schema-at-Check
   journey: assert rejection at Save, and retain existing decode failure Check
   coverage. Specified mandatory fresh Check, Dormant fixture versus unit-test
   active-session denial, separate library sidecars, dirty reload guard and
   baseline conflict coverage. Proceed with those corrections.

Failed setup is not counted as review: attached stale MCP raised WNOHANG;
fresh transport initially lacked explicit UTF-8 environment. Fresh status then
passed authenticated/safe. Detached job 4df93aabf4d849b19e2a0edb2ddd8fee
terminated without a result after its launcher exited (reported cost unknown).
One replacement kept the synchronous MCP connection alive and completed above.
No further planning calls were needed.

## Actual visual reviews

Both additional calls requested Fable/high, safe read-only mode, USD 2 budget.
Each reviewer opened seven actual synthetic Electron captures; neither was a
source-only visual review. The model-reporting caveat above still applies.

3. Request aeae217662854b478a0bc64407a17e1a; session
   e37c6428-d4d5-4d3a-9e90-6b18efa3caa3; concerns, medium confidence;
   USD 0.88066775; exit 0. Images from QA run 14-58-38-253Z showed offscreen
   publication controls, clipped profile names, Voice overflow at 1024,
   redundant headings, inconsistent hierarchy and an over-styled device meter.
   Corrected with an opaque compact sticky action dock within the editor,
   full name/public ID in the rail, contained Voice columns, common section
   navigation, simplified headings and a plain labelled input meter.
4. Request 3874227a2abf4df5be33af0118a0001e; session
   5e087386-db20-45cc-952d-31a2eccf4d0e; concerns, medium confidence;
   USD 0.75584950; exit 0. Images from QA run 15-13-28-702Z confirmed those
   improvements. Required correction: the Spells hardware-status chip shifted
   the entire workspace downward. Moved it into the fixed status dock and
   added a real geometry assertion across every section at both widths.
   Optional file-input clipping was corrected with a choose-file button and
   separate filename. Rig/preset labels and singular step copy were clarified.

The second visual reviewer also questioned why publication displayed an
Editing eyebrow absent from the later Persona capture. This is deliberate:
the eyebrow appears when editing and running profiles differ. Publishing does
not itself activate the new profile; the later capture follows Use on Mirror.
The long mock-persona-v1 label is a synthetic profile name, not a private ID.
The rail always retains a full name and short public avatar ID.

Codex inspected captures independently during both iterations and the final
corrected run. Final image IDs, geometry checks and acceptance boundaries are
recorded in [the validation report](profile-console-2026-09-09.md). These were
concerns verdicts with documented corrections, not an invented Fable pass.
The four completed reviews cost USD 2.79582125 in total; failed detached setup
has unknown cost. Cleanup was explicitly requested, but automatic approval
review rejected both the confined cleanup command and a literal-path version
with only "blocked by policy". Raw temporary reviews/captures therefore remain
local and ignored; cleanup is unresolved, as recorded in the validation report.
