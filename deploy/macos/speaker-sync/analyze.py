# analyze.py <rec-prefix> <play.json> [label] : per-chirp delay (mic arrival host time - scheduled emission host time)
import json, sys, numpy as np
rec, play = sys.argv[1], json.load(open(sys.argv[2])); label = sys.argv[3] if len(sys.argv) > 3 else ""
meta = json.load(open(rec + ".json")); x = np.fromfile(rec + ".f32", dtype="<f4").astype(np.float64); rate = meta["rate"]
m = np.array(meta["marks"])[3:]  # the first buffers can carry a startup timestamp jump
slope = 1.0 / rate; icpt = float(np.median(m[:, 1] - m[:, 0] * slope))  # frame -> host seconds
resid = (m[:, 1] - (icpt + slope * m[:, 0])) * 1000; resid = resid[np.abs(resid) < np.percentile(np.abs(resid), 95) + 1e-9]
def chirp(rate, dur=0.08, f0=500.0, f1=4000.0):
    t = np.arange(int(rate * dur)) / rate; k = np.log(f1 / f0)
    return np.sin(np.pi * t / dur) ** 2 * np.sin(2 * np.pi * f0 * dur / k * (np.exp(t / dur * k) - 1))
ref = chirp(rate); n = 1 << int(np.ceil(np.log2(len(x) + len(ref))))
corr = np.fft.irfft(np.fft.rfft(x, n) * np.conj(np.fft.rfft(ref, n)), n)[:len(x)]
env = np.abs(corr); floor = np.median(env) + 1e-15
cand = [i for i in range(1, len(env) - 1) if env[i] > 6 * floor and env[i] >= env[i - 1] and env[i] >= env[i + 1]]
cand.sort(key=lambda i: -env[i]); peaks = []
for i in cand:
    if all(abs(i - p) > 0.25 * rate for p in peaks): peaks.append(i)
def subsample(i):
    a, b, c = corr[i - 1], corr[i], corr[i + 1]; d = a - 2 * b + c
    return i + (0.5 * (a - c) / d if d != 0 else 0)
arrivals = sorted((icpt + slope * subsample(i), env[i] / floor) for i in peaks)
chirps = np.array(play["chirps"])
diffs = np.array([a - c for a, _ in arrivals for c in chirps])
diffs = diffs[(diffs > -0.05) & (diffs < 4.0)]
if len(diffs) == 0: print(f"{label}: no arrivals (peaks={len(peaks)})"); sys.exit()
hist, edges = np.histogram(diffs, bins=np.arange(-0.05, 4.0, 0.002)); d0 = edges[np.argmax(hist)] + 0.001
per = []
for c in chirps:
    near = [(a, s) for a, s in arrivals if abs(a - c - d0) < 0.03]
    if near: a, s = max(near, key=lambda q: q[1]); per.append((a - c, s))
if not per: print(f"{label}: no matched chirps"); sys.exit()
d = np.array([p[0] for p in per]) * 1000; snr = np.array([p[1] for p in per])
print(f"{label}: matched {len(per)}/{len(chirps)}  delay median {np.median(d):.1f} ms  min {d.min():.1f}  max {d.max():.1f}  sd {d.std():.1f}  "
      f"strength x{np.median(snr):.0f}  clock-fit resid {np.abs(resid).max():.2f} ms  device={play.get('device')} (lat {play.get('deviceLatency')}+{play.get('streamLatency')} fr, safety {play.get('safety')})")
