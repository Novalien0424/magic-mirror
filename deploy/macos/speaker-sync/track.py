# track.py <rec-prefix> <play.json> <label> : per-chirp delay over time (detects drift and jumps)
import json, sys, numpy as np
rec, play, label = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
meta = json.load(open(rec + ".json")); x = np.fromfile(rec + ".f32", dtype="<f4").astype(np.float64); rate = meta["rate"]
m = np.array(meta["marks"])[3:]  # the first buffers can carry a startup timestamp jump
slope = 1.0 / rate; icpt = float(np.median(m[:, 1] - m[:, 0] * slope))
t = np.arange(int(rate * 0.08)) / rate; k = np.log(8.0)
ref = np.sin(np.pi * t / 0.08) ** 2 * np.sin(2 * np.pi * 500 * 0.08 / k * (np.exp(t / 0.08 * k) - 1))
n = 1 << int(np.ceil(np.log2(len(x) + len(ref)))); corr = np.fft.irfft(np.fft.rfft(x, n) * np.conj(np.fft.rfft(ref, n)), n)[:len(x)]
env = np.abs(corr); floor = np.median(env) + 1e-15
out = []
for c in play["chirps"]:
    lo = int((c + 1.9 - icpt) / slope); hi = int((c + 2.9 - icpt) / slope)   # search 1.9..2.9 s after emission
    if lo < 0 or hi >= len(env): continue
    i = lo + int(np.argmax(env[lo:hi]))
    if env[i] > 8 * floor: out.append((c - play["chirps"][0], (icpt + slope * i - c) * 1000))
d = np.array([o[1] for o in out])
print(f"{label}: {len(out)}/{len(play['chirps'])} chirps  median {np.median(d):.1f}  p10 {np.percentile(d,10):.1f}  p90 {np.percentile(d,90):.1f}  min {d.min():.1f}  max {d.max():.1f} ms")
segs = [d[i:i+10] for i in range(0, len(d), 10)]
print("   per ~10 s:", " ".join(f"{np.median(s):.0f}" for s in segs if len(s)))
