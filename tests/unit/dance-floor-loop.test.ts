import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDanceFloor } from '../../src/main/dance-floor'
import type { DanceFrame } from '../../src/shared/dance-floor'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function script(path: string, body: string) { await writeFile(path, `#!/usr/bin/env node\n${body}`); await chmod(path, 0o700) }

describe('Dance Floor loop playback', () => {
  it('keeps following the native clock after every loop wrap, analysing the track once per Start', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'mm-dance-loop-'))); roots.push(root)
    await mkdir(join(root, 'DanceFloor')); await writeFile(join(root, 'DanceFloor', '01.wav'), 'fixture')
    const player = join(root, 'player'), analyser = join(root, 'analyser')
    // A short track: playing, a few clock ticks, then ended, so the playlist wraps quickly.
    await script(player, `const send = v => process.stdout.write(JSON.stringify(v) + '\\n');
send({event:'ready',outputs:1});
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
  const m = JSON.parse(line); if (m.action !== 'play') return
  send({event:'playing',id:m.id,outputs:1});
  let t = 0; const tick = setInterval(() => { t += 20; send({event:'clock',id:m.id,positionMs:t,sentAt:Date.now(),rate:1}) }, 20);
  setTimeout(() => { clearInterval(tick); send({event:'ended',id:m.id}) }, 150);
}).on('close', () => process.exit(0));`)
    await script(analyser, `const frames = Array.from({length: 300}, (_, i) => [i * 0.01, i % 50 ? 0.1 : 0.9, i % 50 ? 0.1 : 0.9, 0.3, 0.4]);
process.stdout.write(JSON.stringify({event:'features',frames}) + '\\n');
process.stdout.write(JSON.stringify({event:'complete',durationMs:2000}) + '\\n');`)
    const frames: DanceFrame[] = [], report = vi.fn()
    const dance = createDanceFloor({ directory: root, executable: player, analyser, sharedRoot: async () => root,
      prepare: async path => path, cached: async path => path, isLocal: async () => true,
      publish: frame => frames.push(frame), report, failed: vi.fn(), qa: true })
    try {
      expect(await dance.start()).toBe(true)
      await vi.waitFor(() => expect(frames.some(f => f.status === 'playing' && f.trackId >= 3)).toBe(true), { timeout: 5000 })
      expect(report.mock.calls.filter(([reason]) => reason === 'dance_analysis_ready')).toHaveLength(1)
    } finally { await dance.stop() }
  })
})
