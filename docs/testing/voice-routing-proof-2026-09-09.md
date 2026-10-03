# Voice routing first proof — Windows, 2026-09-09

Historical failed candidate, preserved. The later user-authorized implementation
proves and uses a muted receiver plus MediaStreamAudioSource; see
[replacement evidence and acceptance limits](voice-studio-implementation-2026-09-09.md).

The proposed MediaElementAudioSource route **failed** before any Signalsmith
installation or runtime integration. The design's section 4 requires stopping
and reporting this constraint. No substitute route was integrated.

## Fresh evidence

Canonical Electron 44.0.0 / Chromium 152.0.7977.54, 48 kHz, 15:02 Asia/Taipei.
Both enabled Private Allow TCP/UDP firewall rules matched the canonical
`node_modules/electron/dist/electron.exe`. No normal Electron process was running.
The hidden, sandboxed test used its own userData directory, denied permission
requests, and loaded a local file. No microphone, credentials, provider session,
operator config or conversation content was used.

Synthetic source: 440 Hz oscillator, amplitude 0.02, into a
MediaStreamDestination. The remote case used two local RTCPeerConnections with
empty ICE server lists and an actual received remote track. Before assigning
srcObject, create one MediaElementAudioSource from the attached audio element;
play at volume 1, unmuted. Source -> analyser -> zero gain -> destination.
An independent MediaStreamAudioSource -> analyser (no destination) verifies
the same stream contains samples. Measure maximum RMS over twenty 50 ms reads.
A three-second mono PCM WAV generated only in RAM is the element-source control.
All tracks, peers, elements, object URLs and contexts were disposed after use.

| Source | Element-source RMS | Stream control RMS | Playback |
| --- | ---: | ---: | --- |
| Local MediaStream | 0 | 0.0142013 | playing, readyState 4 |
| WebRTC remote stream | 0 | 0.0142350 | playing, readyState 4, peer connected |
| RAM WAV control | 0.0141791 | n/a | playing, readyState 4 |

All local-file cases successfully called `AudioContext.setSinkId('')`.
This verifies default-sink API availability, not a physical speaker or alternate
device. Controls pass; candidate fails. This is numerical graph evidence, not
acoustic QA or proof of the element's physical output path.

Command: `& node_modules\electron\dist\electron.exe
.artifacts\voice-routing-proof-20260909\probe.cjs 2>&1 | Out-String | Write-Output;
exit $LASTEXITCODE` — **exit 1**, candidatePassed=false, controlsPassed=true.
Metadata: [result.json](../../.artifacts/voice-routing-proof-20260909/result.json).
Temporary diagnostic source was removed after recording evidence.

The first exploratory data-URL run also had zero element-source stream output,
but lacked setSinkId because its origin was insecure. It was replaced by the
local-file run above; that initial sink observation is not a platform limitation.

## Next decision

Revise the proposed source boundary before continuing DSP/UI integration.
Fable suggested the existing MediaStreamAudioSource with the receiver kept
playing but inaudible. Its nonzero control signal makes it a candidate, **not a
proved single audible sink**. A follow-up proof must verify receiver suppression,
actual output routing, gain/mute, remote track continuity and cleanup before
integrating it. No virtual cable or transport migration is indicated by this test.

Signalsmith processing/reset/latency, production CSP, alternate-device routing,
Voice Studio, default/Raven listening and Mac acceptance remain untested.
