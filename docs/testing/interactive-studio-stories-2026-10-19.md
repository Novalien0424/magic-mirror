# Interactive Studio stories, live QA — 2026-10-19

Owner requests (evening): stop and rebuild; at least three complete Interactive
Studio visits with the avatar, in very different scenarios with drastically
different prompts and image styles, then much more spiritual and conceptual
("your wildest prompts") to prove the avatar works and has charm; present the
pictures and full transcripts; self-QA as production work; fix everything found;
research the best experience and improve it without over-engineering, keeping the
question structure (name → questions → picture → change → farewell); clean up
all test artifacts afterwards. Real-API QA authorized. Ruling: DECISIONS
2026-10-19 "Studio opening and name read-back".

## How it was tested

`node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario
portrait_studio --studio-story <id> --keep-transcript` runs one complete visit on
the real Realtime model and the owner's ChatGPT image plan: Mirror mode
Interactive Studio → wake start → start script → first step → name read-back
(the synthetic visitor reads the glass and corrects wrong characters) → every
question → painting → reveal → the story's changes → keepsake → studio farewell
→ Dormant; the published studio also runs a Conversation-mode request. Remote
Console and CONSOLE steps run mid-visit. The visitor is synthetic (scripted
lines in a Mac voice through the virtual microphone). `--keep-transcript` keeps
that synthetic visit's transcript and pictures in the run folder for the owner
review only; it is off by default and the folders were deleted after review.
Stories live in `src/main/studio-qa-stories.ts` and pass the Console's own
studio validation (`tests/unit/studio-qa-stories.test.ts`).

| Story | Character | Image style | Settings |
| --- | --- | --- | --- |
| `past_life_oracle` 前世之鏡 | Raven oracle lifting a past life out of the mirror; ritual, Zen-poetic | Dunhuang mural and gold-leaf icon, mineral pigments | Name painted into the picture, 4 questions, custom question and painting prompts, 2 changes, high quality, owner's default farewell |
| `unlived_cartographer` | Cosmic cartographer of the roads not taken; English, luminous | Antique celestial chart with esoteric abstraction, sacred geometry | No name step, 3 questions with image lines, custom image frame and reveal, no changes, low quality, English farewell and glass labels |
| `dream_pawnshop` 夢的典當行 | Monocled raven pawnbroker trading memories for dreams; witty, uncanny | Surreal magical-realist dreamscape | English name in Chinese speech (spelled correction), 6 questions, custom painting and closing lines, 1 change, medium quality, custom farewell and glass labels |
| `default` | The owner's published Raven studio | Published style | Published settings plus one edited painting prompt; Conversation-mode request |

An earlier, more ordinary set (gothic gallery, fortune card, storybook) was
replaced at the owner's request; its runs found the first two defects below.

## Research applied (kept small)

- Google Conversation Design, confirmations: implicit confirmation by default;
  explicit confirmation is rare and fits parameters where a misunderstanding is
  costly, "such as with names"; "Don't belabor confirmations"; accept one-step
  corrections. <https://developers.google.com/assistant/conversation-design/confirmations>
- Fröhlich (2005), telephony waiting: silent waits should stay under about
  4–8 s; spoken information about the remaining wait was rated more pleasant.
  <https://course.ccs.neu.edu/csg170/ssl/frohlich05.pdf>

Applied as default stage prompts only: the name read-back is one short
in-character question (explicit confirmation is right for a name painted on the
keepsake); the painting line says it takes about half a minute (the glass keeps
its painting animation and captions); the handover speaks to the visitor. The
avatar already reacts to each answer before the next question (implicit
confirmation, seen in every transcript). An extra "react first and announce the
last question" rule was tried and reverted: it made the avatar improvise
sub-questions (round E).

## Defects found and fixed

| Found in | Defect | Fix |
| --- | --- | --- |
| Fortune card (no name step), first run | A studio started by Main spoke only the start script; the first step was never asked, so the visitor's first answer was taken as small talk. Name stories passed only because the glass shows the question | `enter` carries Main's first-step guidance; the adapter adds it to the conversation as a system item and, after the start script, asks it in character (`mirror_studio: 'first_step'`); not asked again if the visitor already answered |
| Same run | An English story showed and asked question 1 in Chinese (run language started as `zh`) | The run starts in the start script's language (`studioStartLanguage`), and the first step is asked with that language named, since the Persona default would otherwise win |
| Storybook and pawnshop | A spelled correction (M-I-A) was taken as a confirmation; later the letters were stored as "M-I-A" | Read-back prompt: spelled letters or a described character outrank the heard name and are always read back; Main joins three or more spelled letters into a word (`spelledName`: M-I-A → Mia) |
| Past-life oracle | Recognition wrote 王小明 even in the correction (「是破曉的曉，王小明」); the avatar kept 王小明 | Read-back prompt states that transcripts cannot tell same-sounding characters apart and gives the rebuild rule (王小明 with 破曉的曉 is 王曉明) |
| Cartographer | The default painting line was echoed back ("I haven't seen the picture yet, so I can't describe it") | Painting guidance no longer contains a sentence to echo |
| Raven gallery, cartographer | The final reveal sometimes skipped the description, or narrated what it would do | Final-version follow-up is only "call studio_finish; its reply tells you how to hand the portrait over"; the reveal text already asks for the description first |
| Cartographer | The handover line spoke about the visitor ("the portrait is theirs") | `finished` addresses the visitor and invites the photo |
| Cartographer | An English answer was stored translated into Chinese | `studio_answer.answer`: "in their own words and language, never translated" |
| Oracle, cartographer, published (3 of 4 final reveals) | With no change left, the avatar called studio_finish before (or instead of) describing the last picture | The final reveal runs without tools (`tool_choice: none`), describes and hands over the picture (Final version); when that reply ends the application finishes the studio |
| Cartographer, round E | My own question wording ("react first, announce the last question") made the avatar improvise sub-questions and skip recording the answer | Reverted to the proven `Now ask question {{index}} of {{count}}: {{question}}`; the glass already shows the counter |
| Published, round E | A correction utterance was recorded as `confirmed: true` | `studio_set_name` field descriptions: `confirmed` only for a plain yes with nothing added; `name` takes described characters and spelled letters |
| Default and past-life runs | One provider error `item_delete_invalid_item_id` late in long visits (also the unidentified error of 2026-10-19 13:33) | No visitor impact. Deletes are now at most once per item and labelled by cleanup path; the live probe reports repeated deletes and classifies a rejected delete by path and whether the server ever listed the item, metadata only. Repeated deletes measured 0, so the cause is not a double delete; classification pending the next occurrence |

Earlier the same day: the Console showed a stale Mirror mode after Stream Deck
keys, a stale "Back to the avatar" result line, and a false "Check the
microphone" warning during a wake listener restart; all fixed and covered by the
operator-loop QA ([Remote Console](remote-console-2026-10-18.md)).

## Results

Stamped builds (`qa-build --verify` pass), Jabra pinned at 1 % for live runs,
then 69 %.

| Round | Build | Full suite | Live visits |
| --- | --- | --- | --- |
| Ordinary stories | first fixes | 2655 pass | gallery pass (21/21); fortune card **failed** (first step, defect 1–2); storybook **failed** (name) |
| Spiritual stories, C | first-step fix | 2655 pass | oracle **failed** (name); cartographer pass; pawnshop **failed** (name); published **failed** provider-error gate only |
| D | name and language fixes | pass | oracle all visit steps, provider-error gate **failed**; cartographer pass 16/16; pawnshop **failed** (name); published pass 20/20 |
| E | experience prompts | pass | oracle pass 21/21; cartographer **failed** (question wording regression, reverted); pawnshop **failed** (test voice re-said "Mia" as Maya when confirming); published **failed** (correction taken as confirmation) |
| F (final) | revert, app-owned final finish, tool field wording | 2655 pass; `--studio-journey` pass | **oracle pass 21/21; pawnshop pass 21/21; published pass 20/20**; cartographer all visit steps pass, provider-error gate failed once (clean-up delete) |
| G | probe label fix only | — | **cartographer pass 16/16 twice** |

### Final round (product build F; G adds only the probe fix)

| Story | Run | Result | Pictures (s) | Checks worth noting |
| --- | --- | --- | --- | --- |
| Past-life oracle | `2026-10-19T15-40-45-017Z` | pass 21/21, 0 provider errors | 30.7, 45.8, 51.7 (high) | 王小明 → 王曉明 by 「破曉的曉」 (one correction); painted banner 「王曉明」 legible on all three pictures; custom question and painting lines; last picture described and handed over; farewell word for word |
| Cartographer | `2026-10-19T16-04-07-391Z` (and `16-07-18-161Z`) | pass 16/16 both | about 45 (low) | First question in English; "about half a minute" painting line; map described and handed over; English farewell word for word |
| Dream pawnshop | `2026-10-19T15-51-19-085Z` | pass 21/21, 0 provider errors | 33.8, 44.3 (medium) | "Maya" → spelled M-I-A → Main joined Mia → read back → confirmed; six answers; custom painting and handover lines verbatim; farewell 「夢醒了 / 帶著它走吧」 |
| Published studio | `2026-10-19T15-57-57-564Z` | pass 20/20, 0 provider errors | two pictures | 王曉明 corrected; edited painting prompt followed; snowy-forest change; farewell word for word; Conversation-mode request opens the studio |

Pictures reviewed: every answer appears in each picture (sunken temple, eternal
lamp and apsaras; sea-painted door, whales, orbits; leaf wings, reversed film,
glowing mushrooms and singing key; snowy owl); each change kept the composition
and applied only the request; one small loss: the pawnshop change also turned
the singing key into a butterfly. No text artefacts except the intended painted
name. The owner review page:
<https://claude.ai/artifact/W5DPaA7YxfsRaq1gDyFxhd> (pictures, glass views and
full synthetic transcripts; the local copies were deleted).

Remaining observations (one sample each, not fixed): the read-back still often
tells the visitor how to answer (「只要說『是』」); a short spoken preamble
before some tool calls (known Realtime mini behaviour); one repainting line spoken
twice; the studio farewell once said 「再見」 for 「再會」 (1 of about 12); the
avatar once skipped asking question 2 aloud (the glass showed it). Name steps
across the day's 14 live visits: Chinese homophone correction 7 of 9; spelled
English name 1 of 5, all four failures before the final read-back prompt, the
spelled-letter join and the plain test confirmation; the final build passed all
3 name steps (TODO). The clean-up provider error appeared in 4 visits.

Production check on the final build (00:10–00:11 Taipei): the Desktop Remote
Console app, the CONSOLE and START key apps and the not-running alert behave as
in the Remote Console record; the app was left running, Dormant and listening,
Conversation mode, Jabra 69 %.

## Not covered

A human visitor at the mirror (synthetic voice only), saying the wake phrase
aloud, the exact pause length of farewells, and repeated runs of each story
(one sample per story per round; dialogue is probabilistic).
