# QA artifact cleanup — 2026-10-20

Owner request (2026-10-20): clean up the code base. Retention rule applied:
Phase 4 QA run folders older than seven days are deleted once their results are
written up; the written reports in `docs/testing` remain the evidence. Runs from
2026-10-13 onward are kept (this week's work, including the camera session's
evidence). Other `.artifacts` folders (named evidence sets) are not touched.

Each run was reviewed and deleted with `scripts/qa-artifacts.mjs` (finished,
marker-owned runs only; unfinished runs are skipped and listed below).

| Day | Runs | MB |
| --- | --- | --- |
| 2026-10-04 | 28 | 339 |
| 2026-10-05 | 26 | 204 |
| 2026-10-09 | 19 | 313 |
| 2026-10-10 | 44 | 820 |
| 2026-10-11 | 7 | 0 |
| **Total** | **124** | **1676** |

Reports that cite deleted runs (their run IDs now point to deleted local folders):
- docs/archive/memory-delivery-progress-2026-10-05.md
- docs/archive/memory-planning-progress-2026-10-05.md
- docs/archive/progress-before-raven-conversation-qa-2026-10-10.md
- docs/relationship-memory-implementation-2026-10-05.md
- docs/reusable-memory-implementation-2026-10-04.md
- docs/testing/conversation-quality-implementation-2026-10-05.md
- docs/testing/media-fallback-bgm-tv-shutdown-2026-10-10.md
- docs/testing/media-review-2026-10-09.md
- docs/testing/memory-live-retest-2026-10-05.md
- docs/testing/raven-conversation-qa-2026-10-09.md
- docs/testing/relationship-memory-real-conversation-2026-10-05.md
- docs/testing/review-remediation-2026-10-10.md
- docs/testing/review-remediation-main-2026-10-10.md
- docs/testing/review-remediation-memory-2026-10-10.md
- docs/testing/second-audit-remediation-2026-10-11.md
- docs/testing/tv-hdmi-boot-2026-10-10.md
- docs/testing/wake-phrase-rca-2026-10-10.md
- docs/testing/wake-spell-rca-2026-10-10.md

Outcome: 123 runs reviewed and deleted (1,693 MB). One run, 2026-10-05T03-51-52-766Z, never finished (interrupted) and is kept; the tool deletes finished runs only.
