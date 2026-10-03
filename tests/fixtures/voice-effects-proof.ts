import { createVoiceEffectGraph } from '../../src/renderer/avatar/audio/voice-effects'
import { DEFAULT_VOICE_EFFECTS } from '../../src/shared/voice-effects'
import { echoImpulse } from '../../src/renderer/avatar/audio/voice-spatial-effects'

const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
async function level(analyser: AnalyserNode, durationMs = 200): Promise<number> {
  let peak = 0
  const samples = new Float32Array(analyser.fftSize)
  for (let i = 0; i < Math.ceil(durationMs / 20); i++) {
    await wait(20); analyser.getFloatTimeDomainData(samples)
    peak = Math.max(peak, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length))
  }
  return peak
}
async function proof(): Promise<object> {
  // Real Chromium convolution: no dry duplicate, exactly three diminishing
  // echoes, and no output beyond the finite tail. Offline synthetic signal only.
  const offline = new OfflineAudioContext(1, 48000, 48000)
  const impulse = offline.createBuffer(1, 1, 48000); impulse.getChannelData(0)[0] = .5
  const pulse = offline.createBufferSource(); pulse.buffer = impulse
  const echo = offline.createConvolver(); echo.normalize = false; echo.buffer = echoImpulse(offline, 220, 3)
  pulse.connect(echo).connect(offline.destination); pulse.start()
  const rendered = (await offline.startRendering()).getChannelData(0)
  const echoPeaks = [10560, 21120, 31680].map(at => Math.max(...rendered.slice(at - 2, at + 3).map(Math.abs)))
  const echoDryPeak = Math.max(...rendered.slice(0, 100).map(Math.abs))
  const echoAfterTailPeak = Math.max(...rendered.slice(32000).map(Math.abs))
  const echoPassed = echoDryPeak < 1e-6 && echoPeaks[0]! > .2 && echoPeaks[1]! > .08 && echoPeaks[2]! > .03
    && echoPeaks[0]! > echoPeaks[1]! && echoPeaks[1]! > echoPeaks[2]! && echoAfterTailPeak < 1e-6
  const context = new AudioContext(), osc = context.createOscillator(), gain = context.createGain()
  gain.gain.value = 0.02; osc.frequency.value = 440
  const dest = context.createMediaStreamDestination()
  osc.connect(gain).connect(dest); osc.start(); await context.resume()
  const sender = new RTCPeerConnection({ iceServers: [] }), receiver = new RTCPeerConnection({ iceServers: [] })
  const failures: string[] = []
  sender.onicecandidate = e => { if (e.candidate) void receiver.addIceCandidate(e.candidate).catch(() => failures.push('receiver_ice')) }
  receiver.onicecandidate = e => { if (e.candidate) void sender.addIceCandidate(e.candidate).catch(() => failures.push('sender_ice')) }
  const track = new Promise<MediaStream>(resolve => { receiver.ontrack = e => resolve(e.streams[0]!) })
  sender.addTrack(dest.stream.getAudioTracks()[0]!, dest.stream)
  await sender.setLocalDescription(await sender.createOffer()); await receiver.setRemoteDescription(sender.localDescription!)
  await receiver.setLocalDescription(await receiver.createAnswer()); await sender.setRemoteDescription(receiver.localDescription!)
  const stream = await track, element = document.createElement('audio')
  element.muted = true; element.volume = 0; element.srcObject = stream; element.autoplay = true; document.body.append(element); await element.play()
  const source = context.createMediaStreamSource(stream)
  const graph = await createVoiceEffectGraph(context, DEFAULT_VOICE_EFFECTS, reason => failures.push(reason))
  source.connect(graph.input); graph.output.connect(context.destination)
  const bypassRms = await level(graph.completionAnalyser)
  await graph.update({ ...DEFAULT_VOICE_EFFECTS, enabled: true, pitchSemitones: -3, roomMix: 0, outputTrimDb: 0 })
  await wait(300)
  const processedRms = await level(graph.completionAnalyser), latencyMs = graph.latencySeconds * 1000
  graph.speechAnalyser.fftSize = 32768
  const spectrum = new Float32Array(graph.speechAnalyser.frequencyBinCount)
  graph.speechAnalyser.getFloatFrequencyData(spectrum)
  let bin = 0; for (let i = 1; i < spectrum.length; i++) if (spectrum[i]! > spectrum[bin]!) bin = i
  const pitchHz = bin * context.sampleRate / graph.speechAnalyser.fftSize
  await context.audioWorklet.addModule(new URL('./meter.js', document.baseURI).href)
  const meter = new AudioWorkletNode(context, 'voice-effects-meter', { numberOfInputs: 2, numberOfOutputs: 1 })
  const measured: number[][] = [[], []]
  meter.port.onmessage = event => measured[event.data.channel]!.push(event.data.time)
  source.connect(meter, 0, 0); graph.output.connect(meter, 0, 1)
  const meterDrain = context.createGain(); meterDrain.gain.value = 0; meter.connect(meterDrain).connect(context.destination)
  gain.gain.value = 0; await wait(800); measured[0] = []; measured[1] = []
  const baseline = context.currentTime + 0.1
  for (let i = 0; i < 20; i++) { gain.gain.setValueAtTime(0.02, baseline + i * 0.7); gain.gain.setValueAtTime(0, baseline + i * 0.7 + 0.25) }
  await wait(14700)
  const delays = measured[0]!.map((time, index) => ((measured[1]![index] ?? NaN) - time) * 1000).sort((a, b) => a - b)
  const measuredP95Ms = delays[Math.ceil(delays.length * 0.95) - 1] ?? NaN
  source.disconnect(meter); graph.output.disconnect(meter); meter.disconnect(); meter.port.close(); meterDrain.disconnect()
  gain.gain.value = 0.02; await wait(300)
  graph.setMuted(true); await wait(100); const mutedRms = await level(graph.completionAnalyser)
  graph.setMuted(false); graph.interrupt(); gain.gain.value = 0
  const control = context.createAnalyser(); source.connect(control)
  await wait(600); const upstreamSilentRms = await level(control); await graph.begin(); await wait(200)
  const staleRms = await level(graph.completionAnalyser)
  gain.gain.value = 0.02; await wait(300); const resumedRms = await level(graph.completionAnalyser)
  // Exercise reset with a direct synthetic source, independently of the
  // network jitter buffer: buffered DSP speech must not survive an immediate restart.
  source.disconnect(graph.input); gain.connect(graph.input); await wait(300)
  await graph.update({ ...DEFAULT_VOICE_EFFECTS, enabled: true, roomSize: 'cathedral', roomMix: .25,
    echoMix: .3, echoDelayMs: 500, echoRepeats: 4, outputTrimDb: 0 })
  const expandedTailSeconds = graph.tailSeconds
  await wait(500)
  gain.gain.value = 0; await wait(250)
  const spatialTailRms = await level(graph.completionAnalyser)
  await wait(expandedTailSeconds * 1000)
  const drainedTailRms = await level(graph.completionAnalyser)
  gain.gain.value = .02; await wait(500)
  graph.interrupt(); gain.gain.value = 0
  const resetMeter = context.createAnalyser(); graph.output.connect(resetMeter)
  await graph.begin(); const immediateResetRms = await level(resetMeter, Math.ceil(expandedTailSeconds * 1000) + 200)
  graph.output.disconnect(resetMeter); resetMeter.disconnect()
  gain.gain.value = 0.8
  let extremesFinite = true, extremesPeak = 0
  for (const direction of [-1, 1]) {
    await graph.update({ ...DEFAULT_VOICE_EFFECTS, enabled: true, pitchSemitones: direction * 12,
      formantSemitones: direction * 6, warmthDb: direction * 6, brightnessDb: direction * 6,
      grit: 0.3, roomMix: 0.25, roomSize: 'cathedral', echoMix: .3, echoDelayMs: 60, echoRepeats: 4, outputTrimDb: 0 })
    await wait(500)
    const samples = new Float32Array(graph.completionAnalyser.fftSize)
    for (let i = 0; i < 10; i++) {
      await wait(20); graph.completionAnalyser.getFloatTimeDomainData(samples)
      extremesFinite &&= samples.every(Number.isFinite)
      for (const value of samples) extremesPeak = Math.max(extremesPeak, Math.abs(value))
    }
  }
  // A missing/muted receiver must not create a second speaker route. Both remain
  // explicitly suppressed throughout every graph gain/pitch/mute measurement.
  const receiverSuppressed = element.muted && element.volume === 0 && !element.paused
  await (context as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId('')
  graph.dispose(); element.pause(); element.srcObject = null; element.remove(); osc.stop(); source.disconnect()
  stream.getTracks().forEach(t => t.stop()); dest.stream.getTracks().forEach(t => t.stop()); sender.close(); receiver.close(); await context.close()
  const passed = receiverSuppressed && bypassRms > 0.01 && bypassRms < 0.02 && processedRms > 0.001
    && pitchHz > 360 && pitchHz < 380 && mutedRms < 1e-6 && staleRms < 1e-6 && resumedRms > 0.001 && latencyMs <= 180
    && immediateResetRms < 1e-6 && extremesFinite && extremesPeak <= 1 && echoPassed
    && expandedTailSeconds >= 2.4 && spatialTailRms > 1e-6 && drainedTailRms < 1e-6
    && delays.length === 20 && measured[1]!.length === 20 && delays.every(x => x >= 0 && x <= 180) && measuredP95Ms <= latencyMs + 40 && failures.length === 0
  return { passed, receiverSuppressed, bypassRms, processedRms, pitchHz, latencyMs, measuredP95Ms, onsetCounts: measured.map(x => x.length), delays,
    mutedRms, upstreamSilentRms, staleRms, resumedRms, immediateResetRms, extremesFinite, extremesPeak,
    echoPassed, echoPeaks, echoDryPeak, echoAfterTailPeak, expandedTailSeconds, spatialTailRms, drainedTailRms,
    failures, contextClosed: context.state === 'closed' }
}
Object.assign(window, { voiceProof: proof })
