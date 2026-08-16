import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Boot smoke contract (Phase 0 shared interface, consumed by the Task 10 demo runner):
 *
 *   MIRROR_SMOKE_MS=<n>          auto-quit n ms after `app.ready`
 *                                exit 0 iff both windows loaded AND lifecycle left 'starting'
 *                                exit 2 otherwise
 *   MIRROR_FORCE_RENDERER_FAIL=1 forces the mirror preload to throw (failure path)
 *
 * These tests drive the real app through `npm run dev`; they must run locally on the
 * Windows dev machine with no skip-if-CI escape hatch.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SMOKE_MS = 8_000
const VITEST_TIMEOUT_MS = 60_000
/** Kill before vitest's own timeout so a hang reports as a readable assertion. */
const HARD_KILL_MS = 50_000

interface SmokeRun {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
  else process.kill(-pid, 'SIGKILL')
}

async function runSmoke(extraEnv: Record<string, string> = {}): Promise<SmokeRun> {
  return await new Promise<SmokeRun>((settle) => {
    const child = spawn('npm', ['run', 'dev'], {
      cwd: repoRoot,
      env: { ...process.env, MIRROR_SMOKE_MS: String(SMOKE_MS), ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))

    const killer = setTimeout(() => {
      timedOut = true
      killTree(child.pid)
    }, HARD_KILL_MS)

    child.on('close', (code) => {
      clearTimeout(killer)
      settle({ code, stdout, stderr, timedOut })
    })
  })
}

function report(run: SmokeRun): string {
  return `\n--- stdout ---\n${run.stdout.slice(-2000)}\n--- stderr ---\n${run.stderr.slice(-2000)}`
}

describe('boot smoke contract', () => {
  it(
    'exits 0 and logs MAIN_READY when both windows load',
    async () => {
      const run = await runSmoke()

      expect(run.timedOut, `app never quit in smoke mode${report(run)}`).toBe(false)
      expect(run.stdout, `MAIN_READY marker missing${report(run)}`).toContain('MAIN_READY')
      expect(run.code, `expected clean smoke exit${report(run)}`).toBe(0)
    },
    VITEST_TIMEOUT_MS
  )
})
