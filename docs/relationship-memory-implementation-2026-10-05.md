# Realtime relationship memory — implementation and QA

The October 5 user authorization covers the reviewed design, TDD implementation,
self-review, automated QA and a future large Markdown import. Human voice testing
is deferred. Existing Realtime, transcription and extractor model IDs are unchanged.

References: [architecture](realtime-relationship-memory-design-2026-10-05.md),
[design self-review](realtime-relationship-memory-self-review-2026-10-05.md), and
[implementation plan](realtime-memory-implementation-plan-2026-10-05.md).

## Implemented behavior

- Main owns private SQLite through a serialized worker thread. Schema v1 migrates
  transactionally to v2; existing scopes remain explicit-only and new scopes use
  automatic summaries. Guest keys are random private UUIDs per avatar. Same-name
  people need distinct labels; verbal self-identification is not authentication.
- A separately confirmed spoken turn unlocks a bounded brief. Ordinary responses
  remain immediate; final ASR feeds RAM-only evidence in the background. Only
  completed, attributable, non-control turns can enter summary extraction.
- Configured Responses extraction uses `store:false`, strict proposal validation,
  evidence references, revision checks and scope epochs. Topic summaries, facts
  and commitments persist; raw evidence is discarded. Checkpoints run after six
  eligible turns or 20 seconds and flush at encounter end/orderly shutdown.
- Local pinned Qwen3-Embedding-0.6B uses MLX in a private Python runtime. A revisioned
  index scans the selected person's complete scope, with semantic candidates first
  and keywords as supplemental candidates. The 0.45 abstention threshold is
  provisional, based on synthetic bilingual measurements—not a broad quality eval.
- Correct/forget/policy changes invalidate queued learning. Dependent records and
  vectors are removed together. A persistent cleanup flag prevents stale recall;
  old provider context closes before cleanup acknowledgment. New clean confirmed
  sessions recover an interrupted cleanup. Changed automatic summaries can require
  a clean-session refresh and identity confirmation again.
- Realtime tools suppress stale results after new speech. Briefs are inserted
  without requesting another response and require provider acknowledgment. The
  adapter recognizes current `conversation.item.added`/`done` as well as legacy
  `created` events, following the installed SDK and
  [Realtime conversation documentation](https://developers.openai.com/api/docs/guides/realtime-conversations).
- The Console supports automatic/explicit/off modes, scoped search, edits and
  deletion. Temporary encounters are available without requiring identification.
  Memory drafts survive search and overview navigation; avatar/section changes
  are guarded while editing or importing.

## Importing the forthcoming Markdown

Use **Avatars → Memories**, choose the avatar and a distinct person label, then
**Import Markdown**. The preview shows the number of history chunks and any
separate persona draft. **Import summaries** authorizes sending those chunks to
the configured cloud extractor. Import runs only while Dormant.

Use one person's history per import. Split files mixing different guests first.
The file may contain old transcripts and summaries; no raw source archive is
copied to the memory database. The original file remains in place.

Recognized persona headings include `Persona`, `Character`, `Personality`,
`System prompt`, `Master prompt`, `角色`, and `人設`. For predictable separation:

```markdown
# Persona
The avatar's character and speaking style.

# Past conversations and summaries
History for the selected person, with dates and outcomes where known.
```

Persona text is shown for separate review and manual application in the existing
Persona editor. Import never automatically changes the character. UTF-8 Markdown
is limited to 20 MiB, persona preview to 24,000 characters, and extraction chunks
to 12,000 characters. Progress and cancellation are visible. A stopped import
retains already committed summaries and reports their count.

## Self-review and regression findings

The plan was reviewed before implementation. Independent substantial storage and
embedding work used the exact authorized CLI worker route. Root integrated the
modules, reviewed the final change and ran focused checks. All invariants 1–12
were considered; human identity, acoustic quality and physical hardware acceptance
are not inferred from synthetic tests.

Red tests preceded storage, embeddings, extraction, learning, import, renderer
context/stale-result handling and later regression repairs. Integration found and
fixed date-only extraction timestamps, current Realtime acknowledgment events,
embedding queue IDs under query priority, a delayed Console refresh race, an
index-scheduling race, and cleanup failure reporting. Harness fixes included an
explicit published avatar fixture and waiting for actual greeting completion.
Complete failed runs remain in the task artifact directory.

Repeated natural-provider testing also found a missed remembered-answer assertion
and a model calling recall before identifying a person who had just introduced
themselves. The brief now explicitly supersedes earlier empty searches. Main can
propose a candidate from a narrowly recognized spoken self-introduction when recall
arrives first; a separate verbal confirmation is still required. A red/green test
protects this boundary. The final live run uses natural model tool selection and
passes; an earlier diagnostic run explicitly selected the identity tool. These
small fixtures do not establish reliable recall across arbitrary conversations.

The real-provider QA uses the actual SDK/WebRTC, Main IPC, configured Responses
model, private SQLite worker and local embedding process. Its microphone is a
silent synthetic stream; speech-start/transcription edges are synthetic. It checks
actual provider acknowledgment and remembered speech, not microphone ASR accuracy.
Only comparison flags, counts, timing and reason codes enter evidence.

## Evidence and remaining acceptance

Final focused regression: **258 tests in 23 files passed**. Node/web typechecks,
production build and diff whitespace checks passed.
Final natural-provider live run: [23 checks](../.artifacts/phase4-qa/2026-10-05T04-09-01-242Z/evidence.json).
The normal app was restored through its existing LaunchAgent with operator config
v15 unchanged; [startup metadata](../.artifacts/memory-implementation-2026-10-05/runtime-restored.json)
reports avatar, camera, wake listener and local embeddings ready.
The [task artifacts](../.artifacts/memory-implementation-2026-10-05/) retain red
tests, focused regression logs, build logs, failures and embedding provenance.
The real local embedding smoke measured 1.44 s startup and 14.2 ms mean warm
requests; matched/unrelated mean cosine scores were 0.610/0.177 across two bilingual
fixtures. It also exercised concurrent query/document priority successfully.

The large synthetic import test uses over 1 MiB and over 80 chunks, reopens the
database, checks scope isolation/correction/forget, and verifies raw-history and
persona markers are absent from the file. UI QA exercises the native-picker seam
through production import controls; the real native chooser itself is manual.

Remaining: the user's actual Markdown, long-term recall quality, ambiguous dates,
summary omissions, missed model recall cues, interruption/ASR timing and natural
human conversational flow. No signing, packaging, phase promotion or physical
speaker acceptance is claimed. The prepared development runtime is
`.local/memory-embedding`; packaged deployment requires explicit provisioning at
the app's `userData/memory-embedding` location using
`node scripts/prepare-memory-embedding.mjs --runtime-directory <absolute-path>`.
