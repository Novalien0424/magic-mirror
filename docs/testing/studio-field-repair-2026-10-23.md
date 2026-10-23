# Studio field failures and tailnet Console — work record

Owner-reported issues (2026-10-23), all in scope:

1. Studio greeted in English despite Traditional Chinese default.
2. The opening did not ask the visitor's name.
3. Stopping/restarting led immediately to the fallback name 無名之人.
4. After the last answer, Avatar disappeared and the rendering view appeared
   before the drawing announcement.
5. The generated image still looked like the old watercolour style.
6. With no heard answer, Studio requested a redraw and produced an apparently
   identical second image.
7. Any computer on the same tailnet must be able to open and operate Console
   directly in a web browser.

## Acceptance journeys, before implementation

- Fresh Studio wake: exact configured Chinese welcome, then the configured name
  question. Background/early audio cannot skip those lines or start the silence
  timer before the name question completes. No English without an explicit switch.
- Name: visitor supplies a name, Avatar reads it back, later confirmation advances
  to question one. Denial asks again. Only 30 seconds of silence after a completed
  name question permits 無名之人. Stop/restart clears all visit state and timers.
- Questions: configured count/content, first question alone addresses the name;
  each answer receives a short comment. Silence records 未回答 and says
  不回答 也是一種回答. No unintended question consumption.
- Last answer: Avatar stays visible through its comment and drawing cue. Only
  completed drawing-cue playback permits the rendering view and image request.
- Image: actual submitted prompt includes current published minimalist multicolour
  vector art direction; visually inspect a real generated result. Review waits
  for a new visitor turn after the offer finishes. Silence/unclear audio does not
  authorize a redraw. One explicit change creates one revision with a visible
  requested difference; approval goes to transfer/farewell/Dormant.
- Restart/interruption: stop during opening, a question and image work, then start
  again. Each new visit begins with opening/name; old callbacks cannot advance it.
- Browser Console: tailnet-only URL, authenticated tailnet access, same live state
  and validated controls as local Console. Verify navigation, reading/editing,
  save/publish, mode changes, reconnect and error states. Keep credentials and
  private memory ownership in Main. Verify another tailnet client where available;
  distinguish same-host browser checks if no second client can be exercised.

## Findings and implementation

- The opening used the general interruptible greeting path. Early VAD could cut
  it off before the name question, while a generic audio-stop callback armed the
  name deadline. The structured opening now owns the complete welcome/name cue,
  including authored pauses and the output tail. Its existing microphone track
  is temporarily disabled, then restored; no second capture owner is acquired.
  Early/stale narration input is ignored with a metadata reason. Only a completed
  question starts its 30-second silence deadline. Restart clears the visit.
- The last answer changed the visible phase to painting before speech finished.
  Main now retains the Avatar (or previous picture for a revision) until the
  renderer acknowledges completed drawing-cue playback.
- Review previously counted inputs from the beginning of the offer. It now takes
  its baseline after the complete offer and requires a later committed turn with
  nonempty final ASR before revise/accept tools. Silence cannot authorize repaint.
  The prompt handles uncertain speech by repeating the offer, not inventing a
  preference. This is an ordering/evidence guard, not a speech-text regex filter.
- The image prompt said to ignore instructions inside the quoted requested
  change, conflicting with applying that change. The catalog now distinguishes
  visual requests from attempts to override rules. Every edit also carries the
  published art direction. Byte-identical provider edits are reported as failed
  revisions and retain the original picture rather than claiming success.
- Published Raven v21 already contained the requested modern vector style. The
  new live image was visibly multicolour, flat and crisp; the silver-wing revision
  changed the picture. An old-style cause was not established from metadata.
- The first live sample exposed an English line and an overlong comment. Studio
  verbatim cues now explicitly carry the selected language, and the comment
  request puts its short-response task before character tone. Speech remains
  provider-generated; test outcomes below are samples, not a guarantee of every
  future utterance.
- Tailnet Console serves the existing UI and a closed subset of validated Main
  IPC through loopback port 38433, fronted by HTTPS Tailscale Serve on 8443. Main
  retains credentials, private memory and host file selection. Browser requests
  require the configured host, verified tailnet node, origin and RAM-only CSRF
  token. Public Funnel requests, unknown methods, arbitrary files and visitor
  image URLs are rejected. Managed media uses the existing opaque asset resolver.
- Tagged Tailscale nodes omit user-login headers. Authentication therefore checks
  the Serve-overwritten peer IP against local Tailscale node identity, with a
  bounded 10-second cache. The existing public 443 service is unchanged; 8443 is
  tailnet-only. Basis: [Serve identity documentation](https://tailscale.com/docs/features/tailscale-serve)
  and [official proxy header implementation](https://github.com/tailscale/tailscale/blob/main/ipn/ipnlocal/serve.go).
- Browser previews use that computer's default audio output. Native-only actions
  are disabled with explanations. A manual outage test found a stale disconnected
  banner after recovery; successful snapshot polling now clears it without
  reloading unsaved edits. Media stream errors are contained by the HTTP server.

## Manual browser journey

Safari, same Mac, actual HTTPS tailnet URL, isolated `--web-console` profile:

1. Loaded connected Mirror overview, switched Conversation → Interactive Studio;
   wake phrase and live mode changed on screen.
2. Edited opening, name list, question one and art style. Save validated the
   draft, Publish showed explicit confirmation, and Confirm advanced v41 → v42.
   Reload showed v42 and all four edited values persisted.
3. Made an unsaved opening edit, temporarily routed only Serve 8443 to an unused
   backend, observed the disconnected notice, restored the backend and verified
   the edit remained. The stale notice discovered here was fixed; follow-up below.
4. Restored the test script, opened Media library, played/stopped the synthetic
   four-second tone through the browser; the real media resolver returned 206.
   Reviewed the layout visually. Device refresh worked; host folder selection,
   file import and private-memory controls were clearly unavailable remotely.
5. Chrome's existing profile blocked the URL with `ERR_BLOCKED_BY_CLIENT` before
   loading the app. No extension/security setting was changed. Safari loaded it
   with normal certificate validation. HTTP checks also returned 200, including
   a request with a forged incoming forwarded-IP header (Serve replaced it).

The browser tests used synthetic configuration. Production active/draft hashes
are checked again after deployment. No browser permission for microphone/camera
was requested; these controls operate the Mac, not the visitor's browser devices.

## Verification and delivery

Focused verification: final Studio/runtime/tools/HTTP selection **79/79 passed**;
follow-up HTTP checks also cover tagged-node access, public Funnel rejection,
CSRF, method/file restrictions, media ranges, preview assets and actual SSE
delivery. Node and web typechecks and script syntax pass. The broader earlier
selection had 336 passes and one stale tool-catalog expectation; the corrected
expectation and affected selection passed. No full-suite/Electron overlap.

All spoken QA uses synthetic visitor audio through the real WebRTC/ASR/tool/Main/
playback route, real image generation, and minimum physical output volume. These
are not human Jabra microphone acceptance tests. No transcript/audio is retained.

| Run (UTC) | Command suffix / route | Result |
|---|---|---|
| `09-49-39-149Z` | `run-phase4-qa.mjs --studio-journey` | Exit 2: stale image-guard wording assertion after 12 successful checks; corrected. |
| `09-51-54-420Z` | `run-raven-conversation-qa.mjs --launch-agent --scenario portrait_studio --studio-story soul` | Exit 2: 23/25. One English line; one 3-sentence comment. Changed cue language/comment task ordering. |
| `10-02-08-926Z` | `run-phase4-qa.mjs --web-console` | Exit 0 manual fixture; actual HTTPS 403 identified tagged-node authentication gap. |
| `10-08-32-408Z` | `--web-console` | Exit 0 manual fixture; browser journey above. Found stale reconnect notice. |
| `10-11-58-070Z` | `--studio-story soul` | Exit 2: 25/26. All 24 classified lines Chinese; four delivered comments, 1–2 sentences/33–51 characters, no question. Name correction, 4 answers, drawing order, visible revision, transfer/farewell, fresh restart and Conversation-to-Studio entry passed. Exact review-invitation text did not match. |
| `10-20-27-631Z` | `--studio-journey` | Exit 0: **23/23**, 17 captures. Full editor journey, validation, save/reload/publish, name list, question limits, default restore and narrow layout. |
| `10-21-08-301Z` | `--studio-story soul_silence` | Exit 2: 13/14. Stop/restart, silent name and both unanswered questions passed, image generated. Harness falsely matched the earlier deliberately closed visit while awaiting reveal; scoped it to the current entry. |
| `10-25-37-940Z` | `--studio-story soul_silence` | Exit 0: **23/23**. No visitor audio/ASR; one picture, zero revisions. Both silent answers acknowledged, review timed out normally, transfer/printer-deferred/farewell completed, restart asked the name again. All 14 classified lines Chinese; exact offer/farewell and authored pause passed. |
| `10-31-00-231Z` | `--web-console` | Exit 0 manual fixture. Final reconnect notice recovered automatically; unsaved avatar-name edit survived and was restored to Up to date. Built-in Ren rendered at 60 FPS and the Waking motion control took effect. Sticky connection notice visually verified while scrolling. |
| `10-33-44-507Z` | `--studio-story soul` | Exit 0: **26/26**, 428 seconds. Four-question visit, name denial/correction/confirmation, four short comments, drawing cue before rendering, real picture plus one visibly changed revision, exact feedback invitation/farewell, transfer/printer-deferred and fresh name on restart. All 22 classified lines Chinese. No provider errors. |

Every run ID has prefix `2026-10-23T`. Retained
[full failures](studio-field-repair-failures-2026-10-23.txt) include the complete
failed test output and metadata-only live results. A failed run is not counted as
a full journey pass.

Visual review: the three real soul runs produced square transparent PNGs at 1254×1254,
crisp multicolour shapes and the visitor-name-only banner. Each requested silver
wing revision visibly added wings while preserving the central creature and
composition. The local editor's image prompt, default script, name list and
narrow-layout captures were inspected; labels and fields remained readable.
The first failed editor capture showed the updated guard's preview assertion was
stale, not a missing control.

The final visit's comments were 1–2 sentences, 27–52 characters, with no follow-up
questions. The final offer exactly matched the configured 30-character comparison
after normalization. The earlier exact-wording failure remains recorded: provider
speech can vary even when requested verbatim. The silent visit separately proved
zero ASR, one picture and no unrequested revision.

## Deployment and preservation

- Canonical build completed `2026-10-23T10:33:38.693Z`; verified source digest
  `3b4a1b97354b8d0ed0397d88af9f8583db5aa07949f9937232e6ee4129bc637e`,
  output `c6f00fed3d61befedbc4a5471875176884221531ac4de8c1c24f5283a83a4d03`.
- Normal LaunchAgent runtime started at `10:43:01Z`, after all isolated QA exited.
  Main, renderer and web server reported ready. Actual HTTPS returned **200**.
  The deployed Studio button route acknowledged `studio_ready`, mode success,
  TV awake at `10:43:59Z`. Safari shows Raven v21, asleep/listening in Studio mode.
- Deployed browser UI confirmed the Chinese opening/name question, ask-name on,
  four questions, modern vector art style, one revision and default farewell.
  Voice settings remain editable; browser audition controls are replaced by the
  verified instruction to audition on the Mac. The prior saved draft still shows
  **Awaiting publish**; no production edit or publish was performed.
- Production config SHA-256 values match task entry: active
  `336abd36578bd17422ff80fdbf0e532bcc8411fae5a7a59078e6a97dd82ad64d`, draft
  `d9c62c4a890794741a0a95396585587422c46187b697fd2aba88cb5638758b07`.
  Default restoration was exercised in the isolated editor; synthetic edits
  never entered the production configuration.
- QA audio guards restored their captured levels after each run. Final deployment
  read-back found Jabra at 6.25%; the existing native output-reset helper restored
  **70.08%**, unmuted, and a later read-back after Studio startup confirmed it.
  The owner subsequently clarified that **1% during testing is intentional and
  Jabra must always return to 70% afterward**. The persistent QA instructions now
  require that target on success, failure or cancellation, even when the captured
  starting level was low; a fresh native read-back confirmed 70.08%. Input gain
  was not changed. Other outputs retain their captured settings; the previously
  unknown original internal-speaker level remains 1%.
- Serve 8443 remains private and targets loopback 38433. Existing public Funnel
  443 → loopback 8000 is unchanged. No Tailscale identity response, token,
  transcript, audio or generated image is retained in this report.
- The ten exact owned QA runs in the table are reviewed against this report and
  removed with `qa-artifacts.mjs review`, dry-run `clean`, then `clean --delete`.
  Metadata failure evidence remains in the linked report; owned run directories
  and their markers are removed. Existing
  owner soul deliverables and the Drive upload are outside this cleanup.

## Browser access

Open [Magic Mirror Console](https://macmini-m6-33.tailf9113c.ts.net:8443/) from a
computer connected to this tailnet while Magic Mirror is running. The browser
controls the Mac's existing runtime. Avatars → Interactive Studio contains the
opening, name list, question count/content and image style; Save validates, then
Publish applies the saved draft to the next visit.

File imports/folder selection, private memory, voice auditions, wake calibration
and simulator controls remain in Console on the Mac. Browser voice settings can
be edited/published; the unavailable audition controls are replaced with an
explanation. Managed media and Avatar previews run in the browser. Setup is
`node scripts/configure-tailnet-console.mjs`; it creates the dedicated 8443 Serve
route and ignored Main deployment configuration, preserving the existing 443
service. No new Electron restart owner or public endpoint is added.

Second-computer testing was requested but no SSH host/user was supplied during
this run. Same-host Safari over the real tailnet HTTPS proxy is verified; a
second peer and the operator's human Jabra speech remain explicit acceptance
limits. Chrome's existing-profile client block is separate from the working
Safari/application route. The prior Arducam zero-frame issue was not retested.
