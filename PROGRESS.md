# Magic Mirror — current handoff, 2026-10-18

Latest delivery (**Interactive Studio visit flow**; pushed to
`field/macmini-deploy` and PR #2 `feature/portrait-studio` → `main`): in
Interactive Studio mode the mirror wakes to its own **Studio wake phrase**
(default 「招喚渡鴉使者」, set in the Console), runs name → questions → picture,
says the **Studio farewell** (「願你找到你所追尋 / 再會 / 人類」, pauses between lines)
and returns to Dormant; the studio character (system prompt), rules, questions,
every step's reply, image prompt, on-glass text and failure lines are editable
in an editor ordered by the visit; printing has a documented seam. Built on the
same day's Interactive Studio, Mirror mode switch and Stream Deck key delivery.
On the stamped build: **full suite, `--studio-journey` (incl. the real wake
listener switching to the studio phrase), `--field-help`, `--console`,
`--profiles`, `--editor`, `--operator-loop`, `review_ui` and one live
`portrait_studio` run of the owner flow (17 steps, farewell → Dormant) pass.**
[Evidence](docs/testing/interactive-studio-2026-10-18.md) ·
[user journeys](docs/testing/user-journeys-2026-10-18.md).

Earlier today: memory extraction on `gpt-6.1-sol` and ChatGPT sign-in upkeep
([evidence](docs/testing/memory-model-signin-2026-10-18.md)); the nine TODO
code-audit fixes ([evidence](docs/testing/todo-audit-fixes-2026-10-18.md)).
Earlier: Console revamp ([evidence](docs/testing/console-ux-revamp-2026-10-17.md)),
Portrait Studio ([QA](docs/testing/portrait-studio-2026-10-17.md)), Loop Video
Drive save ([evidence](docs/testing/loop-video-cloud-save-2026-10-17.md)),
portrait Console mouse ([setup](docs/testing/portrait-console-mouse-2026-10-17.md)),
Neo operator controls ([QA](docs/testing/operator-controls-2026-10-17.md)) and
Loop Video ([ledger](docs/testing/operator-loop-2026-10-17.md)). Prior handoff:
[archive](docs/archive/progress-before-clockout-2026-10-18.md).

Runtime (**14:29 Taipei, 2026-10-18**): production app restarted on the new
build after QA; Mirror mode Conversation; published config version 19. Stream
Deck: the five-key profile is imported and selected for the Neo ("Magic Mirror
copy"); the old four-key profile is still listed, unused. Output: Jabra (default
device) **69 %, unmuted** (the owner's normal level); input gain 57 unchanged. The owner is away for two days.

Open gaps (all in [TODO](TODO.md)): saying 「招喚渡鴉使者」 at the mirror and a
physical INTERACTIVE STUDIO press; a human studio visit; the QA sound wrapper
under output-device switches; the stricter `gpt-6.1-sol` judge baseline; no real
cold Drive download since the deadline change; Chrome Remote Desktop pointer;
physical Neo checks; camera, wake and dialogue boundaries in the
[open-issues ledger](docs/testing/open-issues-2026-10-13.md). No phase
acceptance changes.

Next: owner presses INTERACTIVE STUDIO, says the studio wake phrase at the
mirror (if detection is weak, try 召喚 instead of 招喚 in Interactive Studio ›
1 · Start), runs one visit to the farewell, then START MIRROR; walks user
journeys O2–O4 on the portrait TV. Leave runtime and device state under the
owner's control.
