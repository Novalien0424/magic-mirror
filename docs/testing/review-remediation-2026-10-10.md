# Review remediation — 2026-10-10

Requested by the owner after the media/BGM/TV work: systematically verify and
resolve the findings in [the performance, correctness and UI/UX review](performance-correctness-uiux-review-2026-10-10.md).
The original review is preserved. This ledger records current-code conclusions,
focused checks and remaining physical acceptance, without conversation content.

## Work groups

| Group | Findings | Status |
| --- | --- | --- |
| Main lifecycle, config hot paths and host services | PE-01, PE-02, PE-07, PE-08, PE-10, PE-11, PE-12; CO-01, CO-04, CO-08, CO-11, CO-13; MM-01, MM-02, MM-03, MM-06 | Pending current-code verification |
| Memory correctness and worker lifecycle | PE-03; CO-03, CO-05, CO-06, CO-07, CO-09, CO-10, memory portion of CO-12; MM-05 | Pending current-code verification |
| Renderer/audio efficiency and recovery | PE-04, PE-05, PE-09, PE-13, PE-14, PE-15; CO-02; MM-04; MX-05, MX-06, MX-08, MX-09, MX-11, MX-12 | Pending current-code verification |
| Console operability and presentation | PE-06; CX-01 through CX-14; MM-07 | Pending current-code verification |
| Guest failure presentation and operator phrases | MX-02, MX-03, MX-04, MX-07, MX-10; camera/player portion of CO-12 | Pending current-code verification |
| Intentional behavior | MX-01 | Healthy reflective Dormant stays completely black, per the owner's ruling. No guest wake hint will be added. |

The seven MM findings explicitly listed by this review are included. Other
findings from the separate whole-project review are referenced only when needed
to resolve these changes correctly; they are not silently claimed complete.

## Verification policy

Each group gets the smallest meaningful regression checks. Renderer changes also
get isolated Electron captures where they affect visible behavior. Provider
conversation evidence uses the actual Raven persona and real API, with synthetic
input clearly distinguished from human and physical wake acceptance. Normal
Electron and QA never overlap. Operator edits, dependencies, runtime model IDs,
exact spell authorization and private-memory ownership remain protected.

## Results

Implementation and check results will replace the pending rows as work completes.
