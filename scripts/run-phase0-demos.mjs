import { spawn } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const commonjsRequire = createRequire(import.meta.url)
const SCRIPT_PATH = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..')
const RUNNER_SOURCE_PATH = resolve(REPO_ROOT, 'src', 'main', 'phase0-demo-runner.ts')
const ELECTRON_APP_DIRECTORY_NAME = '.phase0-electron-app'
const ELECTRON_APP_PACKAGE_NAME = 'package.json'
const ELECTRON_APP_ENTRY_NAME = 'entry.cjs'
const ELECTRON_SCRIPT_PATH_ENV = 'MIRROR_PHASE0_SCRIPT_PATH'
const ELECTRON_APP_PACKAGE = JSON.stringify({
  name: 'phase0-demo-electron',
  version: '0.0.0',
  private: true,
  main: ELECTRON_APP_ENTRY_NAME,
}, null, 2) + '\n'
const ELECTRON_APP_ENTRY = [
  "'use strict'",
  "const { app } = require('electron')",
  "const { pathToFileURL } = require('node:url')",
  `const scriptPath = process.env[${JSON.stringify(ELECTRON_SCRIPT_PATH_ENV)}]`,
  "const DEMO_IDS = new Set(['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'])",
  'let failed = false',
  'const fail = () => {',
  '  if (failed) return',
  '  failed = true',
  '  process.exitCode = 2',
  '  const demo = process.env.MIRROR_PHASE0_DEMO',
  '  const marker = {',
  "    marker: 'PHASE_DEMO_STEP',",
  "    ...(DEMO_IDS.has(demo) ? { demoId: demo } : {}),",
  "    step: 'startup_failure',",
  "    stage: 'script_import',",
  "    reason: 'startup_script_import_failed',",
  '  }',
  '  let settled = false',
  '  let fallbackTimer',
  '  const finish = () => {',
  '    if (settled) return',
  '    settled = true',
  '    if (fallbackTimer !== undefined) clearTimeout(fallbackTimer)',
  '    try { app.exit(2) } catch {}',
  '  }',
  '  fallbackTimer = setTimeout(finish, 250)',
  "  try { process.stdout.write(JSON.stringify(marker) + '\\n', finish) } catch { finish() }",
  '}',
  `if (typeof scriptPath !== 'string' || scriptPath.trim() === '' || scriptPath.includes('\\0')) fail()`,
  'else void import(pathToFileURL(scriptPath).href).catch(() => fail())',
  '',
].join('\n')
const ALLOWED_MARKERS = new Set([
  'PHASE_DEMO_START',
  'PHASE_DEMO_STEP',
  'PHASE_DEMO_RESULT',
  'PHASE_RECORD_WRITTEN',
  'PHASE_REOPEN_RESULT',
  'OFFLINE_LOOP_SAMPLE',
])
const PRIVATE_FIELD_PATTERN = /(?:transcript|audio|credential|secret|token|embedding|prompt|utterance|private[_-]?context|raw[_-]?(?:line|jsonl)|(?:guest|candidate)_?id|profile_?id|memory[_-]?(?:value|text|content))/i
const ALLOWLISTED_HASH_KEYS = new Set([
  'realtimeHash',
  'transcriptionHash',
  'extractorHash',
  'personaHash',
])
const SHA256_HASH_PATTERN = /^[0-9a-f]{64}$/
const SAFE_BUILD_PATTERN = /^[A-Za-z0-9._:+/-]{1,2048}$/
const SAFE_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
const SAFE_PLUGIN_PATTERN = /^[A-Za-z0-9@._:/-]{1,128}$/
const SAFE_MODULE_FILE_PATTERN = /^[A-Za-z0-9@._/+-]{1,512}$/
const DEMO_IDS = new Set(['P0-D1', 'P0-D2', 'P0-D3', 'P0-D4', 'P0-D5'])
const FAILURE_CASES = new Set(['cloud-failure', 'core-failure'])
const VALUE_FLAGS = new Set([
  '--demo',
  '--build-commit',
  '--user-data-root',
  '--case',
  '--timeout-ms',
  '--marker-timeout-ms',
  '--soak-ms',
  '--sample-ms',
])
const BOOLEAN_FLAGS = new Set(['--retain-on-success', '--no-time-compression'])

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function metadataOnly(value, key) {
  if (ALLOWLISTED_HASH_KEYS.has(key)) return typeof value === 'string' && SHA256_HASH_PATTERN.test(value)
  if (PRIVATE_FIELD_PATTERN.test(key)) return false
  if (Array.isArray(value)) return value.every((item) => metadataOnly(item, key))
  if (isRecord(value)) return Object.entries(value).every(([childKey, child]) => metadataOnly(child, childKey))
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string'
    && value.length <= 4096
    && !value.includes('\r')
    && !value.includes('\n')
}

function parseMarkerLine(line) {
  const trimmed = line.trim()
  if (trimmed === '') return null
  try {
    const value = JSON.parse(trimmed)
    if (!isRecord(value) || typeof value.marker !== 'string' || !ALLOWED_MARKERS.has(value.marker)) return null
    return metadataOnly(value, 'marker') ? value : null
  } catch {
    return null
  }
}

function parseMarkers(output) {
  const markers = []
  for (const line of output.split(/\r?\n/)) {
    const marker = parseMarkerLine(line)
    if (marker !== null) markers.push(marker)
  }
  return markers
}

function writeMarkers(markers) {
  for (const marker of markers) process.stdout.write(JSON.stringify(marker) + '\n')
}

function writeFailureMarker(demo, reason) {
  const marker = {
    marker: 'PHASE_DEMO_RESULT',
    ...(typeof demo === 'string' && DEMO_IDS.has(demo) ? { demoId: demo } : {}),
    result: 'failed',
    exit: 2,
    reason,
  }
  writeMarkers([marker])
}

function classifyStartupFailure(name, code) {
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return 'module_not_found'
  if (code === 'MISSING_EXPORT' || code === 'ERR_MISSING_EXPORT') return 'missing_export'
  if (code === 'HOOK_API_UNAVAILABLE') return 'hook_api_unavailable'
  if (code === 'HOOK_REGISTER_FAILED') return 'hook_register_failed'
  if (code === 'HOOK_CLEANUP_FAILED') return 'hook_cleanup_failed'
  if (code === 'PATH_ESCAPE') return 'path_escape'
  if (code === 'PATH_RESOLUTION_FAILED') return 'path_resolution_failed'
  if (code === 'TRANSFORM_FAILED') return 'transform_failed'
  if (name === 'SyntaxError' || code === 'SYNTAX_ERROR' || code === 'ERR_SYNTAX_ERROR') return 'syntax_error'
  if (name === 'TypeError' || code === 'TYPE_ERROR' || code === 'ERR_TYPE_ERROR') return 'type_error'
  if (name === 'Error' || name === 'RollupError' || name === 'TransformError') return 'generic_error'
  return 'unknown_error'
}

function createLoaderFailure(code) {
  return Object.assign(new Error(), { code })
}

function sanitizeModuleFile(value) {
  if (typeof value !== 'string' || value === '') return null
  let modulePath = value
  if (modulePath.startsWith('file:')) {
    try {
      modulePath = fileURLToPath(modulePath)
    } catch {
      return null
    }
  }
  if (modulePath.includes('?') || modulePath.includes('#')) return null

  const resolved = resolve(REPO_ROOT, modulePath)
  if (!strictDescendant(REPO_ROOT, resolved)) return null
  const moduleFile = relative(REPO_ROOT, resolved).split(sep).join('/')
  return SAFE_MODULE_FILE_PATTERN.test(moduleFile) ? moduleFile : null
}

function isRelativeModuleSpecifier(specifier) {
  return specifier === '.'
    || specifier === '..'
    || specifier.startsWith('./')
    || specifier.startsWith('../')
}

function extensionlessLocalPath(specifier, parentURL) {
  if (
    typeof specifier !== 'string'
    || specifier === ''
    || specifier.includes('?')
    || specifier.includes('#')
    || extname(specifier) !== ''
  ) return null

  const absoluteSpecifier = isAbsolute(specifier)
  if (!absoluteSpecifier && !isRelativeModuleSpecifier(specifier)) return null

  let candidate
  if (absoluteSpecifier) {
    candidate = resolve(specifier)
  } else {
    if (typeof parentURL !== 'string' || !parentURL.startsWith('file:')) return null
    let parentPath
    try {
      parentPath = fileURLToPath(parentURL)
    } catch {
      return null
    }
    if (!strictDescendant(REPO_ROOT, resolve(parentPath))) return null
    candidate = resolve(dirname(parentPath), specifier)
  }

  if (!strictDescendant(REPO_ROOT, candidate)) throw createLoaderFailure('PATH_ESCAPE')
  return candidate
}

function canonicalTypeScriptPath(candidatePath) {
  let info
  try {
    info = statSync(candidatePath)
  } catch (caught) {
    if (isRecord(caught) && caught.code === 'ENOENT') return null
    throw createLoaderFailure('PATH_RESOLUTION_FAILED')
  }
  if (!info.isFile()) return null

  let canonicalPath
  try {
    canonicalPath = realpathSync(candidatePath)
  } catch {
    throw createLoaderFailure('PATH_RESOLUTION_FAILED')
  }
  if (!strictDescendant(REPO_ROOT, canonicalPath)) throw createLoaderFailure('PATH_ESCAPE')
  if (extname(canonicalPath).toLowerCase() !== '.ts') throw createLoaderFailure('PATH_ESCAPE')
  return canonicalPath
}

function registerPhase0ModuleHooks(moduleApi, onTransformed) {
  const registerHooks = isRecord(moduleApi) ? moduleApi.registerHooks : undefined
  const stripTypeScriptTypes = isRecord(moduleApi) ? moduleApi.stripTypeScriptTypes : undefined
  if (typeof registerHooks !== 'function' || typeof stripTypeScriptTypes !== 'function') {
    throw createLoaderFailure('HOOK_API_UNAVAILABLE')
  }

  let hooks
  try {
    hooks = registerHooks({
      resolve(specifier, context, nextResolve) {
        const localPath = extensionlessLocalPath(specifier, context.parentURL)
        if (localPath === null) return nextResolve(specifier, context)

        const canonicalPath = canonicalTypeScriptPath(`${localPath}.ts`)
        if (canonicalPath === null) return nextResolve(specifier, context)
        return { url: pathToFileURL(canonicalPath).href, shortCircuit: true }
      },
      load(url, context, nextLoad) {
        if (typeof url !== 'string' || !url.startsWith('file:')) return nextLoad(url, context)

        let filePath
        try {
          filePath = fileURLToPath(url)
        } catch {
          return nextLoad(url, context)
        }
        const absolutePath = resolve(filePath)
        if (
          extname(absolutePath).toLowerCase() !== '.ts'
          || !strictDescendant(REPO_ROOT, absolutePath)
        ) return nextLoad(url, context)

        const canonicalPath = canonicalTypeScriptPath(absolutePath)
        if (canonicalPath === null) return nextLoad(url, context)

        let source
        try {
          source = readFileSync(canonicalPath, 'utf8')
        } catch {
          throw createLoaderFailure('TRANSFORM_FAILED')
        }

        let transformed
        try {
          transformed = stripTypeScriptTypes(source, { mode: 'transform', sourceMap: false })
        } catch {
          throw createLoaderFailure('TRANSFORM_FAILED')
        }
        if (typeof transformed !== 'string') throw createLoaderFailure('TRANSFORM_FAILED')

        onTransformed(canonicalPath)
        return { format: 'module', source: transformed, shortCircuit: true }
      },
    })
  } catch (caught) {
    if (
      isRecord(caught)
      && typeof caught.code === 'string'
      && SAFE_ERROR_CODE_PATTERN.test(caught.code)
    ) throw caught
    throw createLoaderFailure('HOOK_REGISTER_FAILED')
  }

  if (!isRecord(hooks) || typeof hooks.deregister !== 'function') {
    throw createLoaderFailure('HOOK_API_UNAVAILABLE')
  }
  return hooks
}

function safeNonnegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function sanitizeStartupFailure(caught) {
  const record = isRecord(caught) ? caught : null
  const location = record !== null && isRecord(record.loc) ? record.loc : null
  const name = record !== null && typeof record.name === 'string' ? record.name : undefined
  const code = record !== null && typeof record.code === 'string' ? record.code : undefined
  const metadata = { failureType: classifyStartupFailure(name, code) }

  if (code !== undefined && SAFE_ERROR_CODE_PATTERN.test(code)) metadata.errorCode = code
  if (
    record !== null
    && typeof record.plugin === 'string'
    && SAFE_PLUGIN_PATTERN.test(record.plugin)
  ) metadata.plugin = record.plugin

  const moduleFile = record === null
    ? null
    : sanitizeModuleFile(record.id) ?? sanitizeModuleFile(location?.file)
  if (moduleFile !== null) metadata.moduleFile = moduleFile

  const line = safeNonnegativeInteger(location?.line)
    ?? (record === null ? null : safeNonnegativeInteger(record.line))
  const column = safeNonnegativeInteger(location?.column)
    ?? (record === null ? null : safeNonnegativeInteger(record.column))
  if (line !== null) metadata.line = line
  if (column !== null) metadata.column = column

  return metadata
}

async function flushStartupFailureMarker(stage, failureMetadata = {}) {
  const demo = process.env.MIRROR_PHASE0_DEMO
  const marker = {
    marker: 'PHASE_DEMO_STEP',
    ...(typeof demo === 'string' && DEMO_IDS.has(demo) ? { demoId: demo } : {}),
    step: 'startup_failure',
    stage,
    reason: `startup_${stage}_failed`,
    ...(failureMetadata.failureType !== undefined ? { failureType: failureMetadata.failureType } : {}),
    ...(failureMetadata.errorCode !== undefined ? { errorCode: failureMetadata.errorCode } : {}),
    ...(failureMetadata.plugin !== undefined ? { plugin: failureMetadata.plugin } : {}),
    ...(failureMetadata.moduleFile !== undefined ? { moduleFile: failureMetadata.moduleFile } : {}),
    ...(failureMetadata.line !== undefined ? { line: failureMetadata.line } : {}),
    ...(failureMetadata.column !== undefined ? { column: failureMetadata.column } : {}),
  }
  await new Promise((resolvePromise) => {
    let settled = false
    let fallbackTimer
    const finish = () => {
      if (settled) return
      settled = true
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer)
      resolvePromise()
    }
    fallbackTimer = setTimeout(finish, 250)
    try {
      process.stdout.write(JSON.stringify(marker) + '\n', finish)
    } catch {
      finish()
    }
  })
}

function strictDescendant(root, candidate) {
  const child = relative(root, candidate)
  return child !== ''
    && child !== '..'
    && !child.startsWith(`..${sep}`)
    && !isAbsolute(child)
}

async function resolveRunRoot(input) {
  if (typeof input !== 'string' || input.trim() === '' || input.includes('\0')) return null
  const requested = resolve(input)
  try {
    const info = await lstat(requested)
    if (!info.isDirectory()) return null
  } catch (error) {
    if (!isRecord(error) || error.code !== 'ENOENT') return null
    try {
      await mkdir(requested, { recursive: true })
    } catch {
      return null
    }
  }
  try {
    const root = await realpath(requested)
    const info = await lstat(root)
    return info.isDirectory() ? root : null
  } catch {
    return null
  }
}

async function createRunDirectory(root) {
  try {
    const candidate = await mkdtemp(join(root, 'phase0-demo-'))
    const resolved = await realpath(candidate)
    if (!strictDescendant(root, resolved)) return null
    return resolved
  } catch {
    return null
  }
}

async function createElectronApplication(runDirectory) {
  const applicationDirectory = join(runDirectory, ELECTRON_APP_DIRECTORY_NAME)
  if (!strictDescendant(runDirectory, applicationDirectory)) return null

  try {
    await mkdir(applicationDirectory, { recursive: true })
    const applicationInfo = await lstat(applicationDirectory)
    if (!applicationInfo.isDirectory()) return null
    const resolvedApplicationDirectory = await realpath(applicationDirectory)
    const sameApplicationDirectory = process.platform === 'win32'
      ? resolvedApplicationDirectory.toLowerCase() === applicationDirectory.toLowerCase()
      : resolvedApplicationDirectory === applicationDirectory
    if (
      !sameApplicationDirectory
      || !strictDescendant(runDirectory, resolvedApplicationDirectory)
    ) return null

    const packagePath = join(resolvedApplicationDirectory, ELECTRON_APP_PACKAGE_NAME)
    const entryPath = join(resolvedApplicationDirectory, ELECTRON_APP_ENTRY_NAME)
    if (
      !strictDescendant(runDirectory, packagePath)
      || !strictDescendant(runDirectory, entryPath)
    ) return null
    for (const filePath of [packagePath, entryPath]) {
      try {
        if (!(await lstat(filePath)).isFile()) return null
      } catch (error) {
        if (!isRecord(error) || error.code !== 'ENOENT') return null
      }
    }

    await writeFile(packagePath, ELECTRON_APP_PACKAGE, 'utf8')
    await writeFile(entryPath, ELECTRON_APP_ENTRY, 'utf8')
    return resolvedApplicationDirectory
  } catch {
    return null
  }
}

async function removeOwnRunDirectory(root, runDirectory) {
  try {
    const info = await lstat(runDirectory)
    if (!info.isDirectory()) return false
    const resolvedRoot = await realpath(root)
    const resolvedRun = await realpath(runDirectory)
    if (resolvedRun !== runDirectory || !strictDescendant(resolvedRoot, resolvedRun)) return false
    await rm(runDirectory, { recursive: true, force: false })
    return true
  } catch {
    return false
  }
}

function parsePositiveInteger(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function parseArguments(argv) {
  const values = new Map()
  const booleans = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (BOOLEAN_FLAGS.has(argument)) {
      if (booleans.has(argument)) return null
      booleans.add(argument)
      continue
    }
    if (!VALUE_FLAGS.has(argument)) return null
    if (values.has(argument)) return null
    const value = argv[index + 1]
    if (typeof value !== 'string' || value.startsWith('--')) return null
    values.set(argument, value)
    index += 1
  }

  const demo = values.get('--demo')
  const buildCommit = values.get('--build-commit')
  const userDataRoot = values.get('--user-data-root')
  if (
    typeof demo !== 'string'
    || !DEMO_IDS.has(demo)
    || typeof buildCommit !== 'string'
    || !SAFE_BUILD_PATTERN.test(buildCommit)
    || typeof userDataRoot !== 'string'
    || userDataRoot.trim() === ''
    || userDataRoot.includes('\0')
  ) return null

  const requestedCase = values.get('--case')
  if (requestedCase !== undefined && !FAILURE_CASES.has(requestedCase)) return null
  if (demo !== 'P0-D2' && requestedCase !== undefined) return null
  const failureCase = demo === 'P0-D2' ? requestedCase ?? 'cloud-failure' : undefined

  const timeoutMs = values.has('--timeout-ms')
    ? parsePositiveInteger(values.get('--timeout-ms'))
    : 120_000
  const markerTimeoutMs = values.has('--marker-timeout-ms')
    ? parsePositiveInteger(values.get('--marker-timeout-ms'))
    : 15_000
  if (timeoutMs === null || markerTimeoutMs === null || markerTimeoutMs > timeoutMs) return null

  const soakMs = values.has('--soak-ms') ? parsePositiveInteger(values.get('--soak-ms')) : 0
  const sampleMs = values.has('--sample-ms') ? parsePositiveInteger(values.get('--sample-ms')) : 300_000
  if (soakMs === null || sampleMs === null) return null
  if (soakMs > 0 && (demo !== 'P0-D2' || failureCase !== 'cloud-failure')) return null
  if (values.has('--sample-ms') && soakMs === 0) return null
  if (soakMs > 0 && timeoutMs <= soakMs) return null
  if (booleans.has('--no-time-compression') && soakMs === 0) return null

  return {
    demo,
    failureCase,
    buildCommit,
    userDataRoot,
    timeoutMs,
    markerTimeoutMs,
    retainOnSuccess: booleans.has('--retain-on-success'),
    soakMs,
    sampleMs,
    noTimeCompression: booleans.has('--no-time-compression'),
  }
}

function localElectronExecutable() {
  const electronDist = join(REPO_ROOT, 'node_modules', 'electron', 'dist')
  if (process.platform === 'win32') return join(electronDist, 'electron.exe')
  if (process.platform === 'darwin') return join(electronDist, 'Electron.app', 'Contents', 'MacOS', 'Electron')
  return join(electronDist, 'electron')
}

async function terminateProcessTree(child) {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    await new Promise((settle) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        settle()
      }
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('close', finish)
      killer.once('error', finish)
      setTimeout(finish, 2_000)
    })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      // The child may already have exited.
    }
  }
}

function childEnvironment(options, runDirectory, processRole) {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.MIRROR_SMOKE_MS
  delete environment.MIRROR_FORCE_RENDERER_CRASH
  delete environment.MIRROR_FORCE_RENDERER_FAIL
  environment.MIRROR_PHASE0_CHILD = '1'
  environment.MIRROR_PHASE0_DEMO = options.demo
  environment.MIRROR_PHASE0_USER_DATA_ROOT = resolve(options.userDataRoot)
  environment.MIRROR_USER_DATA_DIR = runDirectory
  environment[ELECTRON_SCRIPT_PATH_ENV] = SCRIPT_PATH
  environment.MIRROR_BUILD_COMMIT = options.buildCommit
  environment.MIRROR_PHASE0_CASE = options.failureCase ?? ''
  environment.MIRROR_PHASE0_SOAK_MS = String(options.soakMs)
  environment.MIRROR_PHASE0_SAMPLE_MS = String(options.sampleMs)
  environment.MIRROR_PHASE0_NO_TIME_COMPRESSION = options.noTimeCompression ? '1' : '0'
  if (processRole === undefined) delete environment.MIRROR_PHASE0_PROCESS
  else environment.MIRROR_PHASE0_PROCESS = processRole
  return environment
}

async function runElectronChild(options, runDirectory, applicationDirectory, processRole, requireStart) {
  const electron = localElectronExecutable()
  const child = spawn(electron, [applicationDirectory], {
    cwd: REPO_ROOT,
    env: childEnvironment(options, runDirectory, processRole),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })

  let stdout = ''
  let timedOut = false
  let markerTimedOut = false
  let settled = false
  let startMarkerObserved = !requireStart
  let processTimer
  let markerTimer

  const result = await new Promise((settle) => {
    const finish = (code) => {
      if (settled) return
      settled = true
      clearTimeout(processTimer)
      clearTimeout(markerTimer)
      settle({ code, stdout, timedOut, markerTimedOut })
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.resume()
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
      if (!startMarkerObserved && parseMarkers(stdout).some((marker) => marker.marker === 'PHASE_DEMO_START')) {
        startMarkerObserved = true
        clearTimeout(markerTimer)
      }
    })
    child.once('error', () => finish(null))
    child.once('close', (code) => finish(code))

    processTimer = setTimeout(() => {
      timedOut = true
      void terminateProcessTree(child)
    }, options.timeoutMs)
    markerTimer = requireStart
      ? setTimeout(() => {
        markerTimedOut = true
        void terminateProcessTree(child)
      }, options.markerTimeoutMs)
      : undefined
  })

  return {
    ...result,
    markers: parseMarkers(result.stdout),
  }
}

function requireElectronCapabilities() {
  const electronModule = commonjsRequire('electron')
  const electronApp = isRecord(electronModule) ? electronModule.app : undefined
  const browserWindow = isRecord(electronModule) ? electronModule.BrowserWindow : undefined
  const moduleProcess = isRecord(electronModule) ? electronModule.process : undefined
  const electronProcess = isRecord(moduleProcess)
    && typeof moduleProcess.getProcessMemoryInfo === 'function'
    ? moduleProcess
    : process
  if (
    !isRecord(electronApp)
    || typeof electronApp.setPath !== 'function'
    || typeof electronApp.whenReady !== 'function'
    || typeof browserWindow !== 'function'
    || !isRecord(electronProcess)
    || typeof electronProcess.getProcessMemoryInfo !== 'function'
  ) {
    throw new Error('electron_capabilities_unavailable')
  }
  return {
    app: electronApp,
    createBrowserWindow: (options) => new browserWindow(options),
    getProcessMemoryInfo: electronProcess.getProcessMemoryInfo.bind(electronProcess),
  }
}

function resultMarker(markers) {
  return markers.find((marker) => marker.marker === 'PHASE_DEMO_RESULT') ?? null
}

function hasPassedResult(marker, demo) {
  return marker !== null
    && marker.demoId === demo
    && marker.result === 'passed'
    && marker.exit === 0
}

function withoutResultMarkers(markers) {
  return markers.filter((marker) => marker.marker !== 'PHASE_DEMO_RESULT')
}

async function finishOuterRun(options, runDirectory, markers, passed) {
  if (passed) {
    writeMarkers(markers)
    if (options.retainOnSuccess) return 0
    const removed = await removeOwnRunDirectory(resolve(options.userDataRoot), runDirectory)
    return removed ? 0 : 2
  }

  writeMarkers(withoutResultMarkers(markers))
  writeFailureMarker(options.demo, 'phase0_demo_failed')
  return 2
}

async function runD4(options, runDirectory, applicationDirectory) {
  const processA = await runElectronChild(options, runDirectory, applicationDirectory, 'A', true)
  if (processA.code !== 0 || processA.timedOut || processA.markerTimedOut) {
    return finishOuterRun(options, runDirectory, processA.markers, false)
  }

  const processB = await runElectronChild(options, runDirectory, applicationDirectory, 'B', false)
  const combined = [...withoutResultMarkers(processA.markers), ...withoutResultMarkers(processB.markers)]
  const passed = processB.code === 0
    && !processB.timedOut
    && processB.markers.some((marker) => marker.marker === 'PHASE_REOPEN_RESULT')
    && combined.filter((marker) => marker.marker === 'PHASE_RECORD_WRITTEN').length === 1
  if (!passed) return finishOuterRun(options, runDirectory, combined, false)

  combined.push({
    marker: 'PHASE_DEMO_RESULT',
    demoId: options.demo,
    result: 'passed',
    exit: 0,
    reason: 'contract_passed',
  })
  return finishOuterRun(options, runDirectory, combined, true)
}

async function runOuter(options) {
  const root = await resolveRunRoot(options.userDataRoot)
  if (root === null) {
    writeFailureMarker(options.demo, 'user_data_isolation_invalid')
    return 2
  }
  const runDirectory = await createRunDirectory(root)
  if (runDirectory === null) {
    writeFailureMarker(options.demo, 'user_data_isolation_invalid')
    return 2
  }

  const applicationDirectory = await createElectronApplication(runDirectory)
  if (applicationDirectory === null) {
    writeFailureMarker(options.demo, 'electron_application_setup_failed')
    return 2
  }

  if (options.demo === 'P0-D4') return runD4(options, runDirectory, applicationDirectory)

  const child = await runElectronChild(options, runDirectory, applicationDirectory, undefined, true)
  const childResult = resultMarker(child.markers)
  const passed = child.code === 0
    && !child.timedOut
    && !child.markerTimedOut
    && hasPassedResult(childResult, options.demo)
  if (passed) return finishOuterRun(options, runDirectory, child.markers, true)
  return finishOuterRun(options, runDirectory, child.markers, false)
}

async function runOuterCli() {
  const options = parseArguments(process.argv.slice(2))
  if (options === null) {
    writeFailureMarker(undefined, 'invalid_arguments')
    return 2
  }
  return runOuter(options)
}

async function runElectronEntry() {
  let electronApp
  let hooks
  let hadOwnGlobalRequire = false
  let previousGlobalRequire
  let globalRequireBridgeAttempted = false
  let lastTransformedModuleFile
  let exitCode = 2
  let startupStage = 'electron_import'
  let startupFailureStage
  let startupFailureMetadata
  try {
    const electronCapabilities = requireElectronCapabilities()
    electronApp = electronCapabilities.app
    startupStage = 'loader_api'
    const moduleApi = await import('node:module')
    startupStage = 'loader_register'
    hooks = registerPhase0ModuleHooks(moduleApi, (modulePath) => {
      const moduleFile = sanitizeModuleFile(modulePath)
      if (moduleFile !== null) lastTransformedModuleFile = moduleFile
    })
    startupStage = 'runner_module_load'
    hadOwnGlobalRequire = Object.prototype.hasOwnProperty.call(globalThis, 'require')
    previousGlobalRequire = hadOwnGlobalRequire ? globalThis.require : undefined
    globalRequireBridgeAttempted = true
    globalThis.require = commonjsRequire
    const loaded = await import(pathToFileURL(RUNNER_SOURCE_PATH).href)
    startupStage = 'runner_export'
    const run = loaded.runPhase0DemoFromElectron
    if (typeof run !== 'function') {
      startupFailureStage = startupStage
      startupFailureMetadata = { failureType: 'missing_export' }
    }
    else {
      startupStage = 'runner_execute'
      const code = await run(electronCapabilities)
      exitCode = code === 0 ? 0 : 2
    }
  } catch (caught) {
    startupFailureStage = startupStage
    startupFailureMetadata = sanitizeStartupFailure(caught)
    if (
      startupFailureMetadata.moduleFile === undefined
      && lastTransformedModuleFile !== undefined
    ) {
      startupFailureMetadata = {
        ...startupFailureMetadata,
        moduleFile: lastTransformedModuleFile,
      }
    }
    exitCode = 2
  } finally {
    if (hooks !== undefined) {
      try {
        await hooks.deregister()
      } catch {
        exitCode = 2
        if (startupFailureStage === undefined) {
          startupFailureStage = 'loader_cleanup'
          startupFailureMetadata = sanitizeStartupFailure(createLoaderFailure('HOOK_CLEANUP_FAILED'))
          if (
            startupFailureMetadata.moduleFile === undefined
            && lastTransformedModuleFile !== undefined
          ) {
            startupFailureMetadata = {
              ...startupFailureMetadata,
              moduleFile: lastTransformedModuleFile,
            }
          }
        }
      }
    }
    if (globalRequireBridgeAttempted) {
      try {
        if (hadOwnGlobalRequire) globalThis.require = previousGlobalRequire
        else if (Object.prototype.hasOwnProperty.call(globalThis, 'require')) delete globalThis.require
      } catch (caught) {
        exitCode = 2
        if (startupFailureStage === undefined) {
          startupFailureStage = startupStage
          startupFailureMetadata = sanitizeStartupFailure(caught)
          if (
            startupFailureMetadata.moduleFile === undefined
            && lastTransformedModuleFile !== undefined
          ) {
            startupFailureMetadata = {
              ...startupFailureMetadata,
              moduleFile: lastTransformedModuleFile,
            }
          }
        }
      }
    }
    if (startupFailureStage !== undefined) {
      await flushStartupFailureMarker(startupFailureStage, startupFailureMetadata)
    }
    if (electronApp === undefined) {
      process.exitCode = exitCode
      return
    }
    try {
      if (electronApp.isReady()) electronApp.exit(exitCode)
      else await electronApp.whenReady().then(() => electronApp.exit(exitCode))
    } catch {
      process.exitCode = exitCode
    }
  }
}

let exitCode = null
if (process.env.MIRROR_PHASE0_CHILD === '1') {
  await runElectronEntry()
} else {
  try {
    exitCode = await runOuterCli()
  } catch {
    writeFailureMarker(undefined, 'phase0_cli_failed')
    exitCode = 2
  }
}

if (exitCode !== null) process.exitCode = exitCode
