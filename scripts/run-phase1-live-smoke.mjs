import { spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PHASE1_LIVE_RESULT_PREFIX = 'PHASE1_LIVE_RESULT '

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024
const POST_EXIT_CONFIRMATION_MS = 500
const isWindows = process.platform === 'win32'

const RESULT_STAGES = new Set(['renderer_ready', 'start', 'active', 'stop', 'dormant', 'runner'])
const MODEL_AVAILABILITIES = new Set(['available', 'unavailable', 'probe_failed'])

function safeToken(value, fallback) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,95}$/u.test(value) ? value : fallback
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function safeDuration(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function safeExitCode(value, fallback = 1) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 255 ? value : fallback
}

function safeModelAvailability(value, fallback = 'probe_failed') {
  return MODEL_AVAILABILITIES.has(value) ? value : fallback
}

function positiveInteger(value, fallback, maximum) {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(maximum, Math.max(1, Math.floor(value)))
}

function defaultCommandAndArgs() {
  if (isWindows) {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'dev'],
    }
  }
  return { command: 'npm', args: ['run', 'dev'] }
}

function parsePhase1LiveMarker(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith(PHASE1_LIVE_RESULT_PREFIX)) return { found: false }

  const fields = new Map()
  for (const token of trimmed.slice(PHASE1_LIVE_RESULT_PREFIX.length).split(/\s+/u)) {
    const separator = token.indexOf('=')
    if (separator <= 0) return { found: true, marker: null }
    fields.set(token.slice(0, separator), token.slice(separator + 1))
  }

  const status = fields.get('status')
  const stage = fields.get('stage')
  const reason = fields.get('reason')
  const exitCode = Number(fields.get('exit'))
  const durationMs = Number(fields.get('duration_ms'))
  const modelAvailability = fields.get('model_availability')
  if (
    (status !== 'passed' && status !== 'failed')
    || typeof stage !== 'string'
    || !RESULT_STAGES.has(stage)
    || typeof reason !== 'string'
    || !/^[a-z][a-z0-9_]{0,95}$/u.test(reason)
    || !Number.isSafeInteger(exitCode)
    || exitCode < 0
    || exitCode > 255
    || !Number.isSafeInteger(durationMs)
    || durationMs < 0
    || !MODEL_AVAILABILITIES.has(modelAvailability)
  ) {
    return { found: true, marker: null }
  }

  return {
    found: true,
    marker: {
      status,
      stage,
      reason,
      exitCode,
      durationMs,
      modelAvailability,
    },
  }
}

function waitForClose(child) {
  return new Promise((resolveClose) => {
    let settled = false
    const settle = (result) => {
      if (settled) return
      settled = true
      resolveClose(result)
    }

    child.once('error', () => settle({ error: true, code: null, signal: null }))
    child.once('close', (code, signal) => settle({ error: false, code, signal }))
  })
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function confirmProcessExit(pid) {
  const deadline = Date.now() + POST_EXIT_CONFIRMATION_MS
  while (isProcessAlive(pid) && Date.now() < deadline) await delay(25)
  return !isProcessAlive(pid)
}

function runTaskkill(pid) {
  return new Promise((resolveKill) => {
    let settled = false
    const settle = (value) => {
      if (settled) return
      settled = true
      resolveKill(value)
    }
    let killer
    try {
      killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } catch {
      settle(false)
      return
    }
    killer.once('error', () => settle(false))
    killer.once('close', (code) => settle(code === 0 || !isProcessAlive(pid)))
  })
}

async function terminateProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false

  if (isWindows) return runTaskkill(pid)

  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      try {
        process.kill(pid, 'SIGKILL')
      } catch (fallbackError) {
        if (fallbackError?.code !== 'ESRCH') return false
      }
    }
  }
  return true
}

async function cleanupTemporaryRoot(temporaryRoot) {
  if (typeof temporaryRoot !== 'string' || temporaryRoot === '') return false

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(temporaryRoot, { recursive: true, force: true })
    } catch {
      // A short retry handles late file-handle release after process-tree kill.
    }
    try {
      await access(temporaryRoot)
    } catch {
      return true
    }
    await delay(25)
  }
  return false
}

export function formatPhase1LiveResult(result) {
  const status = result?.status === 'passed' ? 'passed' : 'failed'
  const stage = safeToken(result?.stage, 'runner')
  const reason = safeToken(result?.reason, 'phase1_live_smoke_failed')
  const exitCode = safeExitCode(result?.exitCode)
  const durationMs = safeDuration(result?.durationMs)
  const cleanup = result?.cleanup === 'passed' ? 'passed' : 'failed'
  const markerCount = safeCount(result?.markerCount)
  const outputMarkerCount = Math.max(1, safeCount(result?.outputMarkerCount))
  const orphanCount = safeCount(result?.orphanCount)
  const modelAvailability = safeModelAvailability(result?.modelAvailability)
  return `${PHASE1_LIVE_RESULT_PREFIX}status=${status} stage=${stage} reason=${reason} exit=${exitCode} duration_ms=${durationMs} model_availability=${modelAvailability} cleanup=${cleanup} marker_count=${markerCount} output_marker_count=${outputMarkerCount} orphan_count=${orphanCount}\n`
}

export async function runPhase1LiveSmoke(options = {}) {
  const startedAt = Date.now()
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 900_000)
  const maxOutputBytes = positiveInteger(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES, 8 * 1024 * 1024)
  const defaults = defaultCommandAndArgs()
  const command = typeof options.command === 'string' && options.command !== '' ? options.command : defaults.command
  const args = Array.isArray(options.args) ? options.args.map((value) => String(value)) : defaults.args
  const cwd = typeof options.cwd === 'string' && options.cwd !== '' ? options.cwd : REPOSITORY_ROOT

  let temporaryRoot = ''
  let userDataDir = ''
  let cleanup = 'failed'
  let markerCount = 0
  const outputMarkerCount = 1
  let orphanCount = 0
  let stdoutRemainder = ''
  let outputBytes = 0
  let outputLimitExceeded = false
  let timedOut = false
  let terminationPromise = null
  let terminationFailed = false
  const markers = []
  let invalidMarker = false
  let modelAvailability = 'probe_failed'
  let child = null

  const requestTermination = (failureReason) => {
    if (terminationPromise !== null) return
    terminationPromise = terminateProcessTree(child?.pid)
      .then((terminated) => {
        if (!terminated) terminationFailed = true
        return terminated
      })
      .catch(() => {
        terminationFailed = true
        return false
      })
    if (failureReason === 'timeout') timedOut = true
  }

  let closeResult = { error: false, code: null, signal: null }
  try {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'magic-mirror-phase1-live-'))
    userDataDir = join(temporaryRoot, 'user-data')
    await mkdir(userDataDir)

    const env = {
      ...process.env,
      ...(options.env && typeof options.env === 'object' ? options.env : {}),
      MIRROR_PHASE1_LIVE_SMOKE: '1',
      MIRROR_PHASE0_USER_DATA_ROOT: temporaryRoot,
      MIRROR_USER_DATA_DIR: userDataDir,
      MIRROR_PHASE1_LIVE_SMOKE_ROOT: temporaryRoot,
      MIRROR_PHASE1_LIVE_USER_DATA_DIR: userDataDir,
    }

    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        detached: !isWindows,
        windowsHide: true,
      })
    } catch {
      closeResult = { error: true, code: null, signal: null }
    }

    if (child !== null) {
      const consumeLine = (line) => {
        const parsed = parsePhase1LiveMarker(line)
        if (!parsed.found) return
        markerCount += 1
        if (parsed.marker === null) invalidMarker = true
        else markers.push(parsed.marker)
      }

      const consumeStdout = (chunk) => {
        if (outputLimitExceeded) return
        const text = chunk.toString('utf8')
        outputBytes += Buffer.byteLength(text)
        if (outputBytes > maxOutputBytes) {
          outputLimitExceeded = true
          requestTermination('output_limit')
          return
        }
        stdoutRemainder += text
        if (stdoutRemainder.length > maxOutputBytes) {
          outputLimitExceeded = true
          requestTermination('output_limit')
          stdoutRemainder = ''
          return
        }
        let newlineIndex = stdoutRemainder.indexOf('\n')
        while (newlineIndex >= 0) {
          consumeLine(stdoutRemainder.slice(0, newlineIndex).replace(/\r$/u, ''))
          stdoutRemainder = stdoutRemainder.slice(newlineIndex + 1)
          newlineIndex = stdoutRemainder.indexOf('\n')
        }
      }

      const consumeStderr = (chunk) => {
        if (outputLimitExceeded) return
        outputBytes += chunk.byteLength
        if (outputBytes > maxOutputBytes) {
          outputLimitExceeded = true
          requestTermination('output_limit')
        }
      }

      child.stdout?.on('data', consumeStdout)
      child.stderr?.on('data', consumeStderr)
      const timer = setTimeout(() => {
        timedOut = true
        requestTermination('timeout')
      }, timeoutMs)
      closeResult = await waitForClose(child)
      clearTimeout(timer)
      if (stdoutRemainder !== '') consumeLine(stdoutRemainder.replace(/\r$/u, ''))
      if (terminationPromise !== null) await terminationPromise
      if (child.pid !== undefined && !(await confirmProcessExit(child.pid))) orphanCount = 1
    }
  } catch {
    closeResult = { error: true, code: null, signal: null }
  } finally {
    cleanup = await cleanupTemporaryRoot(temporaryRoot) ? 'passed' : 'failed'
  }

  const elapsedMs = Math.max(0, Date.now() - startedAt)
  let status = 'failed'
  let stage = 'runner'
  let reason = 'runner_failed'
  let exitCode = 1
  let durationMs = elapsedMs

  if (timedOut) {
    reason = 'timeout'
  } else if (outputLimitExceeded) {
    reason = 'output_limit'
  } else if (terminationFailed || orphanCount > 0) {
    reason = 'process_tree_termination_failed'
  } else if (closeResult.error) {
    reason = 'spawn_failed'
  } else if (markerCount === 0) {
    reason = 'missing_marker'
    exitCode = safeExitCode(closeResult.code, 1)
  } else if (markerCount !== 1) {
    reason = 'duplicate_marker'
    } else if (invalidMarker || markers.length !== 1) {
      reason = 'invalid_marker'
    } else {
      const marker = markers[0]
      durationMs = marker.durationMs
    stage = marker.stage
    reason = marker.reason
    const actualExitCode = safeExitCode(closeResult.code, 1)
    const markerOutcomeMatches = (marker.status === 'passed') === (marker.exitCode === 0)
    const childExitMatches = closeResult.code === marker.exitCode
    if (!markerOutcomeMatches) {
      reason = 'marker_contract_invalid'
    } else if (!childExitMatches) {
      reason = 'child_exit_mismatch'
    } else if (marker.status === 'passed' && actualExitCode === 0) {
      modelAvailability = marker.modelAvailability
      status = 'passed'
      exitCode = 0
    } else {
      modelAvailability = marker.modelAvailability
      exitCode = actualExitCode
    }
  }

  if (cleanup !== 'passed') {
    modelAvailability = 'probe_failed'
    if (status === 'passed') {
      status = 'failed'
      stage = 'runner'
      reason = 'cleanup_failed'
      exitCode = 1
    }
  }

  return {
    status,
    stage,
    reason: safeToken(reason, 'phase1_live_smoke_failed'),
    exitCode: safeExitCode(exitCode),
    durationMs: safeDuration(durationMs),
    cleanup,
    temporaryRoot,
    markerCount,
    outputMarkerCount,
    orphanCount,
    modelAvailability: safeModelAvailability(modelAvailability),
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await runPhase1LiveSmoke()
  process.stdout.write(formatPhase1LiveResult(result))
  process.exitCode = result.exitCode
}
