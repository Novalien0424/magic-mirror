# patternfit.py <wav> <first.play.json> <second.play.json> : locate each chirp train by its irregular pattern.
import json, sys, wave, numpy as np
w = wave.open(sys.argv[1]); rate = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(float) / 32768
a, b = json.load(open(sys.argv[2]))['chirps'], json.load(open(sys.argv[3]))['chirps']
t = np.arange(int(rate * 0.08)) / rate; k = np.log(8.0)
ref = np.sin(np.pi * t / 0.08) ** 2 * np.sin(2 * np.pi * 500 * 0.08 / k * (np.exp(t / 0.08 * k) - 1))
n = 1 << int(np.ceil(np.log2(len(x) + len(ref)))); corr = np.fft.irfft(np.fft.rfft(x, n) * np.conj(np.fft.rfft(ref, n)), n)[:len(x)]
env = np.abs(corr) / (np.median(np.abs(corr)) + 1e-15)
rel = (np.array(a) - a[0]); gap = b[0] - a[0]
def score(s):  # sample index of the first chirp
    idx = (s + rel * rate).astype(int); ok = idx < len(env)
    return env[idx[ok]].sum() if ok.all() else 0
# coarse scan for the first train with a +-2 ms tolerance window (max-pool the envelope)
pool = np.maximum.reduce([np.roll(env, i) for i in range(-96, 97, 8)])
starts = np.arange(0, len(env) - int((rel[-1] + 1) * rate), int(rate * 0.002))
sc = np.array([pool[(s + rel * rate).astype(int)].sum() for s in starts]); s0 = int(starts[np.argmax(sc)])
def refine(s):
    best = max(range(s - 200, s + 200), key=score); return best
s0 = refine(s0)
print(f"first train at {s0/rate:.3f}s score {score(s0)/len(rel):.1f}x per chirp (noise ~1)")
# second train: scan delta over -150..+400 ms after the scheduled gap
cands = [(score(s0 + int((gap + d / 1000) * rate)), d) for d in np.arange(-150, 400, 0.25)]
best = max(cands); d = best[1]
s1 = refine(s0 + int((gap + d / 1000) * rate)); dd = (s1 - s0) / rate * 1000 - gap * 1000
# per-chirp spread
per = []
for r in rel:
    i0 = int(s0 + r * rate); i1 = int(s1 + r * rate)
    w0 = i0 - 48 + int(np.argmax(env[i0 - 48:i0 + 48])); w1 = i1 - 48 + int(np.argmax(env[i1 - 48:i1 + 48]))
    if env[w0] > 4 and env[w1] > 4: per.append(((w1 - w0) / rate - gap) * 1000)
per = np.array(per)
print(f"second train score {score(s1)/len(rel):.1f}x per chirp; second-minus-first extra delay {dd:.1f} ms; per-pair median {np.median(per):.1f} sd {per.std():.1f} n={len(per)}")
# landscape: strongest second-train candidates across the delay range
c = sorted(cands, reverse=True); shown = []
for s, d in c:
    if all(abs(d - q) > 8 for q in shown): shown.append(d); print(f"  candidate {d:7.2f} ms  score {s/len(rel):.1f}x")
    if len(shown) >= 6: break
