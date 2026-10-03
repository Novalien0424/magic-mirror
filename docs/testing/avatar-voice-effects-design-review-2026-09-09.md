# Avatar voice effects — design review evidence

2026-09-09. Design only; no runtime acceptance or phase promotion.

[Design](../superpowers/specs/2026-09-09-avatar-voice-effects-design.md)

Later implementation under the operator's delay-relaxation instruction is
recorded [separately](voice-studio-implementation-2026-09-09.md). It proves the
replacement stream route, local CSP/worklet and corrected native+WASM reset;
changes latency acceptance to p95 <=180 ms; and disables preview input
transcription. The assessment below preserves the pre-implementation findings.

## Replacement review recovered — 2026-09-09 15:03 Asia/Taipei

Under the operator's new clock-in instruction to ensure Claude works and resume,
launched one replacement Fable/high consult, safe/toolless, USD 2 best-effort
budget. Job `f4482967556545559607b1a358993daa`, idempotency key
`mm-voice-effects-design-fable-replacement-20260909-clockin`.
Started `2026-09-09T06:59:46.893832+00:00`; completed in 161202 ms;
cost **USD 0.757796**. Verdict **concerns**, medium confidence, ten findings.
The result is substantive design critique, not the prior attempted tool text.
[Stored review](../../.artifacts/voice-routing-proof-20260909/fable-review.json).

Attached status failed with the same WNOHANG error. Investigation found and
corrected the actual user-level launcher override; a fresh MCP loaded from that
TOML returned status/result/terminal cancel successfully, exit 0. See
[launcher correction](claude-in-codex-windows-repair-2026-09-09.md).
No second replacement call was made. Historical pending-approval text below
describes the earlier handoff and is superseded by this section.

### Assessment of critique

- Remote-track proof: accepted. The fresh test used actual loopback WebRTC and
  reproduced zero MediaElementAudioSource output with positive controls.
  [Failed routing gate](voice-routing-proof-2026-09-09.md). The suggested
  MediaStreamAudioSource alternative remains unproved as a single audible sink.
- Latency: legitimate concern, not permission to relax the <=80 ms gate.
  [Upstream 1.3.2 header](https://raw.githubusercontent.com/Signalsmith-Audio/signalsmith-stretch/main/signalsmith-stretch.h)
  has 120/30 ms default and 100/40 ms cheaper block/interval settings; output
  latency also depends on split computation. Those constants alone are not a
  measured end-to-end delay. Keep the gate and measure before proposing a change.
- Reset, CSP and non-default output permissions: valid unresolved proof items.
  Console script-src currently allows only self; production worklet loading
  has not been tested. Fresh local-file default setSinkId works without mic
  acquisition; alternate device permission remains unknown. Do not adopt a
  broad CSP change or pre-warmed spare based solely on the review.
- Formant mapping: public wrapper documents formantSemitones,
  formantCompensation and formantBaseHz (zero permits tracking). The proposed
  hardcoded 140/200 Hz bases and extra stored field are suggestions, not accepted
  facts about the operator's provider voices.
- Audition transcription: explicitly disabling input transcription and keeping
  output transcript events out of storage should be covered when implemented.
  No claim of provider-side zero retention follows from local RAM-only policy.
- Completion split: do not adopt automatically. Existing lifecycle uses actual
  playback completion for Listening, idle and rollover; any split requires
  checking those callers. Bypass-state flushing and a prompt interruption gain
  path remain required; exact ramp constants await testing.

External design review is now obtained; this is **not a review pass** or runtime
acceptance. No extra review is needed merely to repeat these findings.

## Self-review

- Verified installed SDK speed serialization and provider documentation: numeric
  speed is provider post-processing; delivery instructions are qualitative.
- Verified SDK getUserMedia fallback and first-track access: preview needs a
  real synthetic silent track, not absent/empty mediaStream.
- Verified Main's shallow snapshot and zero-argument audio-output factory:
  nested effects require copy/freeze and explicit start/rollover propagation.
- Verified selected-avatar draft merge enumerates fields: add both new fields
  explicitly, with regression tests, to prevent silent loss of edits.
- Upstream worklet stop feeds silence, not immediate state flush: interruption
  must reset/dispose while muted and reject stale callbacks.
- Removed generated-audio capture/loop to avoid an unnecessary recording path.
  Local fixture looping and fresh generated auditions cover the tuning need.
- Single-sink routing and DSP delay are proof gates, not established behavior.
  Neither screenshots nor Windows tests establish acoustic/Mac acceptance.

## Requested one-time Fable review

### Recovered after authorized Windows repair

The original job is now confirmed **done** through two fresh repaired MCP
processes; status, result and terminal cancellation all return successfully.
Actual cost: **USD 0.265971**. Primary raw model usage is `claude-fable-5-1`
(USD 0.260460), plus a Haiku helper (USD 0.005511).
The response contains only textual attempted Grep/Bash invocations, no actual
critique. Normalized verdict: **unknown**, confidence low, findings empty.
Do not count this as a completed design review. The normalizer labels its
raw_response.model from the first usage key (Haiku); primary-model attribution
above comes from the full stored modelUsage breakdown, not that label.

No second paid run was launched. Operator approval for one replacement was
requested separately. [Persistent repair and checks](claude-in-codex-windows-repair-2026-09-09.md).

### Original failure evidence (retained)

Used the Claude-in-Codex collaborating-with-claude skill. Free readiness check
reported installed/authenticated Claude Code 2.1.261 and the catalog listed
`fable` / `claude-fable-5`. Exactly one paid consult was launched with:

- Workspace: `C:/Project/magic-mirror`
- Model/effort: `fable` / `high`
- Configuration/access: `safe` / `toolless`; secret-free design and code facts
- Best-effort budget: USD 2; actual cost unavailable
- Job: `3ab2f3b72d2e40ee8b144f8205fa1296`
- Request: `bc7a73a0a56a4aeabcbfa2ce51afa4b3`
- Idempotency key: `mm-voice-effects-design-fable-once-20260909`
- Started: `2026-09-09T05:18:43.197874+00:00`
- Returned outcome/status: `started` / `running`
- Fingerprint: `claude-in-codex/0.1/schema-50`

Subsequent status (including one retry), result retrieval and cancellation each
failed with the tool error:

```text
module 'os' has no attribute 'WNOHANG'
```

There is no recovered review, verdict, final cost or confirmed cancellation.
The launch reports a 1,800-second deadline and 86,400-second record TTL;
maintenance failure means termination must not be assumed. No second paid
launch, substitute reviewer, plugin patch or authentication change was made.
The design received additional self-review corrections after submission, as
listed above; those are not attributed to Fable.

That recovery step is now complete as recorded above. A usable Fable review
still requires a newly authorized paid run; launching/recovering the old job
did not establish a review pass.

## Implementation / QA handoff

The spec contains scoped delivery slices and numerical/audio/Console acceptance
criteria. No Signalsmith install, runtime code, settings publication, Electron
restart, computer-use sound test, commit/push or Mac benchmark occurred in this
design task. Existing motion-loop changes and running app state are preserved.
