class VoiceEffectsMeter extends AudioWorkletProcessor {
  constructor() { super(); this.active = [false, false]; this.quiet = [0, 0] }
  process(inputs) {
    for (let channel = 0; channel < 2; channel++) {
      const data = inputs[channel]?.[0]; if (!data) continue;
      const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
      if (rms > 0.004 && !this.active[channel]) { this.active[channel] = true; this.port.postMessage({ channel, time: currentTime }); }
      if (rms < 0.001) { if (++this.quiet[channel] > 15) this.active[channel] = false; } else this.quiet[channel] = 0;
    }
    return true;
  }
}
registerProcessor('voice-effects-meter', VoiceEffectsMeter);
