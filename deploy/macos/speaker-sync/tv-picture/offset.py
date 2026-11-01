import subprocess, time, os, statistics
env = dict(os.environ, ADB_MDNS='0', ADB_MDNS_AUTO_CONNECT='0')
p = subprocess.Popen(['/Library/Application Support/MagicMirror/adb', '-H', '127.0.0.1', '-P', '5038', '-s', '192.168.77.2:5555', 'shell'],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1, env=env)
samples = []
for i in range(60):
    t0 = time.time_ns(); p.stdin.write('date +%s%N\n'); p.stdin.flush(); line = p.stdout.readline().strip(); t1 = time.time_ns()
    if line.isdigit(): samples.append(((t1 - t0) / 1e6, (int(line) - (t0 + t1) / 2) / 1e6))
    time.sleep(0.05)
p.stdin.write('exit\n'); p.stdin.flush(); p.wait(timeout=5)
samples.sort()
best = samples[:8]
print(f"n={len(samples)} min_rtt_ms={samples[0][0]:.1f} offset_ms(best8 median)={statistics.median(o for _, o in best):.1f} spread={max(o for _, o in best)-min(o for _, o in best):.1f}")
