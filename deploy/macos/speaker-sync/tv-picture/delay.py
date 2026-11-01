import sys, time, statistics
rows, offset = sys.argv[1], float(sys.argv[2])
day, tz = 86_400_000, 8 * 3_600_000
now = time.time() * 1000
midnight = ((now + tz) // day) * day - tz
seen, delays = set(), []
for line in open(rows):
    name, board, mac, valid = line.strip().split(',')
    board, mac = int(board), int(mac)
    if board < 0 or valid != '1' or mac in seen: continue
    seen.add(mac)
    on_mac_clock = midnight + board - offset          # board frame time expressed on the Mac clock
    d = (on_mac_clock - mac) % (1 << 24)              # mac is the low 24 bits of the Mac ms clock
    if d < 5000: delays.append(d)
delays.sort()
q = lambda f: delays[int(f * (len(delays) - 1))]
print(f"new_frames={len(delays)} delay_ms min={delays[0]:.0f} p10={q(.1):.0f} median={statistics.median(delays):.0f} p90={q(.9):.0f} max={delays[-1]:.0f}")
