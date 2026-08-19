import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SQLITE_RUNTIME_MARKER =
  'SQLITE_RUNTIME_RESULT status=passed;open=ready;wal=wal;close=closed;reopen=ready;row=present;close_again=closed'
const ELECTRON_TIMEOUT_MS = 15_000
const KILL_GRACE_MS = 1_000
const VITEST_TIMEOUT_MS = ELECTRON_TIMEOUT_MS + KILL_GRACE_MS + 1_000

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const smokeEntrypoint = resolve(repositoryRoot, 'scripts/sqlite-electron-runtime-smoke.mjs')
const require = createRequire(import.meta.url)

type ElectronSmokeResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  spawnFailed: boolean
}

function resolveLocalElectronExecutable(): string {
  try {
    const executable = require('electron') as unknown
    if (typeof executable === 'string' && executable.length > 0) {
      return executable
    }
  } catch {
    // Keep resolver failures metadata-only; the RED case is the missing smoke entrypoint.
  }
  throw new Error('local Electron executable unavailable')
}

function runElectronSmoke(electronExecutable: string): Promise<ElectronSmokeResult> {
  return new Promise((resolveResult) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let spawnFailed = false
    let settled = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    let killGraceHandle: ReturnType<typeof setTimeout> | undefined

    const child = spawn(electronExecutable, [smokeEntrypoint], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ELECTRON_NO_ATTACH_CONSOLE: '1',
        ELECTRON_RUN_AS_NODE: undefined,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const finish = (exitCode: number | null): void => {
      if (settled) {
        return
      }
      settled = true
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle)
      }
      if (killGraceHandle !== undefined) {
        clearTimeout(killGraceHandle)
      }
      resolveResult({ exitCode, stdout, stderr, timedOut, spawnFailed })
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.once('error', () => {
      spawnFailed = true
      finish(null)
    })
    child.once('close', (exitCode: number | null) => {
      finish(exitCode)
    })

    timeoutHandle = setTimeout(() => {
      timedOut = true
      child.kill()
      killGraceHandle = setTimeout(() => {
        child.stdout.destroy()
        child.stderr.destroy()
        finish(null)
      }, KILL_GRACE_MS)
    }, ELECTRON_TIMEOUT_MS)
  })
}

describe('Electron runtime SQLite smoke entrypoint', () => {
  it(
    'runs the future harness with bundled Electron and asserts its exact metadata marker',
    { timeout: VITEST_TIMEOUT_MS },
    async () => {
      expect(existsSync(smokeEntrypoint)).toBe(true)

      const electronExecutable = resolveLocalElectronExecutable()
      expect(electronExecutable === process.execPath).toBe(false)

      const result = await runElectronSmoke(electronExecutable)
      const markerLines = result.stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith('SQLITE_RUNTIME_RESULT '))

      expect(result.timedOut).toBe(false)
      expect(result.spawnFailed).toBe(false)
      expect(markerLines).toHaveLength(1)
      expect(markerLines[0]).toBe(SQLITE_RUNTIME_MARKER)
      expect(result.exitCode).toBe(0)
      expect(typeof result.stderr).toBe('string')
    },
  )
})
