# Magic Mirror — current handoff, 2026-10-18

Latest delivery (**memory model and ChatGPT sign-in upkeep**; pushed to
`field/macmini-deploy` and PR #2 `feature/portrait-studio` → `main`): memory
extraction uses the `gpt-6.1-sol` alias (field config **version 19**, packaged
default version 8); Main keeps the Portrait Studio ChatGPT sign-in refreshed in
the background; the Console says plainly **Signed in / Not signed in** and shows
how to start Portrait Studio. On the stamped build: **full suite, `--field-help`,
`--console`, `--memory` and live `memory_calendar` on `gpt-6.1-sol` pass; live
`local_scope` failed twice on the transcript judge only** (now also
`gpt-6.1-sol`, stricter; all application checks passed).
[Changes, results and the judge finding](docs/testing/memory-model-signin-2026-10-18.md).

Previous delivery (`ca6cf29` + `3f8724a`): the nine TODO code-audit fixes and
the media deadline limitation
([evidence](docs/testing/todo-audit-fixes-2026-10-18.md)). Earlier:
Console revamp `1a5a435`
([evidence](docs/testing/console-ux-revamp-2026-10-17.md)), Portrait Studio
([QA](docs/testing/portrait-studio-2026-10-17.md)), Loop Video Drive save
([evidence](docs/testing/loop-video-cloud-save-2026-10-17.md)), portrait Console
mouse ([setup](docs/testing/portrait-console-mouse-2026-10-17.md)), Neo operator
controls ([QA](docs/testing/operator-controls-2026-10-17.md)) and Loop Video
([ledger](docs/testing/operator-loop-2026-10-17.md)). Prior handoff:
[archive](docs/archive/progress-before-clockout-2026-10-18.md).

Runtime (**11:40 Taipei, 2026-10-18**): production app restarted on the new
build after QA (it was running; stopped with launchd TERM, TV untouched).
Published config version 19; rollback is the Console's Previous (18) or the
backup in `config/backups/before-memory-model-sol-2026-10-18/`. System output
**69 %, unmuted**; input gain unchanged.

Open gaps (all in [TODO](TODO.md)): the stricter `gpt-6.1-sol` judge baseline;
no real cold Google Drive download since the deadline change; no human Portrait
Studio visit; Chrome Remote Desktop pointer movement/click unaccepted; physical
Neo keys/labels, picture/music, USB reconnect and cold login unconfirmed; one
past ritual reload stall; camera, wake and dialogue boundaries in the
[open-issues ledger](docs/testing/open-issues-2026-10-13.md). No phase
acceptance changes.

Next: owner decides how to re-baseline the live quality judge; owner look at the
Console on the portrait display (sign-in badge, Return to Avatar while Loop Play
starts); one cold large Drive video; a human Portrait Studio visit; 「在雲上找找」
through the real microphone; remote pointer movement/click; physical Neo checks
as needed. Leave runtime and device state under the owner's control.
