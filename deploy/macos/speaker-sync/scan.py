# scan.py <rec-prefix> <play.json> <label> : best chirp-train delay over 0..30 s by pattern score (max-pooled +-6 ms).
# Unlike track.py (1.9..2.9 s window) it finds any delay (Airfoil held the Jabra up to 15 s on 2026-11-08);
# the top line is the answer when its score clearly beats the next (silence scores ~5-70x). A second peak
# ~51 ms later has been observed; the dominant arrival is used, not an assumed second speaker.
import json, sys, numpy as np

def max_pool(values, radius):
    """Centered maximum in O(n) space/time; never wrap the recording's ends.

    Materializing one rolled copy per sample of tolerance consumed tens of GB
    for a continuous recording from the 32 kHz Jabra microphone.
    """
    width = radius * 2 + 1
    padded = np.pad(values, (radius, radius + (-(len(values) + 2 * radius) % width)))
    blocks = padded.reshape(-1, width)
    prefix = np.maximum.accumulate(blocks, axis=1).ravel()
    suffix = np.maximum.accumulate(blocks[:, ::-1], axis=1)[:, ::-1].ravel()
    return np.maximum(suffix[:len(values)], prefix[width - 1:width - 1 + len(values)])

rec, play, label = sys.argv[1], json.load(open(sys.argv[2])), sys.argv[3]
meta = json.load(open(rec + ".json")); x = np.fromfile(rec + ".f32", dtype="<f4").astype(np.float64); rate = meta["rate"]
m = np.array(meta["marks"])[3:]; slope = 1.0 / rate; icpt = float(np.median(m[:, 1] - m[:, 0] * slope))
t = np.arange(int(rate * 0.08)) / rate; k = np.log(8.0)
ref = np.sin(np.pi * t / 0.08) ** 2 * np.sin(2 * np.pi * 500 * 0.08 / k * (np.exp(t / 0.08 * k) - 1))
n = 1 << int(np.ceil(np.log2(len(x) + len(ref)))); corr = np.fft.irfft(np.fft.rfft(x, n) * np.conj(np.fft.rfft(ref, n)), n)[:len(x)]
env = np.abs(corr); env = env / (np.median(env) + 1e-15)
w = int(rate * 0.006); pool = max_pool(env, w)
ch = np.array(play["chirps"])
res = []
for d in np.arange(0.0, 30.0, 0.001):
    idx = ((ch + d - icpt) / slope).astype(int); ok = (idx >= 0) & (idx < len(pool))
    if ok.sum() < len(ch) * 0.5: continue
    res.append((pool[idx[ok]].mean(), d, ok.sum()))
res.sort(reverse=True); shown = []
if not res:
    raise SystemExit(f"{label}: recording does not cover enough of the chirp train")
for s, d, c in res:
    if all(abs(d - q) > 0.05 for q in shown):
        shown.append(d); print(f"{label}: delay {d*1000:7.0f} ms  score {s:5.1f}x  chirps {c}")
    if len(shown) >= 3: break
# Refine the winning pattern against individual chirps. The pooled score has a
# +-6 ms plateau; its grid maximum alone is not a millisecond calibration.
delays = []
for c in ch:
    lo = int((c + res[0][1] - 0.025 - icpt) / slope)
    hi = int((c + res[0][1] + 0.025 - icpt) / slope)
    if lo < 0 or hi >= len(env): continue
    i = lo + int(np.argmax(env[lo:hi]))
    delays.append((icpt + slope * i - c) * 1000)
if delays:
    p10, median, p90 = np.percentile(delays, [10, 50, 90])
    print(f"{label}: per-chirp median {median:.1f} ms  p10 {p10:.1f}  p90 {p90:.1f}  n {len(delays)}/{len(ch)}")
