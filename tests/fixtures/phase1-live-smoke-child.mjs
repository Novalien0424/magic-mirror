import { spawn } from 'node:child_process'

const mode = process.env.PHASE1_LIVE_FIXTURE_MODE ?? 'pass'

function marker(status, stage, reason, exit, modelAvailability, includeModelAvailability = true) {
  const modelField = includeModelAvailability ? ` model_availability=${modelAvailability}` : ''
  process.stdout.write(`PHASE1_LIVE_RESULT status=${status} stage=${stage} reason=${reason} exit=${exit} duration_ms=1${modelField}\n`)
}

if (mode === 'pass') {
  marker('passed', 'dormant', 'completed', 0, 'available')
  process.exit(0)
}

if (mode === 'fail') {
  marker('failed', 'active', 'active_timeout', 1, 'unavailable')
  process.exit(1)
}

if (mode === 'available' || mode === 'unavailable' || mode === 'probe_failed') {
  marker('passed', 'dormant', 'completed', 0, mode)
  process.exit(0)
}

if (mode === 'duplicate') {
  marker('passed', 'dormant', 'completed', 0, 'available')
  marker('failed', 'runner', 'duplicate', 1, 'unavailable')
  process.exit(0)
}

if (mode === 'missing_model_availability') {
  marker('passed', 'dormant', 'completed', 0, undefined, false)
  process.exit(0)
}

if (mode === 'invalid_model_availability') {
  marker('passed', 'dormant', 'completed', 0, 'unknown')
  process.exit(0)
}

if (mode === 'hang') {
  spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
    windowsHide: true,
  })
  setInterval(() => {}, 1_000)
}
