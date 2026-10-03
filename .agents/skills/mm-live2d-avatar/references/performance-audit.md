# Character performance and acceptance

## Start with intent, not motion inventory

Read the actual lifecycle and interruption paths. For each state write the
character's intent, attention target, eyelid/beak behavior, movement budget,
loop versus one-shot/hold, and entry/exit pose. Parameter units are not physical
degrees. Derive the acting brief from the user's character; do not prescribe
human VTuber gestures for an animal or enforce one sleep behavior globally.

Raven's September 2026 brief: Dormant is closed-eyed rest with extremely slight
movement. Waking is a gentle eye opening and tiny posture adjustment. Listening
waits attentively; Thinking briefly looks aside with a long hold; Speaking lets
audio lead; Scene makes one modest gesture; Suspending settles and closes the
eyes. Finite lifecycle states can be interrupted early or held indefinitely.

Preserve the previous runtime version and source hashes. Explicit versioned
model metadata selects special behavior; do not infer it from imported IDs,
filenames or a Ren expression-name convention. Document the required app code.

## Audit every writer

Inspect motion, saved parameters, physics, generic breath, automatic blink,
expressions, lip sync and manual overrides in their actual update order.
Reduce total movement after composition, not just the motion file's numbers.
Large additive expressions can clamp a subtle authored pose at the rig limit.
Physics can replace an authored body curve. Generic breath can animate head
angles even when a dormant motion looks still.

Assign one owner per channel. Raven V11 motions own head/body/breath and sleep/
wake eyelids; automatic blink owns active-state eyes; manual expressions are
face-only, using Multiply for eyelid openness so a blink stays closed; processed
output audio owns the beak after effects. Silence and interrupt close it.
Manual Console parameter overrides remain last and bypass performance smoothing.
Keep effects out of saved motion bases to prevent frame-to-frame accumulation.

Console can reset, set lifecycle Dormant, then preview a different motion group.
Resolve the effective preview group before applying state-specific effects.
Neutral/reset must disable motions, effects and audio writes as documented.

## SDK behavior to verify

- Motion JSON `Meta.Loop` is not proof of the runtime `setLoop` flag. Configure
  loop/one-shot explicitly on every start, including lifecycle resume.
- Loop position and tangent must meet. Prefer eased cubic curves and meaningful
  holds; avoid incessant sine-driven nods or linear corner reversals.
- Waking/Scene/Suspending must not restart because the lifecycle has not advanced.
  Reach and retain the endpoint; test fades at completion with the actual SDK.
- Preserve continuity on early exits and rapid state changes. Crossfade entries
  must not share mutable motion objects, loop flags or callbacks. Clear callback
  ownership on cancellation and distinguish SDK loop boundaries from completion.
- Verify stop/reset empties the SDK queue even with multiple fading entries.
  The vendored SDK's splice-while-iterating stop implementation can leave entries.
- Smoothing is not a substitute for a good rig. Do not smooth audio timing away,
  accumulate effects, or defeat manual range inspection.

## AI reference images and video

AI stills establish identity, neutral pose, half/closed eyelids, half/open beak
and limited view targets. Inspect bill length, visible eye, skull silhouette,
feather direction, collar, pins and chains. Reject identity drift before rigging.
Different canvas sizes and redrawn clothing mean images are not pixel-registered
replacement layers. Never insert a full regenerated portrait into an atlas.

Generated video can inform timing and weight, but cannot certify a Cubism rig,
produce its editable PSD/CMO, or recover hidden surfaces reliably. Inspect every
frame for topology/identity drift before using it as reference. Use the actual
layered master and Editor for repairs to eyelid shape, beak hinge, overlap and
feather deformation; preserve provenance and export a fresh MOC/atlas together.

## Evidence and delivery

Separate four evidence levels: asset structure, real SDK parameter playback,
current rendered appearance, and canonical Windows integration/artistic approval.
Test interruptions, long holds, loop seams, output onset/offset, reset, sliders
and action completion. A synthetic mouth slider is not output-audio validation.

Inspect at installation size plus eye/beak/neck crops. Compare the original
portrait and accepted reference poses. Check black seams, double edges, eyelid
coverage, rigid beak shape, feather stretch and accessory drift. Review motion
over time, not just sampled stills. Keep visible defects open even if tests pass.

If desktop/browser access is unavailable or policy-blocked, record the exact
boundary and complete the code/artifact work. Do not label an unviewed candidate
as accepted, reuse old QA as new evidence, auto-select the live model, or claim
the inaccessible personal authoring skill was updated.
