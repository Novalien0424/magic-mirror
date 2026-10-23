# Mandarin sound-alike media discovery — 2026-10-23

The owner reported a missing song and explicitly requested pronunciation-tolerant
music search. The live shared catalog contains `天使葛利果女祭司版本`, while the
owner supplied `天使葛麗果女祭司版本`. Both own/shared folder indexes were ready;
seven entries included the priestess version and `天使_intro`. Production metadata
at `13:09:09Z` showed two `media_discovery_no_match` results, including the adapter's
visitor-clue fallback. The old lookup handled literal text and script variants,
not homophones. No transcript was inspected or retained from that conversation;
its precise ASR spelling is unknown.

## Research and design

Spotify documents searching across titles, artists and other metadata, and lyrics
when the title is unknown; this does not document its proprietary Mandarin voice
matching algorithm. [Spotify search](https://support.spotify.com/us/article/search/).
Elastic recommends separate literal and phonetic indexes with different ranking
weights. [Elastic phonetic analysis](https://www.elastic.co/docs/reference/elasticsearch/plugins/analysis-phonetic-token-filter).
Algolia ranks exact matches above tolerant alternatives and bounds tolerance to
reduce unrelated results. [Algolia fuzzy search](https://www.algolia.com/blog/engineering/fuzzy-search-101).

Our local implementation follows those principles:

- Rank literal filenames/aliases first; use a separate Mandarin pronunciation
  key to retrieve sound-alike candidates. Preserve actual catalog names/IDs.
- Use the existing pinned public pronunciation dictionary, including contextual
  phrase readings. No new dependency, remote search or model-ID change.
- Ignore tones and tolerate in/ing, en/eng, zh/z, ch/c, sh/s for media discovery.
  At least two Han characters are needed for pronunciation matching. Keep unknown
  characters, syllable boundaries, title/version clues and the media-kind filter.
- Preserve tied candidates; ask which version rather than selecting arbitrarily.
  A contained artist alias alone stays weak. A missing jazz version cannot turn
  into a priestess-version match. English literal behavior remains unchanged.
- Use `all` when no media type was specified. If a type filter misses, Main
  checks the same authorized catalog across types and returns alternatives with
  `media_discovery_kind_mismatch`; the adapter supplies `next: ask`. The literal
  ranker's requested-kind filter is unchanged. This is discovery/clarification,
  never automatic cross-type playback or online authorization.
- Reuse pronunciation data only: spoken-command authorization, hidden spells,
  stop and wake matching remain separate and unchanged. Queries stay transient;
  `media_discovery_phonetic` is the metadata-only fallback reason.

The versioned `find_media` description tells Raven it can search pronunciation.
No filename edits, extra operator setup or published settings are required.

## Journey and checks

Visitor asks for the priestess title with a sound-alike spelling → local lookup
returns the priestess version → Raven plays it once → conversation resumes.
A title with piano and strings versions → Raven asks one distinguishing question
→ visitor chooses piano → the piano version plays once. No online search is
authorized by approximate matching.

Focused tests cover six priestess-title variants, exact-name/alias ranking,
ambiguous versions, explicit version choice, weak artist clues, unknown text,
syllable boundaries, contextual pronunciation, script variants and current-session
Main IPC/privacy. Existing spoken-command and Realtime adapter/tool checks pass.
The final union is **356/356** tests; the changed fixture count was rerun after its
initial stale assertion, and the final lookup/catalog selection passed **119/119**.
After the type-filter repair, all four affected test files passed **290/290**,
including exact Main cross-type results and adapter clarification/no-online
behavior. Node/web typechecks pass. Full initial failures are retained in
[failure metadata](media-phonetic-failures-2026-10-23.txt).

Real-provider run `2026-10-23T13-17-58-622Z`, exit 2, **8/9 runtime steps**:
all three requested media turns passed. The priestess turn actually emitted
`media_discovery_phonetic`, selected the correct ID and completed playback. The
version turn returned two candidates without playback, followed by correct piano
selection/playback. Three ASR completions; no input-text injection. The quality
judge flagged mechanism narration on the first turn and rated clarification
naturalness/character 2/4. The technical ranking explanation was removed from the
tool description before the single final rerun. This is not a claimed overall
pass. Full metadata is retained without speech, audio or raw provider errors.

The Raven screenshot was visually inspected: correct portrait, black background,
no captions. Synthetic visitor audio travels through real WebRTC, ASR, tools,
Main IPC and fixture playback. These runs do not establish human microphone
recognition or the sound quality of the owner's original music file.

The single provider retry `2026-10-23T13-21-17-189Z`, exit 2, passed **7/9 runtime
steps**. The first lookup incorrectly selected `video`, returned zero candidates
and did not play the music. Version lookup and later piano playback passed their
runtime checks, but the judge still flagged mechanism narration, poor clarification
and an invented fact. Full metadata remains in the failure record. This prompted
the deterministic type-filter repair described above, verified in Main IPC and
adapter tests. No third provider retry was run, following AGENTS' bounded retry
rule. **The final type-filter fix has no fresh provider/human acceptance, and
spoken quality remains unresolved.** This delivery is not a fully green voice QA
claim. The second Raven screenshot was also inspected: correct portrait and no
captions.

## Deployment and preservation

Final canonical build `2026-10-23T13:24:40.148Z`: source
`5f478d8945a9f010d9f13f8347cd405db797196eee56f547605e8f6f6a485862`, output
`3da92977c263790b0e2bef46ebcdccecd57cee88464e6f0b5c5560bed5930eca`.
Build verification passes. Normal Electron was already stopped by the owner at
13:13 before QA. After both isolated runs exited, the normal Start button route
started Main at `13:25:11.799Z`, renderer at `13:25:11.948Z`, and acknowledged
conversation mode/TV awake at `13:25:14.822Z`. Tailnet HTTPS returned 200; both
folder indexes were ready and the actual priestess title remained available.
Production active/draft hashes are unchanged, preserving the saved operator draft
and all Studio defaults. The owner has been invited to try the deployed title;
the live human result is pending.

Each QA run lowered only Jabra output to 1% and restored/read back **70.08%** in
guaranteed cleanup. Mute was 0 and unchanged; no input gain or other output was
modified. A further reset/read-back after normal startup confirmed **70.08%**.
No transcript/audio is retained. Exact task artifacts are reviewed and removed
only after saving the complete failures above; owner deliverables are preserved.
Both runs were reviewed, dry-run checked and deleted with `qa-artifacts.mjs`:
**190 files / 44,197,831 bytes**, excluding markers. All eleven task temporary
logs/audio helpers were removed. The deployed app remains running.
