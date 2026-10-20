# Interactive Studio stories, follow-up live QA — 2026-10-20

Follow-up to [2026-10-19](interactive-studio-stories-2026-10-19.md). Owner
requests (morning): classify the failed cases as application bug or model
limitation; fix (1) the repaint line spoken twice and (2) the published
studio's last description in English; rerun all stories; venue language is
Traditional Chinese most of the time, sometimes English; follow the model
prompting guide, avoid strict rules or regex for the model, keep instructions
clear and concise. Ruling: DECISIONS 2026-10-20 "Studio prompts follow the
realtime prompting guide".

Same method as 2026-10-19 (`run-raven-conversation-qa.mjs --launch-agent
--scenario portrait_studio --studio-story <id> --keep-transcript`, synthetic
visitor, real Realtime model and ChatGPT images, Jabra 1 % during runs). Two
new checks: `studio_language` (every studio line, farewell included, in the
studio's language; Han/Latin counts like the adapter's reply-language
observer) and `studio_repaint_once` (lines heard while a change is painted).
Both only measure; neither touches what the avatar says.

## Prompt guide

[OpenAI realtime models prompting](https://developers.openai.com/api/docs/guides/realtime-models-prompting):
"Start simple. Do not over-prompt upfront", avoid overlapping always/never/
only/must rules, "Guide with examples", pin the language. The 2026-10-19
read-back prompt (about 110 words of stacked rules) and tool field wording broke
this, and a regex in Main rewrote the model's name (M-I-A → Mia). Now: the
read-back is three sentences with two examples, tool fields are one clause,
painting lines lost their "don't" add-ons, the letter join is removed (the
avatar writes Mia itself). Cutting the examples too (round 1) lost every name
correction: the examples carry the behaviour.

## Changes

| Change | Kind |
| --- | --- |
| A change asked with a spoken preamble commits its result without a second reply; the preamble is read from the calling response's message item (its audio starts only after the tool runs) | App ordering (fix 1) |
| The reveal request ends with the reply language (Taiwan Mandarin with Traditional characters, or English) | App (fix 2) |
| Shorter read-back, painting and repainting prompts; tool field wording; no letter join | Prompt (guide) |
| A name counts as confirmed only from a visitor turn after its read-back, for the name read back | App ordering |
| Nothing is recorded as the visitor's name or answer before the visitor has spoken in the studio (ignored silently, `studio_visitor_reply_missing`) | App ordering |
| A different answer to the question just recorded replaces it (`studio_answer_replaced`) | Main |
| Studio cleanup deletes only items the server added to the conversation; out-of-band spoken lines (start script, cues) never are, which caused `item_delete_invalid_item_id` | App bug |
| Guidance prompts must be one line (`studioText`); a unit test now checks every versioned guidance prompt | App bug found in round 2 |
| Pawnshop test line spells the name only (the Mac voice says "Mia" as "Maya") | Test voice |

## Rounds

| Round | Build | Result | Cause of failures |
| --- | --- | --- | --- |
| 1 | fixes 1–2, short prompts | cartographer pass; 3 name stories **failed** at the name | Prompt too short (examples removed) |
| 2 | examples as bullet lines | 3 name stories **failed** | App: multi-line guidance rejected as `studio_unavailable` |
| 3 | one-line prompt | pawnshop pass; oracle self-confirmed; published recorded an invented answer; cartographer clean-up error `@turn` | Model (2), app clean-up |
| 4 | confirm ordering, answer replacement, listed-only clean-up | oracle, cartographer, published pass; pawnshop "MIA Maya" | Test voice |
| 5 | pawnshop test line | pawnshop pass; second run error `turn.unlisted` | App: `conversation.item.done` counted as listed |
| 6 | added-only listing, spelling wording | pawnshop pass ×2, cartographer pass (full clean-up, 0 errors); oracle repaint twice; published wrote its question as the name | App: preamble signal too late; model |
| 7 (final) | message-item preamble signal, visitor-reply guard | **oracle 23/23, cartographer 17/17, pawnshop 23/23, published 22/22**; full suite 2664 pass | — |
| 8 | same build | **oracle 23/23 twice**; one run had preambles on both changes (`preamble_yes`), each repaint heard once | — |

Final-build visits (rounds 7–8, 6 visits): every check passed, 0 provider
errors, language 100 % (16/7/15/14/15/15 lines), repaint once in all 8 changes,
names as intended in 5/5 name steps. Full clean-up ran in all 8 visits since the
added-only listing (15–48 deletes) with 0 rejected deletes. Pictures reviewed: 「王曉明」
legible on all three oracle pictures; every answer visible; each change kept the
composition and applied only the request (the pawnshop key stayed a key).
Owner review page: <https://claude.ai/artifact/W5DPaA7YxfsRaq1gDyFxhd> (local
copies deleted).

## Remaining observations

- **Painting line twice.** The last answer's preamble and the painting reply both speak (cartographer, rounds 3, 4). Not suppressed: the reply carries the operator's custom painting line and the "about half a minute" wait.
- Model wording: the read-back sometimes tells the visitor to answer "是"; one stored answer gained words (第一節課); one start script said 會 for 要; the published studio's repaint line said the change was already done; one oracle start script was replaced by an improvised Simplified-Chinese greeting (round 1, 1 of about 30 visits).
- The avatar's transcript text sometimes uses Simplified characters (夜里, 畫里); it is never shown on the mirror and the speech is unaffected.
- The Jabra takes its stored hardware step (0.0625) when the app opens it; QA now sets 69 % after production restarts (held at 69 % after each run).

## Afternoon: repaint line, two more guards, stickers

Owner choices: allow one short line before a change request (sample line in the
studio_revise instructions; the app then asks for no second line); stickers for
a colour printer, cut around the shape; Picture type and Name font in the
Console; hidden prompts moved to versioned files, memory ones view only.

| Round | Result | Found / fixed |
| --- | --- | --- |
| Repaint line (12:52) | oracle 23/23, pawnshop 23/23, published 22/22; second oracle **failed** | Every change got one clear line ("…等我半分鐘"). The oracle's reveal declared the picture finished without the visitor: finish now needs a visitor turn since the picture was shown |
| Finish guard (13:23) | all four pass | The reveal re-requested the dragon as the second change, so the visitor's galaxy was refused (checks passed): a change now needs a visitor turn since the picture was shown, and QA checks the visitor's own change was accepted |
| Change guard (13:51) | oracle (both own changes painted), pawnshop, published pass | Fourth run refused to start (`qa_build_stale`, source edited mid-round) |
| Stickers (14:17) | full suite 2668, `--studio-journey`, `--console` pass; **oracle 24/24, pawnshop 24/24, published 23/23, cartographer 18/18** | — |

Sticker checks (`studio_picture_format`): all seven sticker pictures were PNG,
square (the backend returned 1254×1254 for the requested 1024×1024) with fully
transparent corners; the cartographer, set to Full picture, stayed 1024×1536.
Pictures reviewed: one emblem with a thick white border on a see-through
background; the oracle's painted 「王曉明」 legible in the chosen brush
calligraphy on a ribbon; changes kept the emblem and border; the galaxy change
adds glow; the published studio (storybook style) has one tiny stray speck
outside its border. The mirror shows a sticker whole in a square frame.

## Not covered

Human visitors, the wake phrase spoken aloud, and rates beyond these samples
(dialogue is probabilistic).
