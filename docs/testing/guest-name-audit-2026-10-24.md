# Guest name list and bilingual matching audit — 2026-10-24

## Verdict

The current implementation does **not** satisfy dependable Chinese/English
sound-alike name matching. Chinese supports a limited set of deterministic
pronunciation equivalents. English pronunciation matching is absent. Candidate
ambiguity and confirmation recovery also require repair before field acceptance.

This delivery audits the current behavior; production source/settings are
unchanged. Baseline checkout `2b59a22`, deployed source `f3957b0`. The previous
[whole-journey audit](studio-journey-audit-2026-10-24.md) remains open, including
the wrong-tool name loop and failed-cue recovery defects.

## Where to enter names

**Console → Avatars → select Raven → Interactive Studio → 3 · Name and questions
→ Name list for confirmation.** This section sits below the bilingual name
question and above Question 1.

1. Enable **Ask for a name first**.
2. Enter the correct written names in **Guest names**, one per line. Limit:
   1,000 entries, 40 characters each. Blank lines are ignored.
3. Choose **Suggest names from the list** to allow matching suggestions and
   unlisted names. **Only accept listed names** reasks when a name cannot be
   matched; both modes still use 無名之人 after 30 seconds of silence. **Off**
   ignores the list but preserves it for later.
4. **Save all changes → Publish all changes → Confirm publish**. The list applies
   to the next visit, not the current conversation.

The known tailnet Console address, while the normal app is running, is
`https://macmini-m6-33.tailf9113c.ts.net:8443/`. This audit preserves the owner's
stopped app state. A fresh config read found Raven's active **and draft lists
empty**, matching mode `prefer`, and name capture enabled. No private names were
read or printed. The preceding same-day rendered operator audit passed name-list
editing, validation, save/publish/reload and narrow layout; this audit reuses that
unchanged UI evidence rather than claiming another rendered run.

## What the matching path actually does

Realtime hears visitor audio and supplies a name string to `studio_set_name`.
Main searches the list using that string. It does not compare voice waveforms
against a name database, and it does not send the entire list to the model.

- Text comparison folds Traditional/Simplified script, case, width, spaces and
  punctuation.
- Chinese comparison takes one dictionary pronunciation per character, removes
  tones, and merges `in/ing` and `en/eng`.
- Latin words are retained as lower-case written words. No English pronunciation
  dictionary is consulted by this matcher.
- Ranking: normalized exact text, then equal sound key, then Chinese given-name
  match, then matching individual English word. Only the first three candidates
  are returned. Ties retain list order.
- Main immediately selects the first candidate for read-back. A later visitor
  confirmation is required. A correction to a different candidate needs its own
  read-back. These caption names never authorize private-memory access.

Sources: `src/main/studio/guest-names.ts`, `src/main/studio/studio-runtime.ts`
(`set_name`, `reject_name`), `src/renderer/realtime/realtime-session-adapter.ts`
(`studio_set_name`), and `src/renderer/console/ExperiencesEditor.tsx`.

## Fresh measured cases

These are **synthetic name-string probes**, not recorded visitor speech and not
an estimate of recognition accuracy. [Complete measurements](guest-name-audit-2026-10-24.json).

| Input name string | Listed spelling | Current outcome |
|---|---|---|
| 王小明 | 王曉明 | Match |
| 陈晓明 | 陳曉明 | Match |
| 陳晶 | 陳靜 | Match |
| 王小敏 | 王曉明 | Match through in/ing folding; potentially ambiguous |
| 程美玲 | 陳美玲 | Match through en/eng folding; potentially ambiguous |
| 曉明 | 王曉明 | Given-name match |
| 張自豪 | 張志豪 | No match; z/zh is not folded |
| 山雅婷 | 單雅婷, assuming the surname is pronounced shàn | No match; dictionary key uses dān |
| 岳明 | 樂明, assuming 樂 is pronounced yuè | No match; dictionary key uses lè |
| Wang Xiao Ming | 王曉明 | No match |
| AMY CHEN | Amy Chen | Match |
| Amy | Amy Chen | Word match |
| A M Y | Amy | Match after space removal |
| OConnor | O’Connor | Match after punctuation removal |
| Aimee | Amy | No match |
| Shawn / Shaun | Sean | Both miss |
| Steven | Stephen | No match |
| Catherine | Katherine | No match |
| Mark | Marc | No match |
| John | Jon | No match |
| Jose | José | No match |
| 艾米 | Amy | No bilingual alias mapping |

All **seven selected English sound-alike pairs missed**. This includes two
different inputs for Sean. The bundled pronunciation resource contains 126,052
English entries and covers these names, but the guest matcher uses only its
Chinese character table. Six of the seven pairs already have identical English
phonemes after stress removal. Catherine/Katherine have a vowel difference in
that resource and need a tested near-sound or operator-alias path.

Across the deliberately challenging feature matrix: 12 of 25 intended positive
cases matched, and all three negative controls were rejected. These totals are
coverage probes, **not** an event-name accuracy percentage. Polyphonic and
bilingual examples assume the explicitly stated pronunciation/alias; the app
cannot infer a particular person's preference reliably from spelling alone.

## Additional critical findings

### P1 — English UI promise exceeds implementation

The name-list explanation says matching uses spelling and pronunciation without
limiting that promise to Chinese. English homophones instead produce an empty
shortlist. In `prefer`, an ASR/model spelling can therefore become an unlisted
caption; in `only`, an actually listed guest can be repeatedly rejected.

### P1 — Ambiguity can repeat the rejected candidate

A Main integration probe used four guests sharing the given name 曉明. It
returned only the first three and read back the first, 黃曉明. After denial, the
same input produced exactly the same shortlist and read back 黃曉明 again.
There is no remembered exclusion of a rejected candidate or distinct ambiguity
resolution step. The fourth candidate cannot be reached from that same query.
Providing a distinguishing full name/character explanation can work, but repeating
the same sound does not advance through candidates.

Exact text and list order can rank one candidate first; neither establishes the
speaker's identity. The later confirmation guard is necessary and must remain.

### P2 — Duplicates occupy the complete shortlist

The UI/parser accepts duplicate entries, and the matcher does not deduplicate.
A probe with three 王曉明 entries followed by 王筱明 returned 王曉明 three times.
The useful alternative was excluded from the three-result limit.

### P2 — Chinese variants, pronunciation overrides and aliases are incomplete

Single-character dictionary lookup cannot resolve all personal-name readings.
Near-sound classes beyond the two nasal merges are absent. There are no per-name
pronunciation overrides or Chinese/English aliases. Entering two spellings on two
lines creates two independent entries, not an alias relationship. Also, an
English surname alone such as Chen matches every full name containing that word,
so it must remain an ambiguous suggestion rather than a positive identification.

### P2 — Confirmation depends on reproducing the exact caption string

The renderer accepts `confirmed=true` only when the model supplies exactly the
name previously read back, in a later visitor turn. A case/script/spelling
variant is downgraded to another unconfirmed name. This prevents confirming an
unheard correction, but ties acknowledgement to the model reconstructing the
caption string. It compounds the earlier confirmation-loop risk. Existing
integration tests protect this boundary; they do not establish human success.

## Performance and verification

- **78/78 existing focused tests passed**, exit 0:
  `node node_modules/vitest/vitest.mjs run tests/unit/studio-guest-names.test.ts tests/unit/realtime-session-studio.test.ts tests/unit/studio-runtime.test.ts`.
- Two temporary diagnostic tests exercised the 28-case matrix, ambiguity,
  duplicates, 1,000-entry latency, and rejection/re-entry. They passed their
  characterization assertions; the missed intended matches above remain defects.
  The first probe run's console output was suppressed by the test configuration;
  it was rerun once with explicit synthetic-result capture. The source probe and
  scratch outputs were removed after retaining the measurements.
- On this Mac, 50 warmed searches of a 1,000-entry synthetic list: Chinese median
  **1.34 ms**, p95 **2.09 ms**; English median **0.71 ms**, p95 **0.75 ms**.
  This measures local lookup only, not cold dictionary loading, ASR, model choice
  or network latency. Lookup speed is not the name-loop bottleneck.
- No Electron launch, provider call, physical microphone input, audio-volume
  change, production setting edit or runtime deployment was performed. This
  audit does not certify the owner's voice or an actual event guest roster.
- Active config hash remains
  `336abd36578bd17422ff80fdbf0e532bcc8411fae5a7a59078e6a97dd82ad64d`;
  draft `d9c62c4a890794741a0a95396585587422c46187b697fd2aba88cb5638758b07`.

## Bounded repair and acceptance criteria

1. Use the existing English phoneme resource for candidate ranking; preserve
   exact-spelling priority and test close-name negatives/ambiguity as well as hits.
2. Add operator-owned pronunciation/alias fields for exceptional Chinese readings,
   uncommon English names and intentional bilingual equivalents. Deduplicate the
   canonical list before applying the shortlist limit.
3. Resolve ambiguity explicitly. Do not immediately offer the same rejected
   candidate for the same sound without asking for a distinguishing detail.
4. Confirm the pending read-back through an application-owned step receipt rather
   than asking the model to reconstruct an arbitrary name string. Corrections
   must still receive a fresh verbal read-back; no automatic confirmation.
5. Add a local “Test name matching” UI so the operator can verify expected inputs,
   canonical results, ambiguous names and misses before publishing.
6. Run exact, homophone, near-sound, unrelated, duplicate, four-plus-candidate and
   correction cases through Main and the renderer. Then run Chinese/English real
   provider visits and human Jabra acceptance against an authorized roster.

These are proposed repairs and acceptance gates. None is represented as already
implemented by this audit.
