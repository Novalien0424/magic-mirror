# Compact repository handoff assimilation — 2026-11-14

Clock-in: clean `field/macmini-deploy`, `e034e02`. Reviewed all 320 reachable
commit subjects (August–November), current product/decision/open-work documents,
the current and two preceding handoffs, and linked recent repair reports.
This reconciles Claude's handoff with repository history; it is not a claim of
line-by-line review of every patch or exact authorship (commits use owner identity).

- **Runtime:** canonical Mac, LaunchAgent alone owns restart. No production/QA
  overlap or build while production runs. Keep diagnostics metadata-only.
- **Deck/loops:** no default Stream Deck profile; otherwise focus changes replace
  Music keys. Repeated MUSIC LOOP/folder preserves playback. Commands serialize,
  STOP cancels pending starts; failed video startup cannot wedge START. Players
  have bounded recovery. [Audit](audit-fixes-2026-11-08.md),
  [Deck evidence](stream-deck-page-2026-11-14.md).
- **Sound:** Music output → Capture input → Airfoil split fixes the two-second
  echo. Voice stays Jabra; first conversation resets separate call volume.
  Jabra/A1 remain connected through STOP; fresh A1 settles 6.5 minutes. Loops wait
  for final route. Dormant music disables wake; Active music excludes Jabras.
  Defaults: Jabra 80%, A1 65%, Edifiers 50%, mini 1%.
  [Sync](airfoil-sync-2026-11-08-followup.md).
- **Discovery:** missing multicast hid healthy Edifiers. Direct-reply Bonjour
  fallback and idle-only network self-heal are installed; fault playback/heal
  remain unproven. Second Edifier offset is −0.130 s.
  [Sound evidence](sound-system-2026-11-14.md).
- **Raven/Studio:** interrupted farewell sleeps; cancelled/refused sleep unmutes.
  YouTube IDs must have been searched in-session. Explicit online requests have
  guarded autoplay. Studio settings bind at visit start; name confirmation binds
  to its read-back; paint/keepsake deadlines and bounded image retry apply.
  Auth/quota pauses visits; early abandoned visits do not paint.
  [Audit and remaining limits](audit-fixes-2026-11-08.md).
- **Camera:** temporary minimum-advertised-format/rate ruling supersedes HD-only
  acceptance. Old 96×96/5 fps is device evidence, not a universal requirement.
  Separate ordinary-look/portrait permits require consent/countdown; frames stay
  in RAM. Capture follows Waking/Active; targeted recovery preserves other USB
  devices. Old native stills failed stability; public portrait journeys proved
  application flows, not optics. [Camera evidence](low-camera-image-journeys-2026-10-21.md).
- **Limits:** human voice/likeness/listening, physical Deck presses, long camera
  soak, provider loop-selection misses and late Studio session rollover remain
  distinct from automated passes. Face recognition remains future scope.

Current authority and open work remain [DECISIONS](../../DECISIONS.md),
[PROGRESS](../../PROGRESS.md), and [TODO](../../TODO.md); this note is a compact
orientation index, not a competing specification.
