# Guest name pronunciation repair — 2026-10-24

This implements the [name audit](guest-name-audit-2026-10-24.md). Scope: guest
caption matching, pending-name confirmation, and operator authoring/preview.
Names do not establish identity or grant private-memory access. Production
guest lists and the unrelated saved draft are preserved.

## Research and implementation decision

Primary sources checked on 2026-10-24:

- [CMUdict](https://github.com/cmusphinx/cmudict) supplies English pronunciations
  for speech applications and explicitly acknowledges omissions/inconsistencies.
  [Its format documentation](https://github.com/cmusphinx/cmudict-tools/blob/master/README.md)
  describes stress markers and alternate entries. Magic Mirror already bundles
  a pinned, licensed first-pronunciation dictionary; no download or dependency
  change is needed at runtime. The older CMU CGI site timed out during research;
  the maintained repository was used instead.
- [Unicode UAX #38, readings](https://www.unicode.org/reports/tr38/#Readings)
  warns that individual-character readings cannot determine every proper noun.
  [kMandarin](https://www.unicode.org/reports/tr38/#kMandarin) is a customary
  reading, with regional preferences, rather than an exhaustive personal-name
  pronunciation authority.

Our engineering choice, not a claim made by those sources: rank exact spelling,
operator aliases, dictionary homophones, bounded near-sounds, then complete
given-name/word matches. Always read back and require a later agreement. Avoid
general edit-distance guessing for short names, where distinct guests can be
only one letter/phoneme apart. Test near-negative pairs as well as positives.

English uses the existing CMU phonemes with stress ignored for homophones. A
lower-ranked near match permits unstressed AH/IH variation (Catherine/Katherine)
while keeping stressed vowels and consonants distinct (Tim/Tom do not match).
Chinese retains script/toneless/nasal folding and adds lower-ranked z/zh,
c/ch, s/sh suggestions. It preserves the ü/u distinction. Spaced pinyin can
match Chinese syllables. These rules apply only to guest suggestions: spoken
commands, wake authorization, media matching and identity rules are unchanged.
Accents are folded only for pronunciation lookup: `Jose` and `José` remain
separate caption candidates, exact spelling ranks first, and denying one does
not exclude the other. Final self-review added this regression case.

Dictionary coverage remains finite. Special readings such as 單雅婷 pronounced
shàn, 樂明 pronounced yuè, unusual English names and intentional bilingual
equivalents use explicit operator aliases. This avoids pretending that Amy
automatically identifies every 艾米, or that every 樂 has the same reading.

## Operator journey

1. Console → Avatars → Raven → Interactive Studio → **3 · Name and questions**.
2. Enable **Ask for a name first**. In **Name list for confirmation**, enter one
   canonical spelling per line in **Guest names**. Pasted exact duplicates are
   removed; the matcher also deduplicates normalized spellings before limiting
   the shortlist to three.
3. Optional **Pronunciation and bilingual aliases**: one line such as
   `單雅婷 | 山雅婷 | Shan Ya Ting` or `Amy | Aimee | 艾米`. The canonical name must
   already be in Guest names. Up to eight aliases per line, 40 characters each.
   Invalid references show a field error and block saving. Removing a canonical
   name requires removing its alias line too; it cannot silently become orphaned.
4. Select **Suggest names from the list** or **Only accept listed names**.
5. Enter a possible recognized spelling in **Test a heard name**, then press
   **Test name matching**. This runs the real Main matcher against current edits,
   without publication, provider requests, playback or a visit. Results clear
   when inputs change. It is a text matcher test, not a microphone test.
6. Save all changes → Publish all changes → Confirm publish. Reload preserves
   the name list and aliases. Published changes apply to the next visit.

Matching Off retains settings and produces no preview suggestions. Turning off
Ask for a name disables the name controls and excludes all name tools.

## Visitor journey and confirmation repair

Main chooses a canonical candidate and speaks the existing read-back. The model
waits for the visitor; it no longer receives competing instructions to select
and speak another candidate itself. Agreement calls `studio_confirm_name`
without a name argument. The adapter requires a later visitor turn after cue
playback; Main checks the current step receipt before accepting its own spelling.
No confirmation before read-back, no stale-step confirmation, no automatic
confirmation from a high match score. Corrections still receive a new read-back.

Denial clears the pending name and excludes that candidate for this visit.
Repeating an ambiguous given name can therefore reach the second, third and
fourth candidates instead of repeating the first forever. The shortlist remains
at most three distinct names. Exhaustion in Only mode reasks; Suggest mode can
read back an unlisted name. Thirty seconds of silence retains 無名之人. Restart
clears all rejected candidates and pending state. Repeating a question now also
requires a fresh visitor input, preventing tool-only repeat loops.

The prior `studio_set_name` confirmation path remains compatible with existing
operator prompt overrides. New versioned guidance uses the receipt-based tool.
Alias records remain outside Mirror session settings and model prompts; only
shortlisted canonical names are exposed. Diagnostics retain reasons, not names.

## Verification

Commands and results (all from the canonical Mac checkout):

- `node node_modules/vitest/vitest.mjs run` with the six focused Studio files:
  **152/152, exit 0**. Additional preload, tool catalog, avatar prompt, story and
  web-console boundary files: **63/63, exit 0**. **215 distinct tests** total.
  After the accent distinction fix, the affected matcher/runtime files passed
  again: **52/52, exit 0**. Both `npm run typecheck` projects pass.
- `npm run build` completes and stamps the canonical deployed `out/`. Final
  source `252f2b640c3bc2a674f2d6e55f4534bf805234cad868edbd607e41f74450b0ce`,
  output `f193d345f1968221311422190c7d1f09f1a2bb6a9c3ccf71509675d58560b974`,
  built 2026-10-24 12:39:41 Taipei.
- `node scripts/run-phase4-qa.mjs --studio-journey`: **23/23, exit 0** after the
  preview preload fix. The final build receives the same complete operator
  journey: **23/23, exit 0**. It authors aliases through DOM controls, checks invalid references,
  previews Chinese, English and bilingual matches, verifies stale previews clear,
  saves/publishes/reloads, restores isolated defaults and checks narrow layout.
- `node scripts/run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio --studio-story guest_names_zh --studio-name-only`:
  **8/8, exit 0, one attempt**. Given name → first candidate → denial → repeat
  given name → next candidate → agreement → first question. Zero spelling
  corrections; correct canonical caption; restart asks for a fresh name.
- The same provider command with `--studio-story guest_names_en`:
  **8/8, exit 0, one attempt**. Catherine → Katherine caption → agreement → first
  question; zero spelling corrections; fresh name entry after restart. Both
  providers used the same pre-accent-refinement build; those tested phonetic
  cases and confirmation paths did not change in the final refinement.

Provider evidence: [Chinese](guest-name-repair-provider-zh-2026-10-24.json),
[English](guest-name-repair-provider-en-2026-10-24.json). These are synthetic
microphone/real-provider integrations, **not human Jabra acceptance**, and one
passing sample per story is not an accuracy rate. Name-only runs intentionally
do not generate pictures or retest the unchanged four-question/image ending.

[Checks, failed attempts and benchmarks](guest-name-repair-checks-2026-10-24.json)
retain full captured failures. Development found and corrected a missing brace,
Console bridge type narrowing, stale tool-list expectations and an incorrectly
asserted tool-result shape. The previously audited stale image-prompt assertion
now checks the current substantive injection guard. The first rendered run
clicked before React enabled the preview button; the next exposed the missing
preload allowlist action. Both failures are retained, followed by successful
rendered verification and a dedicated preload forwarding test.

All seven previously missed English sound-alike pairs now pass. Negative probes
reject Tim/Tom, Sam/Sean, Ann/Joanne, mismatched surnames, unrelated Chinese
names, ü/u differences and unknown aliases. Alias-specific tests cover Chinese
special readings and bilingual names. A warmed 1,000-entry list, 50 lookups:
English median 9.44 ms / p95 10.01 ms; Chinese median 2.18 ms / p95 2.51 ms.
These measure local matching, not ASR, cold dictionary loading or provider latency.

Visual review opened the failed UI screenshot, the working name/alias/preview
screen, the narrow Studio layout and both live confirmation screens. The fields
and preview result are readable; the portrait screens show Raven and the correct
name, without conversation captions. Screenshots are task artifacts, removed
after review; metadata and findings remain here.

Invariants 1–12 preserved: no name/transcript/audio diagnostics, no identity or
memory authorization, control-turn ownership and single microphone unchanged,
commands untouched, visible validation/errors, no model/dependency/credential
source changes. The real-provider probes report one enabled live input track at
each name turn, no recovery and no retained transcripts.

## Deployment, settings and cleanup

The latest canonical build is ready for the next START. Normal Electron remains
stopped, preserving the owner's STOP state and native black-HDMI cover. Every QA
run set Jabra output by device identity to 0.97% and restored/read back **70.08%**
through an EXIT trap. No mute, input-gain or default-device changes.

Active configuration remains
`336abd36578bd17422ff80fdbf0e532bcc8411fae5a7a59078e6a97dd82ad64d`;
saved draft remains
`d9c62c4a890794741a0a95396585587422c46187b697fd2aba88cb5638758b07`.
The production Raven lists remain empty; no synthetic guests were published.

Owned artifact roots for review/disposal:

- `2026-10-24T04-29-22-408Z` — first UI failure.
- `2026-10-24T04-31-07-049Z` — preload preview rejection.
- `2026-10-24T04-33-20-016Z` — passing operator journey.
- `2026-10-24T04-33-55-992Z` — passing Chinese provider visit.
- `2026-10-24T04-36-28-329Z` — passing English provider visit.
- `2026-10-24T04-39-58-270Z` — final-build passing operator journey.

Authorized cleanup inventory: **480 files, 96,280,063 bytes**, excluding retained
artifact markers. All six exact roots were reviewed with `qa-artifacts.mjs`;
deletion receipts are retained in the checks JSON. Task-owned `/tmp` helpers,
compiled benchmark/volume code and scratch reports are removed after retaining
metadata. Owner deliverables, synced media and older QA artifacts are untouched.

The separate failed-opening recovery and operator-rescue issues from the broader journey
audit remain open; this repair does not claim to resolve every cause of a name
loop or to certify real-person microphone recognition.
