# Realtime Voice Agent — Implementation Guide

Research + battle-tested implementation notes for building a realtime
conversational voice device (far-field mic, speaker in the same room,
optional camera). Distilled from a full research sweep of the Aug-2026
state of the art plus a complete, reviewed implementation round on the
Reachy Mini companion robot (`gpt-realtime-2.1-mini`, Taiwan Mandarin).
Written to be reused for a new device (e.g. a magic mirror): everything
here transfers to any always-on, no-wake-word, speaker-and-mic-colocated
build.

Source projects:
- Research synthesis: `Reachy-companion/docs/research-realtime-voice-best-practices.md`
- Implementation: `Reachy-companion` commits `40acd1f..b4e154f` (2026-08-25),
  decision record D-023, plan with 3-round review log in
  `docs/plans/2026-08-25-voice-robustness-plan.md`.

---

## 1. The one-paragraph mental model

No frontier speech-to-speech model solves "don't respond to speech that
isn't for you." Measured reality (τ-Voice benchmark, Mar 2026): OpenAI's
realtime stack has **6% selectivity** — it answers ~94% of backchannels and
non-directed speech. Every serious 2026 production stack therefore wraps the
model in a **cascade of gates**, each able to veto a turn:

```
mic → [hardware AEC/beamform] → [noise reduction] → [VAD]
    → [semantic end-of-turn]  → [addressee / interaction-state gate]
    → [state-dependent interruption policy] → commit turn → respond
```

And because no gate classifies perfectly (especially backchannels — nobody
ships a reliable classifier, it's on every vendor's roadmap), the second
principle is: **make misclassification cheap**. Pause instead of cancel;
roll back instead of destroy; log every gate decision so you can tune from
the journal.

## 2. Model choice (as of Aug 2026)

| Model | Verdict for a home device |
|---|---|
| **OpenAI gpt-realtime-2.1 / 2.1-mini** | Best latency of top tier (1.21 s), most mature tool calling/MCP, 128k ctx. Mini = ~3× cheaper ($10/$20 vs $32/$64 per 1M audio tokens), same API. Weakest of top tier on Mandarin nuance. **Recommended default; mini first, env-switch to full if tool quality suffers.** |
| Qwen Audio 3.0 Realtime Plus | #1 on the AA speech-to-speech index (84.1%); native-grade Chinese; ships **voiceprint speaker-lock** (enroll ≤5 clips, session ignores other voices) — strongest shipped multi-speaker primitive anywhere. +330 ms latency, China-region API. Benchmark-worthy for a known-primary-user device. |
| Gemini Live | Its `proactive_audio` (model decides NOT to answer non-directed speech) is the only model-layer addressee solution — but it's stuck on a 2025 preview model; **Google dropped it in Gemini 3.1**. Don't switch for it. |
| ByteDance Seeduplex | Chinese-first, natively full-duplex, claims −50% false replies/false barge-ins. China cloud only. Watchlist. |

Key caveat: no public benchmark tests noise/far-field/multi-speaker for the
commercial realtime APIs. MUSA (arXiv:2605.17225) shows audio-LLMs collapse
95.5%→24.2% under cocktail-party speech — assume that risk applies and
engineer around it client-side.

## 3. OpenAI Realtime API — settings that matter

Everything below is the GA API shape (`session.audio.input.*`; the 2025
beta shape was removed 2026-05).

### 3.1 Turn detection (VAD)

```jsonc
"turn_detection": {
  "type": "server_vad",
  "threshold": 0.7,            // default 0.5; raise for far-field/noisy rooms (band 0.6–0.75)
  "prefix_padding_ms": 300,    // keeps onsets; don't go lower for tonal languages
  "silence_duration_ms": 800,  // default 500; 700–900 for conversation
  "interrupt_response": false, // take cancellation authority client-side (see §6)
  // "create_response": false  // only if the CLIENT decides when to answer (party mode)
}
```

- `server_vad` beats `semantic_vad` for noisy rooms: semantic has **no
  threshold knob** and community reports say even `eagerness:"low"` is too
  eager and misses short Mandarin answers (「對」「好」). Keep semantic as an
  env-switchable A/B, not the default.
- **`silence_duration_ms` is load-bearing for barge-in logic**: the
  `speech_stopped` event *cannot fire earlier* than this. Any client timer
  that asks "is speech still open?" must wait LONGER than this value or it
  will always see "yes" (we shipped that bug; see §6 pitfall #1).
- `turn_detection: null` is valid and means the server can never commit a
  turn — the boot-gate primitive (§5).
- Do NOT enable `idle_timeout_ms` on an ambient device — it makes the model
  speak into silence.
- Set turn_detection explicitly and read back `session.updated`; documented
  defaults are contradictory across sources.

### 3.2 Noise reduction

`"noise_reduction": {"type": "far_field"}` — runs **before** the VAD,
explicitly framed by OpenAI as false-positive reduction. A device on a
wall/table is textbook far-field. If your device has a hardware DSP doing
AEC/beamforming already (XVF3800-class), nobody has published whether
stacking helps or hurts — **A/B on-device** (off / near_field / far_field),
measuring false `speech_started` rate AND transcript WER; they can move in
opposite directions.

### 3.3 Input transcription (July 2026 features)

```jsonc
"transcription": {
  "model": "gpt-transcribe",          // whisper-1 / gpt-4o-transcribe are retiring (by 2027-01)
  "language": "zh",
  "keywords": ["<device name>", "<nicknames>", "<room words>"],  // biasing — new Jul 2026
  "prompt": "與家用裝置的台灣中文對話"   // free-form context; measured +6pt semantic accuracy
}
```

- **Keywords close the name-gate loop**: if your addressee gate matches the
  device's name in the transcript, mis-transcribed names silently break it.
  Bias the ASR toward the exact names the gate greps for.
- The transcript comes from a **separate ASR model** and can diverge from
  what the realtime model actually understood — treat it as a rough guide.
  If a gate depends on it, keyword-bias it; for high-stakes cases use
  out-of-band transcription (a second `response.create` with
  `conversation:"none"` asking the same model to transcribe verbatim).
- Ship a **legacy fallback**: if `session.update` with the new shape is
  rejected, retry once with `{"model":"gpt-4o-transcribe","language":...}`
  and log a warning. The device must boot either way.

### 3.4 The official "don't answer that" pattern — `wait_for_user`

OpenAI's prompting guide ships this; it is the single highest-ROI feature
for an ambient device. A no-op tool:

```json
{ "name": "wait_for_user",
  "description": "Call this when the latest audio does not need a spoken response, such as silence, background noise, music, TV audio, side conversation, or speech not addressed to the assistant. This tool helps end the turn without a spoken reply.",
  "parameters": { "type": "object", "properties": {}, "required": [] } }
```

Wire it so a tool call with this tool produces **no** follow-up
`response.create` (a `needs_response=False` flag in your tool layer).
Why it works: realtime models are bad at "respond with nothing" but good at
calling tools — an affirmative action that ends the turn beats prompt-only
suppression. Every call is a countable log line for tuning.

Paired prompt block (adapt language; ours is Taiwan Mandarin):

```
### 不需要回應的聲音
如果最新的聲音是：安靜、背景噪音、音樂、電視聲、旁人之間的對話、
或不是對你說的話 — 呼叫 wait_for_user 工具，然後保持安靜。
呼叫後不要再說話。不要說「我在這裡」「我沒聽清楚」「慢慢來」。
只有當使用者清楚地對你說話或請你幫忙時才恢復回應。

### 聽不清楚時
- 只回應清楚的語音或文字。
- 聽不清楚時，用一句簡短的台灣中文請對方再說一次。
  同樣的澄清句不要連續說兩次。
- 模糊、吵雜、只有雜音、被切斷、或你不確定對方確切說了什麼 —
  都算聽不清楚。聽不清楚時：不要猜測、不要推理、不要呼叫其他工具。

### 語言
預設使用台灣中文。只有在使用者「明確要求換語言」或「用另一種語言說出
完整的請求或問題」時才換語言。不要因為口音、語助詞、簡短的附和、人名、
或夾雜的外語單字而切換語言。
```

Notes that matter: the "never repeat the same clarifier twice" line prevents
the broken-robot loop; "don't reason on unclear audio" saves latency; the
"substantive utterance" language rule stops one stray English word (TV,
guest) from flipping the session language. OpenAI's cookbook found single
word choices load-bearing ("inaudible"→"unintelligible" measurably helped).
If your persona/instructions can be overridden by a user-editable file,
compose these blocks in CODE after the override — otherwise they silently
vanish.

## 4. Backchannel filtering

Mandarin/English backchannel lexicon that worked (deny-list for turn
gates; tokens casefolded, punctuation stripped):

```
嗯 對 好 是 喔 欸 哦 唔 呵 哈 哼 好的 是喔 這樣 真的
yeah yep ok okay mm hmm uh huh uh-huh mm-hmm right sure
```

Two normalizations are essential for Mandarin (ASR inserts no spaces):
1. **Repeat collapse**: 嗯嗯嗯→嗯, 哈哈哈→哈 before lookup.
2. **CJK atom segmentation**: an unspaced run counts as backchannel if it
   segments entirely into lexicon atoms (嗯哼, 好喔, 這樣喔). Without this,
   every multi-syllable filler classifies as real content.

`is_substantive(text)` = ≥2 content chars AND not backchannel. Critical
ordering rule: **control phrases (停/閉嘴/安靜/stop/quiet) are checked
BEFORE the backchannel/length gates and always win** — a device you cannot
silence because it decided you weren't talking to it is worse than any
false positive. (停 is 1 char and would fail a length gate.)

## 5. Boot / onset: the self-trigger problem

Named failure: AEC is an adaptive filter that needs convergence time; at
every silence→playout transition (and worst at boot) the device's own voice
leaks through the mic as "user speech." Agents "interrupt themselves right
when starting to talk."

**Boot sequence that eliminates it structurally:**
1. Open the session with `turn_detection: null` (server cannot commit turns,
   no matter what the mic hears — servo noise, boot chimes, people reacting).
2. Play the greeting (if any) while gated.
3. On the greeting's `response.done`, **wait for playback to actually
   drain** (poll your audio-output bookkeeping ~100 ms, cap ~3 s) —
   `response.done` fires when *generation* ends, seconds before the speaker
   finishes *playing*; releasing there lets the greeting's tail commit the
   first turn.
4. `input_audio_buffer.clear` (discard everything heard while gated).
5. `session.update` with real VAD settings. Log a distinct line
   (`boot gate released (...)`) — it's your on-device verification hook.
6. Fallback timer (~8 s) in case the greeting never completes; no greeting
   configured → release immediately.

Race rules learned the hard way (all found by review, all real):
- The release path must **never cancel its own task**.
- Timer tasks must **bind the connection object** they were born under and
  no-op if `self.connection` changed (a stale timer from a dead session
  must not touch a reconnect).
- Cancel the timer in the session's `finally`.
- Reconnects mid-conversation skip the gate (discriminate on
  "greeting already sent").
- If any other code path can push a VAD `session.update` (a mode-toggle
  tool), it must defer while gated.

**Onset amplitude ramp** (cheapest fix in the whole corpus): fade each
reply's first **~120 ms** linearly from silence, continuous across audio
chunks, applied to the PCM *before* any voice-FX/resampling. Gives the AEC
low-energy material to converge on; inaudible to humans. Re-arm the ramp
whenever you resume paused audio (see §6) so the resume doesn't pop.

## 6. Barge-in: pause-then-decide with rollback

The old default (server `interrupt_response: true` + client flush on
`speech_started`) means **any VAD blip destroys the reply**. The 2026
production pattern (and what we shipped):

**State machine** (only active while the device is audibly speaking):
1. `speech_started` → **pause playback, don't flush.** Divert outgoing
   audio into a held-audio buffer. The user perceives an instant polite
   stop; nothing is destroyed yet. Keep non-audio outputs (transcripts,
   tool results) flowing — only hold audio.
2. Decide on the first evidence that arrives:
   - Speech **sustains past the confirm window** → real barge: cancel the
     response, flush queue + held audio, short cooldown (~800 ms) so
     flutter can't re-trigger.
   - Transcript arrives: **control phrase → real barge, always**;
     substantive → real barge; backchannel/empty/failed → **rollback**.
   - Speech stopped and no transcript within ~2 s → rollback.
3. **Rollback = resume the sentence** from the held audio, re-arm the onset
   ramp, log it. A wrong pause costs a 1–2 s hiccup instead of a murdered
   sentence.
4. **Watchdog** (~1.5 s after a real barge): with `interrupt_response:
   false`, a turn that commits while a response is still active can lose
   its auto-response (server allows one active response per conversation).
   If no response appeared and the user isn't still talking, client-create
   one. Skip the watchdog if the answer is already live.

**Pitfalls we shipped and had to fix — check these in any port:**
1. **Confirm window vs VAD silence window.** `speech_stopped` cannot fire
   before `silence_duration_ms` (800 ms). A 250 ms confirm therefore ALWAYS
   saw "speech still open" and confirmed every cough — the entire rollback
   path was unreachable dead code that still passed unit tests (the tests
   injected an event ordering the live API can't produce). **Confirm must
   exceed silence_duration + blip length; we use 1400 ms**, plus a startup
   warning if the two knobs are ever configured to race. Perceived stop
   latency is unaffected — the pause already silenced the device at onset.
2. **Idempotent resolution.** Clear the "pending" flag on ENTRY to the
   commit path (before any await), and put flush+resume in `finally` — a
   concurrent transcript event or a mid-await task cancellation must not
   double-commit or strand the paused state.
3. **The flush path calls your external-interrupt hook.** If your console/
   RPC "stop" handler resets barge state, and your commit path calls the
   same flush, the flush can wipe state (e.g. speech-open) that the commit
   still needs — save/restore around it. Test with the REAL wiring, not a
   mock flush.
4. **Audio-drain accounting must know about the pause.** If the play loop
   idles during a pause, its "queue empty" signals will convince your
   audibility/music-resume logic the device went silent. A `paused` flag in
   the drain module: `is_audible()` forced true, queue-empty no-op,
   `wait_drained()` blocked, cleared on resume/reset.
5. **Don't cancel the answer to the barge.** If the new turn's auto-response
   was accepted before your cancel ran, `_active_response_id` is the ANSWER
   — capture the paused reply's id at pause time and only cancel that.
6. **Thread-safety:** if an RPC/UI thread can trigger the interrupt hook,
   marshal `task.cancel()` via `loop.call_soon_threadsafe`.
7. Keep a **full legacy revert env** (`SOLO_CLIENT_BARGE=0` → the exact old
   path). New turn-taking machinery meets reality on-device; you want a
   one-line way back.

Residual known edge (documented, not fixed): a barge that begins during the
tail *drain* of an already-completed response captures no paused-id, so a
follow-up response starting inside that pause isn't cancelled.

## 7. Multi-person: the addressee gate

Decision order that survived review (party/group mode, client owns
`response.create` via `create_response:false`):

```
1. control phrase        → ACCEPT (unsuppressible)
2. is_backchannel        → DENY  (even inside the follow-up window)
3. device name in text   → ACCEPT (keyword-bias the ASR toward these names)
4. follow-up window      → ACCEPT (~20 s after last accepted turn)
5. engaged face + substantive → ACCEPT (see below)
else                     → DENY silently (turn stays in context; log it)
```

- Reset the follow-up window and speech state at **every session start** —
  carry-over context admitting/suppressing the wrong person is the top
  documented hazard of interaction-state gates.
- Debounce barge-in separately in group mode (~400 ms sustained-while-
  audible) — most speech isn't for the device, so don't pause on every
  ambient onset; only cancel on sustained speech.
- Research grounding: interaction history is the strongest addressee
  signal — the SAS paper (arXiv:2604.08412, benchmarked on Reachy Mini
  hardware) measured an 8-second rolling-context stage worth **−0.38 F1
  if removed**, more than the classifier and beamformer combined. VAD-only
  addressee routing scores 0.15 F1. A hand-written state machine over
  "who spoke last / how long ago / was the device addressed" captures much
  of this.

**The camera is the best signal you own.** Face-based addressee ID beat
voice ID 80–95% vs 18–27% in a directly comparable robot study; SAS
audio+video hits 0.95 F1 vs 0.86 audio-only; Alexa gates wake-word-free
barge-in on being in-frame and facing the device. Implementation that
worked with zero new vision code: read your existing face tracker's cached
state (presence + horizontal center + timestamp). A frontal-biased detector
(YuNet-class) makes *presence itself* an orientation proxy. Thresholds:
fresh within ~3 s, |x| ≤ 0.4 of frame center. Two traps: (1) verify which
CLOCK the tracker's timestamp uses (ours was `time.monotonic()`, not wall
time — the wrong comparison makes the gate silently always-false); (2) wrap
the read in try/except → False, and treat face as a *soft widener*
(face + substantive content), never a hard requirement — guests without
enrolled faces must still be able to say the device's name.

## 8. Env-knob surface (what we exposed; defaults that shipped)

```
REALTIME_MODEL=gpt-realtime-2.1-mini
REALTIME_VAD_TYPE=server_vad          REALTIME_VAD_THRESHOLD=0.7
REALTIME_VAD_PREFIX_PADDING_MS=300    REALTIME_VAD_SILENCE_DURATION_MS=800
REALTIME_NOISE_REDUCTION=far_field    # off|near_field|far_field — A/B on device
REALTIME_TRANSCRIPTION_MODEL=gpt-transcribe
REALTIME_TRANSCRIPTION_KEYWORDS=<device names, room words>
REALTIME_TRANSCRIPTION_PROMPT=<one-line context>
REALTIME_PROMPT_HARDENING=1           # kill switch for §3.4 blocks
REALTIME_MIN_TURN_CHARS=2
REALTIME_ONSET_RAMP_MS=120
REALTIME_BOOT_GATE=1                  REALTIME_BOOT_GATE_TIMEOUT_S=8
REALTIME_SOLO_CLIENT_BARGE=1          # 0 = full legacy barge-in
REALTIME_BARGE_CONFIRM_MS=1400        # MUST exceed VAD silence duration
REALTIME_BARGE_ROLLBACK_TIMEOUT_S=2.0 REALTIME_BARGE_COOLDOWN_MS=800
REALTIME_PARTY_DEFAULT=0              REALTIME_PARTY_BARGE_CONFIRM_MS=400
REALTIME_PARTY_FOLLOWUP_S=20          REALTIME_PARTY_ADDRESS_NAMES=<names>
REALTIME_PARTY_FACE_GATE=1            REALTIME_PARTY_FACE_FRESH_S=3.0
REALTIME_PARTY_FACE_CENTER=0.4
```

Every behavior change behind a knob with the old behavior recoverable —
turn-taking feel can only be tuned on the physical device, and you will
tune it.

## 9. Verification approach

- Build the regression set on **Full-Duplex-Bench v1.5's four event
  categories**: real interruption / backchannel / talking-to-someone-else /
  background speech — recorded in the actual room, in the actual language.
  Test false positives and false negatives as separate scenarios; change
  one knob at a time.
- Production bars from the field: false-barge-in **&lt;2%** (&gt;5% "feels
  broken"), barge-in handling &lt;150 ms perceived, turn-gap 300–500 ms.
- Make every gate decision a **distinct journal line** and list the exact
  line per feature as its acceptance check. Ours:
  `boot gate released (greeting played)` · `party gate: denied ambient turn`
  · `party gate: accepted via engaged face` · `barge-in rolled back;
  resuming reply` · `wait_for_user: model chose not to respond` ·
  `session.update rejected; retrying with legacy transcription shape`.
- Unit tests + fake connections prove the state machines; they cannot prove
  the timings or live-API assumptions (e.g. the server's one-active-response
  rejection that the watchdog relies on). Track those explicitly as
  "implemented-unverified" until a live pass.

## 10. Do-not list

- Don't use an LLM to classify turn-ends (12 ms specialists beat GPT-5.1 by
  7 points at 100× the speed — JAL-Turn).
- Don't trust `interrupt_response:false` semantics blindly (community
  reports it unreliable on WebRTC; on WebSocket the client owns playback
  anyway — design for client authority).
- Don't enable `idle_timeout_ms` on an ambient device.
- Don't put behavior rules only in a user-overridable persona file.
- Don't let raw VAD commit consequences: no flush, no cancel, no language
  switch, no turn acceptance directly off `speech_started`.
- Don't switch to Gemini for proactive audio (dropped in 3.1) or plan
  around OpenAI "stay quiet" demos (prompted behavior, not an API feature).

## 11. Key sources

- OpenAI: realtime VAD guide, realtime-models-prompting (wait_for_user +
  unclear-audio + language blocks, verbatim), realtime-transcription
  (keywords/languages), cookbook (prompting guide, out-of-band
  transcription, eval guide), API changelog + deprecations.
- τ-Voice (arXiv:2603.13686) — 6% selectivity measurement.
- SAS / Attention Labs (arXiv:2604.08412) — addressee detection,
  benchmarked on Reachy Mini; SAA commercial launch 2026-06.
- Full-Duplex-Bench v1.5 (arXiv:2507.23159) — eval categories.
- MUSA (arXiv:2605.17225) — cocktail-party collapse.
- Ghent multi-party robot study (Frontiers Robotics & AI, 2026-04-15) —
  face ≫ voice for speaker ID.
- LiveKit Turn Detector v1 + TurnHandlingOptions (false_interruption_timeout
  + resume pattern); Pipecat Smart Turn v3.1 (open weights, Chinese via
  synthetic data only — fine-tune for Mandarin); Krisp BVC (background-voice
  suppression pre-VAD, 3.5× fewer false triggers); Vapi
  start/stopSpeakingPlan (backoffSeconds); voiceaiandvoiceagents.com primer
  (AEC onset transient).
- Artificial Analysis speech-to-speech index (model rankings; tests no
  noise/multi-speaker conditions — don't over-trust).
