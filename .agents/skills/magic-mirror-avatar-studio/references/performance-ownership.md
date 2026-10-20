# Character performance ownership

Use when acting is unreadable, a state freezes, or independently sound channels conflict. Define the state's visible action, attention target, entry, hold/loop, release and eye/mouth owner. Parameter units are not physical degrees. Use [acting foundations](acting-rig-foundations.md) for pose/shape defects; motion curves cannot repair missing lids, joints or feather coverage.

## Readable state behavior

Prove a useful deformation range, then choose performance amplitude and frequency at installation size. Do not hide broken geometry by reducing all motion toward zero. Standby can breathe visibly; attention can perk and tilt; listening nods need discernible down/up action with varied spacing; a thinking hold needs credible hand/contact anatomy. These are character-dependent choices, not compulsory gestures for every avatar.

Check the application's actual state duration before timing a gesture. A late Waking movement may never play if the app has already handed off to Listening. Inspect both the full one-shot and the real handoff; provide visible follow-through before the transition and continued life in the destination state. Establish nod direction from rendered frames, not parameter names or signs. Keep exact timing/amplitudes in the job.

## Parameter ownership

Inspect current runtime order: motion, saved base, physics, breath, blink, expression, output mouth and manual overrides. Assign one owner per channel. Manifest metadata selects special playback; filenames/imported IDs do not. Preserve other models' policy.

Observed Raven profile `MagicMirror: { Version: 1, Performance: "raven-calm-v1" }`: motions own head/body/breath and Dormant/Waking/Suspending eyelids; active-state eyes use automatic blink; generic physics/breath are disabled; face expressions multiply eyelid openness; processed output fully owns mouth opening; manual preview overrides come last. Verify the current renderer before relying on this profile. Keep speech-driven mouth out of state curves and pose smoothing.

Measure chest, head and waist separately when breathing affects a held gesture. Excessive inherited head movement may need a local compensation parent; retain visible chest motion and recheck neck coverage/chin contact across breath. Scale Bezier value controls as well as endpoints when changing amplitude. No universal pixel or amplitude target applies.

## Transition evidence

For a timing/ownership repair, inspect entry, affected interruption/exit and loop boundary. For a local cloth repair, reuse accepted curves and check only the relevant gesture path. New frame rates or full lifecycle tests need a demonstrated timing risk.

A constant gesture target plus SDK fade can enter a held loop, but FadeInTime alone does not predict effective arrival when the app saves blended parameters each frame. The generic QA renderer reloads a fixed baseline; the observed Magic Mirror renderer uses load → motion update → save → effects/manual → Core. Match the current product order in a labeled isolated diagnostic; it still does not exercise the application state controller.

Reset visible parameters and the saved baseline, verify neutral, then clear manual overrides. Use a fresh motion instance and the product's explicit loop/loop-fade flags per entry. Initialize at time zero and advance every frame before sparse captures; a single large tick does not replay elapsed time. Console buttons that reset clips prove individual preview, not a continuous transition. Use [runtime QA](runtime-qa-harness.md) for export checks and distinguish those from actual application playback and user acceptance.
