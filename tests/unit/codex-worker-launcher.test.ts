import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const canonicalRepoRoot = String.raw`C:\Project\magic-mirror`
const launcherPath = join(repoRoot, 'scripts', 'invoke-codex-worker.ps1')
const powershell = 'pwsh'
const canonicalOuterInvocation =
  'pwsh -NoLogo -NoProfile -NonInteractive -File scripts/invoke-codex-worker.ps1 -Role <role> -PromptPath <path>'
const outputCapBytes = 8 * 1024
const finalAgentMessage = 'tester-evidence:\r\nstatus=pass\r\nexit_code=0'
const rawFixtureSentinels = [
  'turn.started',
  'item.completed',
  'progress-payload-sentinel',
  'missing-final-progress-sentinel',
  'synthetic-file-change',
  'synthetic-idle-file-change',
  'malformed-jsonl-sentinel',
  'stderr-noise-sentinel',
  'flood-sentinel',
  'stderr-flood-sentinel'
] as const
const powerShellFailureClassPattern =
  /\b(?:ParserError|CommandNotFoundException|PropertyNotFoundException|MethodInvocationException|PropertyAssignmentException|ParameterBindingException|RuntimeException|ParentContainsErrorRecordException|UnauthorizedAccess)\b/
const launcherLinePattern = /(?:invoke-codex-worker\.ps1:|line\s+)(\d+)/i

type WorkerRole = 'implementer' | 'surveyor' | 'tester'

interface LauncherRunOptions {
  readonly timeoutSeconds?: number
  readonly postWriteIdleTimeoutSeconds?: number
  readonly firstWriteTimeoutSeconds?: number
  readonly maxOutputBytes?: number
  readonly flood?: boolean
  readonly scenario?:
    | 'success'
    | 'file-change-idle'
    | 'malformed'
    | 'missing-final'
    | 'empty-final-message'
  readonly finalMessage?: string
  readonly idleProcessTree?: boolean
  readonly workerActive?: string
  readonly patchSignal?: 'none' | 'completed'
  readonly patchSignalStream?: 'stdout' | 'stderr'
}

interface Fixture {
  readonly captureDir: string
  readonly fakeCodexPath: string
  readonly fakeGrandchildPath: string
  readonly promptPath: string
  readonly stdinPath: string
  readonly argvPath: string
  readonly workerActivePath: string
  readonly childPidPath: string
  readonly grandchildPidPath: string
}

interface LauncherRun {
  readonly status: number | null
  readonly spawnErrorName: string | null
  readonly launcherFailureMarker: string
  readonly stderrBytes: number
  readonly stdoutBytes: number
  readonly forwardedFinalMessageCount: number
  readonly forwardedFinalMessageExactly: boolean
  readonly forwardedRawEventEncoding: boolean
  readonly forwardedProgressPayload: boolean
  readonly forwardedToolPayload: boolean
  readonly forwardedStderrNoise: boolean
  readonly forwardedFloodSentinel: boolean
  readonly forwardedRawFixtureContent: boolean
  readonly powerShellFailureClass: string
  readonly launcherLine: string
  readonly emptyParameterName: string
}

const fixtureDirs: string[] = []
const fixturePidPaths: string[] = []

const fakeCodexScript = `
$capture = $env:MM_CODEX_WORKER_CAPTURE_DIR
$utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
$workerActive = [string]$env:MIRROR_CODEX_WORKER_ACTIVE
$scenario = [string]$env:MM_CODEX_WORKER_SCENARIO
$finalMessage = [string]$env:MM_CODEX_WORKER_FINAL_MESSAGE
[System.IO.File]::WriteAllText((Join-Path $capture 'worker-active.txt'), $workerActive, $utf8)

function Write-JsonEvent([hashtable]$event) {
  [Console]::Out.WriteLine(($event | ConvertTo-Json -Compress -Depth 8))
  [Console]::Out.Flush()
}

if ($scenario -eq 'file-change-idle') {
  Write-JsonEvent @{
    type = 'item.completed'
    item = @{
      type = 'file_change'
      id = 'synthetic-idle-file-change'
      path = 'synthetic/idle.ts'
    }
  }
  $env:MM_CODEX_WORKER_HANG = '1'
}

if ($env:MM_CODEX_WORKER_PATCH_SIGNAL -eq 'completed') {
  if ($env:MM_CODEX_WORKER_PATCH_SIGNAL_STREAM -eq 'stderr') {
    [Console]::Error.WriteLine('patch: completed')
    [Console]::Error.Flush()
  }
  else {
    [Console]::Out.WriteLine('patch: completed')
    [Console]::Out.Flush()
  }
}

if ($env:MM_CODEX_WORKER_HANG -eq '1' -or $env:MM_CODEX_WORKER_FLOOD -eq '1') {
  [System.IO.File]::WriteAllText((Join-Path $capture 'child.pid'), [string]$PID, $utf8)

  $grandchildScript = Join-Path $capture 'fake-grandchild.ps1'
  $powerShellHost = Join-Path $PSHOME 'pwsh.exe'
  $grandchild = Start-Process -FilePath $powerShellHost -ArgumentList @(
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-File',
    $grandchildScript
  ) -PassThru -WindowStyle Hidden
  [System.IO.File]::WriteAllText((Join-Path $capture 'grandchild.pid'), [string]$grandchild.Id, $utf8)

  if ($env:MM_CODEX_WORKER_FLOOD -eq '1') {
    $stdoutBlock = '{"type":"progress","payload":{"marker":"flood-sentinel-' + (('S' * 256) -join '') + '"}}'
    $stderrBlock = '{"type":"progress","payload":{"marker":"stderr-flood-sentinel-' + (('E' * 256) -join '') + '"}}'

    while ($true) {
      [Console]::Out.WriteLine($stdoutBlock)
      [Console]::Error.WriteLine($stderrBlock)
      [Console]::Out.Flush()
      [Console]::Error.Flush()
    }
  }

  while ($true) {
    Start-Sleep -Seconds 1
  }
}

$argvText = @($args) -join [char]0
[System.IO.File]::WriteAllText((Join-Path $capture 'argv.txt'), $argvText, $utf8)

$inputStream = [Console]::OpenStandardInput()
$memory = New-Object -TypeName System.IO.MemoryStream
$buffer = New-Object byte[] 4096
$read = 0
do {
  $read = $inputStream.Read($buffer, 0, $buffer.Length)
  if ($read -gt 0) {
    $memory.Write($buffer, 0, $read)
  }
} while ($read -gt 0)
[System.IO.File]::WriteAllBytes((Join-Path $capture 'stdin.bin'), $memory.ToArray())

if ($scenario -eq 'success') {
  Write-JsonEvent @{
    type = 'turn.started'
    payload = @{ marker = 'progress-payload-sentinel' }
  }
  Write-JsonEvent @{
    type = 'item.completed'
    item = @{
      type = 'file_change'
      id = 'synthetic-file-change'
      path = 'synthetic/path.ts'
    }
  }
  Write-JsonEvent @{
    type = 'item.completed'
    item = @{
      type = 'agent_message'
      text = $finalMessage
    }
  }
  [Console]::Error.WriteLine('stderr-noise-sentinel')
  [Console]::Error.Flush()
  exit 0
}

if ($scenario -eq 'empty-final-message') {
  Write-JsonEvent @{
    type = 'item.completed'
    item = @{
      type = 'agent_message'
      text = $finalMessage
    }
  }
  Write-JsonEvent @{
    type = 'item.completed'
    item = @{
      type = 'agent_message'
      text = ''
    }
  }
  exit 0
}

if ($scenario -eq 'missing-final') {
  Write-JsonEvent @{
    type = 'turn.started'
    payload = @{ marker = 'missing-final-progress-sentinel' }
  }
  exit 0
}

if ($scenario -eq 'malformed') {
  [Console]::Out.WriteLine('malformed-jsonl-sentinel')
  [Console]::Out.Flush()
  exit 0
}

exit 0
`

const fakeGrandchildScript = `
while ($true) {
  Start-Sleep -Seconds 1
}
`

function makePrompt(role: WorkerRole): string {
  return [
    'model: "gpt-5.6-luna"',
    'reasoning_effort: "max"',
    `role: "${role}"`,
    'fresh_worker: true',
    'task: H1 RED launcher contract only',
    'write_scope: tests/unit/codex-worker-launcher.test.ts',
    'skills: .agents/skills/mm-phase-workflow/SKILL.md, .agents/skills/mm-invariants/SKILL.md, .agents/skills/mm-realtime-voice/SKILL.md',
    'self_invariants: 1,2,3,4,5,6,7,8,9,10,11,12',
    'evidence: changed path; metadata-only statuses and exit codes',
    'self_review: read own diff; at most 2 passes',
    'root_review: interactive root external gate',
    String.raw`path_marker: C:\Project\magic-mirror`,
    'punctuation_marker: []{}()<>|&^%!?'
  ].join('\r\n') + '\r\n'
}

function expectedWorkerContextPreamble(role: WorkerRole): Buffer {
  return Buffer.from(
    [
      'worker_context_version: "H6"',
      'already_launched: true',
      `role: "${role}"`,
      'root_authority: false',
      'recursive_codex: forbidden',
      'recursive_launcher: forbidden',
      'global_skill_mode: "subagent-stop"',
      'quiet_reads: true',
      'read_scope_enforcement: "exact_only"',
      'source_body_output: "forbidden_unless_evidence_requires"',
      'terminal_read_output: "metadata_only"',
      'repository_wide_discovery: "forbidden"',
      'first_write_deadline_seconds: 420',
      'post_write_idle_deadline_seconds: 120',
      'max_read_output_lines: 200',
      '--- BEGIN ORIGINAL PROMPT ---'
    ].join('\r\n') + '\r\n',
    'utf8'
  )
}

async function makeFixture(prompt: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'magic-mirror-codex-worker-'))
  fixtureDirs.push(root)

  const captureDir = join(root, 'capture')
  const promptPath = join(root, 'prompt.txt')
  const fakeCodexPath = join(root, 'fake-codex.ps1')
  const fakeGrandchildPath = join(captureDir, 'fake-grandchild.ps1')
  const stdinPath = join(captureDir, 'stdin.bin')
  const argvPath = join(captureDir, 'argv.txt')
  const workerActivePath = join(captureDir, 'worker-active.txt')
  const childPidPath = join(captureDir, 'child.pid')
  const grandchildPidPath = join(captureDir, 'grandchild.pid')

  await mkdir(captureDir)
  await writeFile(promptPath, Buffer.from(prompt, 'utf8'))
  await writeFile(fakeCodexPath, Buffer.from(fakeCodexScript, 'utf8'))
  await writeFile(fakeGrandchildPath, Buffer.from(fakeGrandchildScript, 'utf8'))
  fixturePidPaths.push(childPidPath, grandchildPidPath)

  return {
    captureDir,
    fakeCodexPath,
    fakeGrandchildPath,
    promptPath,
    stdinPath,
    argvPath,
    workerActivePath,
    childPidPath,
    grandchildPidPath
  }
}

function runLauncher(
  fixture: Fixture,
  role: WorkerRole,
  options: number | LauncherRunOptions = {}
): LauncherRun {
  const normalizedOptions = typeof options === 'number' ? { timeoutSeconds: options } : options
  const {
    timeoutSeconds,
    postWriteIdleTimeoutSeconds,
    firstWriteTimeoutSeconds,
    maxOutputBytes,
    flood = false,
    scenario = undefined,
    finalMessage = '',
    idleProcessTree = false,
    workerActive = '0',
    patchSignal = 'none',
    patchSignalStream = 'stdout'
  } = normalizedOptions
  const launcherArguments = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-File',
    launcherPath,
    '-Role',
    role,
    '-PromptPath',
    fixture.promptPath
  ]
  if (timeoutSeconds !== undefined) {
    launcherArguments.push('-TimeoutSeconds', String(timeoutSeconds))
  }
  if (postWriteIdleTimeoutSeconds !== undefined) {
    launcherArguments.push('-PostWriteIdleTimeoutSeconds', String(postWriteIdleTimeoutSeconds))
  }
  if (firstWriteTimeoutSeconds !== undefined) {
    launcherArguments.push('-FirstWriteTimeoutSeconds', String(firstWriteTimeoutSeconds))
  }
  if (maxOutputBytes !== undefined) {
    launcherArguments.push('-MaxOutputBytes', String(maxOutputBytes))
  }
  launcherArguments.push('-CodexCommandPath', fixture.fakeCodexPath)

  const result = spawnSync(
    powershell,
    launcherArguments,
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        MM_CODEX_WORKER_CAPTURE_DIR: fixture.captureDir,
        MM_CODEX_WORKER_HANG:
          timeoutSeconds !== undefined &&
          !flood &&
          scenario !== 'success' &&
          scenario !== 'malformed' &&
          scenario !== 'missing-final' &&
          (idleProcessTree || patchSignal !== 'completed' || patchSignalStream === 'stderr')
            ? '1'
            : '0',
        MM_CODEX_WORKER_FLOOD: flood ? '1' : '0',
        MM_CODEX_WORKER_SCENARIO: scenario ?? '',
        MM_CODEX_WORKER_FINAL_MESSAGE: finalMessage,
        MM_CODEX_WORKER_PATCH_SIGNAL: patchSignal,
        MM_CODEX_WORKER_PATCH_SIGNAL_STREAM: patchSignalStream,
        MIRROR_CODEX_WORKER_ACTIVE: workerActive
      },
      encoding: 'buffer',
      maxBuffer: outputCapBytes,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutSeconds === undefined ? undefined : 10_000,
      windowsHide: true
    }
  )

  const launcherFailureMarker = Buffer.isBuffer(result.stderr)
    ? result.stderr.toString('utf8').match(
        /codex_worker_launcher stage=[a-z_]+ status=failed reason=[a-z_]+/
      )?.[0] ?? 'unavailable'
    : 'unavailable'
  const stdoutBuffer = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0)
  const stderrBuffer = Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0)
  const stdoutText = stdoutBuffer.toString('utf8')
  const stderrText = stderrBuffer.toString('utf8')
  const combinedOutput = `${stdoutText}\n${stderrText}`
  const forwardedRawFixtureContent = rawFixtureSentinels.some((sentinel) =>
    combinedOutput.includes(sentinel)
  )
  const forwardedFinalMessageCount =
    finalMessage.length === 0 ? 0 : stdoutText.split(finalMessage).length - 1
  const powerShellFailureClass =
    combinedOutput.match(powerShellFailureClassPattern)?.[0] ?? 'unavailable'
  const launcherLine = combinedOutput.match(launcherLinePattern)?.[1] ?? 'unavailable'
  const emptyParameterName =
    combinedOutput.match(
      /Cannot\s+bind\s+argument\s+to\s+parameter\s+['"]([A-Za-z_][A-Za-z0-9_]*)['"]\s+because\s+it\s+is\s+(?:an\s+empty\s+string|null)\b/i
    )?.[1] ??
    'unavailable'

  return {
    status: result.status,
    spawnErrorName: result.error?.name ?? null,
    launcherFailureMarker,
    stderrBytes: stderrBuffer.length,
    stdoutBytes: stdoutBuffer.length,
    forwardedFinalMessageCount,
    forwardedFinalMessageExactly: finalMessage.length > 0 && stdoutText === finalMessage,
    forwardedRawEventEncoding:
      stdoutText.includes('turn.started') || stdoutText.includes('item.completed'),
    forwardedProgressPayload:
      combinedOutput.includes('progress-payload-sentinel') ||
      combinedOutput.includes('missing-final-progress-sentinel'),
    forwardedToolPayload:
      combinedOutput.includes('synthetic-file-change') ||
      combinedOutput.includes('synthetic-idle-file-change'),
    forwardedStderrNoise: combinedOutput.includes('stderr-noise-sentinel'),
    forwardedFloodSentinel:
      combinedOutput.includes('flood-sentinel') || combinedOutput.includes('stderr-flood-sentinel'),
    forwardedRawFixtureContent,
    powerShellFailureClass,
    launcherLine,
    emptyParameterName
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readFixturePid(path: string): Promise<number> {
  const value = Number.parseInt((await readFile(path, 'utf8')).trim(), 10)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`fixture PID must be a positive integer: ${path}`)
  }
  return value
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (processExists(pid) && Date.now() < deadline) {
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  return !processExists(pid)
}

async function readRecordedFixturePid(path: string): Promise<number | null> {
  try {
    return await readFixturePid(path)
  } catch {
    return null
  }
}

afterEach(async () => {
  const recordedPidPaths = fixturePidPaths.splice(0)
  const recordedPids = new Set(
    (
      await Promise.all(recordedPidPaths.map((path) => readRecordedFixturePid(path)))
    ).filter((pid): pid is number => pid !== null)
  )
  await Promise.all(
    [...recordedPids].map(async (pid) => {
      try {
        process.kill(pid)
      } catch {
        return
      }
      await waitForProcessExit(pid, 1_000)
    })
  )
  await Promise.all(fixtureDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe('Codex worker launcher contract', () => {
  it('routes both migrated worker instructions through the canonical launcher and pins SDK guidance', async () => {
    const [agents, phaseWorkflow, realtimeVoice] = await Promise.all([
      readFile(resolve(repoRoot, 'AGENTS.md'), 'utf8'),
      readFile(resolve(repoRoot, '.agents', 'skills', 'mm-phase-workflow', 'SKILL.md'), 'utf8'),
      readFile(resolve(repoRoot, '.agents', 'skills', 'mm-realtime-voice', 'SKILL.md'), 'utf8')
    ])

    for (const [path, source] of [
      ['AGENTS.md', agents],
      ['.agents/skills/mm-phase-workflow/SKILL.md', phaseWorkflow]
    ] as const) {
      expect(source, `${path} must name the canonical launcher`).toContain(
        'scripts/invoke-codex-worker.ps1'
      )
      expect(source, `${path} must retain the explicit profile flag`).toContain('--profile')
      expect(source, `${path} must retain nova-auto`).toContain('nova-auto')
      expect(source, `${path} must retain ephemeral execution`).toContain('--ephemeral')
      expect(source, `${path} must retain the worker routing model`).toContain('gpt-5.6-luna')
      expect(source, `${path} must retain max reasoning`).toContain('max')
      expect(source, `${path} must retain role routing requirements`).toContain('role')
      expect(source, `${path} must retain the exact write scope requirement`).toContain('write_scope')
      expect(source, `${path} must retain the evidence requirement`).toContain('evidence')
      expect(source, `${path} must require the PowerShell 7 outer host`).toContain('PowerShell 7')
      expect(source, `${path} must name the pwsh outer host`).toContain('pwsh')
      expect(source, `${path} must retain the compact canonical outer invocation`).toContain(
        canonicalOuterInvocation
      )
      expect(source, `${path} must reject Windows PowerShell 5.1 as the outer host`).toContain(
        'Windows PowerShell 5.1'
      )
      expect(source, `${path} must not require an execution policy`).not.toContain(
        '-ExecutionPolicy'
      )
    }

    expect(realtimeVoice, 'realtime package guidance must pin @openai/agents 0.16.1').toMatch(
      /@openai\/agents\s+\*\*0\.16\.1\*\*/
    )
    expect(
      realtimeVoice,
      'realtime package guidance must pin @openai/agents-realtime 0.16.1'
    ).toMatch(/@openai\/agents-realtime\s+\*\*0\.16\.1\*\*/)
    expect(
      realtimeVoice,
      'realtime package guidance must name @openai/agents-core'
    ).toContain('@openai/agents-core')
    expect(
      realtimeVoice,
      'realtime package guidance must name @openai/agents-openai'
    ).toContain('@openai/agents-openai')
    expect(
      realtimeVoice,
      'realtime package guidance must describe openai ^7.2.0 as an umbrella-package dependency'
    ).toMatch(/openai[\s`*]+\^7\.2\.0[\s`*]+is an umbrella-package dependency/)
    expect(
      realtimeVoice,
      'realtime package guidance must reject nonexistent realtime-core package names'
    ).not.toContain('@openai/agents-realtime-core')
    expect(
      realtimeVoice,
      'realtime package guidance must reject nonexistent realtime-openai package names'
    ).not.toContain('@openai/agents-realtime-openai')
    expect(
      realtimeVoice,
      'realtime package guidance must not exact-pin openai 7.4.0'
    ).not.toMatch(/\bopenai\b[^\r\n]{0,40}\b7\.4\.0\b/)
  })

  it('documents the bounded H2 worker harness contract in both control-plane sources', async () => {
    const [agents, phaseWorkflow, launcher] = await Promise.all([
      readFile(resolve(repoRoot, 'AGENTS.md'), 'utf8'),
      readFile(resolve(repoRoot, '.agents', 'skills', 'mm-phase-workflow', 'SKILL.md'), 'utf8'),
      readFile(resolve(repoRoot, 'scripts', 'invoke-codex-worker.ps1'), 'utf8')
    ])

    const requiredDocumentationPhrases: readonly string[] = [
      '-TimeoutSeconds 600',
      '-MaxOutputBytes 4194304',
      'three separate PowerShell command boundaries',
      'prompt creation',
      'launcher invocation',
      'exact prompt cleanup',
      'Never combine prompt creation, launcher invocation, and prompt cleanup in one shell expression.',
      'temporary UTF-8 file outside the repository',
      'exact resolved path only after the worker completes',
      'codex_worker_launcher stage=timeout status=failed reason=deadline_exceeded',
      'codex_worker_launcher stage=output status=failed reason=limit_exceeded',
      'first_write_deadline_seconds: 420',
      'exact descendant process tree',
      'Read only targeted files and required skill sections.',
      'Do not dump unrelated source or skill content or flood worker output.',
      'already-launched worker executes directly',
      'must not recursively invoke Codex or the launcher'
    ]

    const staleH1Sentence =
      'H1 launcher routing does not claim H2 timeout, output, or process-tree behavior.'

    for (const [path, source] of [
      ['AGENTS.md', agents],
      ['.agents/skills/mm-phase-workflow/SKILL.md', phaseWorkflow]
    ] as const) {
      for (const phrase of requiredDocumentationPhrases) {
        expect(source, `${path} must contain exact phrase: ${phrase}`).toContain(phrase)
      }
      expect(source, `${path} must remove the stale H1-only sentence`).not.toContain(
        staleH1Sentence
      )
    }

    expect(
      launcher,
      'launcher must default first-write supervision to 420 seconds'
    ).toContain('[int]$FirstWriteTimeoutSeconds = 420')
  })

  it('launches a matching tester envelope with exact argv and byte-preserved prompt stdin', async () => {
    const prompt = makePrompt('tester')
    const fixture = await makeFixture(prompt)
    const run = runLauncher(fixture, 'tester', {
      scenario: 'success',
      finalMessage: finalAgentMessage
    })

    expect(run.spawnErrorName, 'PowerShell must be available for the launcher contract').toBeNull()
    expect(
      run.status,
      `matching tester envelope must launch the fake codex; launcherFailureMarker=${run.launcherFailureMarker}; stdoutBytes=${run.stdoutBytes}; stderrBytes=${run.stderrBytes}; powerShellFailureClass=${run.powerShellFailureClass}; launcherLine=${run.launcherLine}; emptyParameterName=${run.emptyParameterName}`
    ).toBe(0)

    const argv = (await readFile(fixture.argvPath, 'utf8')).split('\0')
    expect(argv).toEqual([
      'exec',
      '--profile',
      'nova-auto',
      '--ephemeral',
      '--cd',
      canonicalRepoRoot,
      '-m',
      'gpt-5.6-luna',
      '-c',
      'model_reasoning_effort="max"',
      '--json',
      '-'
    ])
    expect(await readFile(fixture.stdinPath)).toEqual(
      Buffer.concat([expectedWorkerContextPreamble('tester'), Buffer.from(prompt, 'utf8')])
    )
    expect(await readFile(fixture.workerActivePath, 'utf8')).toBe('1')
  })

  it('forwards only the final agent message from structured JSONL output', async () => {
    const fixture = await makeFixture(makePrompt('tester'))
    const run = runLauncher(fixture, 'tester', {
      scenario: 'success',
      finalMessage: finalAgentMessage
    })

    expect(run.status, 'structured success must exit cleanly').toBe(0)
    expect(run.forwardedFinalMessageExactly, 'final agent message must be forwarded exactly').toBe(
      true
    )
    expect(run.forwardedFinalMessageCount, 'final agent message must be forwarded once').toBe(1)
    expect(run.forwardedRawEventEncoding, 'raw JSONL event encoding must not be forwarded').toBe(
      false
    )
    expect(run.forwardedProgressPayload, 'progress payloads must not be forwarded').toBe(false)
    expect(run.forwardedToolPayload, 'file-change payloads must not be forwarded').toBe(false)
    expect(run.forwardedStderrNoise, 'stderr noise must not be forwarded').toBe(false)
    expect(run.forwardedRawFixtureContent, 'raw fixture sentinels must not be forwarded').toBe(false)
  })

  it('forwards the latest nonempty agent message when a later message is empty', async () => {
    const fixture = await makeFixture(makePrompt('tester'))
    const run = runLauncher(fixture, 'tester', {
      scenario: 'empty-final-message',
      finalMessage: finalAgentMessage
    })

    expect(run.status, 'empty trailing agent message must still exit cleanly').toBe(0)
    expect(
      run.forwardedFinalMessageExactly,
      'latest nonempty agent message must be forwarded exactly'
    ).toBe(true)
    expect(run.forwardedFinalMessageCount, 'latest nonempty agent message must be forwarded once').toBe(
      1
    )
    expect(run.forwardedRawEventEncoding, 'raw JSONL event encoding must not be forwarded').toBe(
      false
    )
    expect(run.forwardedProgressPayload, 'progress payloads must not be forwarded').toBe(false)
    expect(run.forwardedToolPayload, 'tool payloads must not be forwarded').toBe(false)
    expect(run.forwardedStderrNoise, 'stderr noise must not be forwarded').toBe(false)
    expect(run.forwardedRawFixtureContent, 'raw fixture sentinels must not be forwarded').toBe(false)
  })

  it('rejects malformed structured JSONL with an exact protocol marker and no raw fixture leakage', async () => {
    const fixture = await makeFixture(makePrompt('tester'))
    const run = runLauncher(fixture, 'tester', { scenario: 'malformed' })

    expect(run.status, 'malformed JSONL must use the protocol failure exit code').toBe(2)
    expect(run.launcherFailureMarker, 'malformed JSONL must report the exact protocol marker').toBe(
      'codex_worker_launcher stage=protocol status=failed reason=invalid_jsonl'
    )
    expect(run.forwardedRawFixtureContent, 'malformed fixture content must not be forwarded').toBe(
      false
    )
  })

  it('rejects zero-exit structured output without a final message with an exact protocol marker', async () => {
    const fixture = await makeFixture(makePrompt('tester'))
    const run = runLauncher(fixture, 'tester', { scenario: 'missing-final' })

    expect(run.status, 'missing final message must use the protocol failure exit code').toBe(2)
    expect(
      run.launcherFailureMarker,
      'missing final message must report the exact protocol marker'
    ).toBe('codex_worker_launcher stage=protocol status=failed reason=missing_final_message')
    expect(run.forwardedRawFixtureContent, 'missing-final fixture content must not be forwarded').toBe(
      false
    )
  })

  it('rejects recursive launcher invocation from the inherited worker marker before invoking fake codex', async () => {
    const fixture = await makeFixture(makePrompt('tester'))
    const run = runLauncher(fixture, 'tester', { workerActive: '1' })

    expect(run.spawnErrorName, 'PowerShell must be available for recursion validation').toBeNull()
    expect(run.status, 'recursive invocation must use the launcher preflight exit code').toBe(2)
    expect(run.launcherFailureMarker, 'launcher must reject inherited worker identity during preflight').toBe(
      'codex_worker_launcher stage=preflight status=failed reason=recursive_invocation'
    )
    expect(await pathExists(fixture.argvPath), 'fake codex must not receive recursive work').toBe(false)
    expect(await pathExists(fixture.stdinPath), 'fake codex must not receive recursive prompt').toBe(false)
  })

  it('rejects a mismatched role envelope before invoking fake codex', async () => {
    const fixture = await makeFixture(makePrompt('implementer'))
    const run = runLauncher(fixture, 'tester')

    expect(run.spawnErrorName, 'PowerShell must be available for validation').toBeNull()
    expect(run.status, 'mismatched role must fail before launch').not.toBe(0)
    expect(run.launcherFailureMarker, 'launcher must reject the mismatched role during preflight').toBe(
      'codex_worker_launcher stage=preflight status=failed reason=mismatch_role'
    )
    expect(run.status, 'preflight mismatch must use the launcher preflight exit code').toBe(2)
    expect(await pathExists(fixture.argvPath), 'fake codex must not receive invalid work').toBe(false)
    expect(await pathExists(fixture.stdinPath), 'fake codex must not receive invalid prompt').toBe(false)
  })

  it('times out and terminates the exact fake pwsh process tree', async () => {
    const fixture = await makeFixture(makePrompt('tester'))
    const run = runLauncher(fixture, 'tester', 1)

    expect(run.spawnErrorName, 'PowerShell must be available for timeout validation').toBeNull()
    expect(run.status, 'timeout must use the launcher timeout exit code').toBe(2)
    expect(run.launcherFailureMarker, 'timeout must report the exact launcher marker').toBe(
      'codex_worker_launcher stage=timeout status=failed reason=deadline_exceeded'
    )

    const [childPid, grandchildPid] = await Promise.all([
      readFixturePid(fixture.childPidPath),
      readFixturePid(fixture.grandchildPidPath)
    ])
    const [childGone, grandchildGone] = await Promise.all([
      waitForProcessExit(childPid, 3_000),
      waitForProcessExit(grandchildPid, 3_000)
    ])

    expect(childGone, `fake child PID ${childPid} must be gone`).toBe(true)
    expect(grandchildGone, `fake grandchild PID ${grandchildPid} must be gone`).toBe(true)
  })

  it('enforces the implementer first-write deadline and confirms the exact fake process tree', async () => {
    const fixture = await makeFixture(makePrompt('implementer'))
    const run = runLauncher(fixture, 'implementer', {
      timeoutSeconds: 10,
      firstWriteTimeoutSeconds: 1
    })

    expect(run.spawnErrorName, 'PowerShell must be available for first-write validation').toBeNull()
    expect(run.status, 'missing implementer completion signal must use the first-write exit code').toBe(2)
    expect(run.launcherFailureMarker, 'first-write timeout must report the exact launcher marker').toBe(
      'codex_worker_launcher stage=first_write status=failed reason=deadline_exceeded'
    )

    if (
      run.status !== 2 ||
      run.launcherFailureMarker !==
        'codex_worker_launcher stage=first_write status=failed reason=deadline_exceeded'
    ) {
      return
    }

    const [childPid, grandchildPid] = await Promise.all([
      readFixturePid(fixture.childPidPath),
      readFixturePid(fixture.grandchildPidPath)
    ])
    const [childGone, grandchildGone] = await Promise.all([
      waitForProcessExit(childPid, 3_000),
      waitForProcessExit(grandchildPid, 3_000)
    ])

    expect(childGone, `fake child PID ${childPid} must be gone`).toBe(true)
    expect(grandchildGone, `fake grandchild PID ${grandchildPid} must be gone`).toBe(true)
  })

  it('treats a structured file change as first-write and then enforces post-write idle termination', async () => {
    const fixture = await makeFixture(makePrompt('implementer'))
    const run = runLauncher(fixture, 'implementer', {
      timeoutSeconds: 10,
      firstWriteTimeoutSeconds: 1,
      postWriteIdleTimeoutSeconds: 1,
      scenario: 'file-change-idle',
      idleProcessTree: true
    })

    expect(run.status, 'post-write idle timeout must use the launcher failure exit code').toBe(2)
    expect(run.launcherFailureMarker, 'file change must arm post-write idle supervision').toBe(
      'codex_worker_launcher stage=post_write status=failed reason=deadline_exceeded'
    )

    if (
      run.status !== 2 ||
      run.launcherFailureMarker !==
        'codex_worker_launcher stage=post_write status=failed reason=deadline_exceeded'
    ) {
      return
    }

    const [childPid, grandchildPid] = await Promise.all([
      readFixturePid(fixture.childPidPath),
      readFixturePid(fixture.grandchildPidPath)
    ])
    const [childGone, grandchildGone] = await Promise.all([
      waitForProcessExit(childPid, 3_000),
      waitForProcessExit(grandchildPid, 3_000)
    ])

    expect(childGone, `fake child PID ${childPid} must be gone`).toBe(true)
    expect(grandchildGone, `fake grandchild PID ${grandchildPid} must be gone`).toBe(true)
  })

  it('allows an implementer to finish normally after structured file change and final agent message', async () => {
    const fixture = await makeFixture(makePrompt('implementer'))
    const run = runLauncher(fixture, 'implementer', {
      timeoutSeconds: 10,
      firstWriteTimeoutSeconds: 1,
      scenario: 'success',
      finalMessage: finalAgentMessage
    })

    expect(run.spawnErrorName, 'PowerShell must be available for structured success validation').toBeNull()
    expect(
      run.status,
      `structured implementer success must allow normal exit; launcherFailureMarker=${run.launcherFailureMarker}; stdoutBytes=${run.stdoutBytes}; stderrBytes=${run.stderrBytes}; powerShellFailureClass=${run.powerShellFailureClass}; launcherLine=${run.launcherLine}; emptyParameterName=${run.emptyParameterName}`
    ).toBe(0)
    expect(run.forwardedFinalMessageExactly, 'final agent message must be forwarded exactly').toBe(
      true
    )
    expect(run.forwardedFinalMessageCount, 'final agent message must be forwarded once').toBe(1)
    expect(run.forwardedRawEventEncoding, 'raw JSONL event encoding must not be forwarded').toBe(
      false
    )
    expect(run.forwardedProgressPayload, 'progress payloads must not be forwarded').toBe(false)
    expect(run.forwardedToolPayload, 'file-change payloads must not be forwarded').toBe(false)
    expect(run.forwardedStderrNoise, 'stderr noise must not be forwarded').toBe(false)
    expect(run.forwardedRawFixtureContent, 'raw fixture sentinels must not be forwarded').toBe(false)
    expect(run.launcherFailureMarker, 'successful structured completion must not emit a failure marker').toBe(
      'unavailable'
    )
  })

  it('does not treat a human completion line on stderr as first-write and terminates its process tree', async () => {
    const fixture = await makeFixture(makePrompt('implementer'))
    const run = runLauncher(fixture, 'implementer', {
      timeoutSeconds: 3,
      firstWriteTimeoutSeconds: 1,
      patchSignal: 'completed',
      patchSignalStream: 'stderr'
    })

    expect(run.spawnErrorName, 'PowerShell must be available for stderr first-write validation').toBeNull()
    expect(run.status, 'stderr human completion must use the first-write exit code').toBe(2)
    expect(run.launcherFailureMarker, 'stderr human completion must not satisfy first-write supervision').toBe(
      'codex_worker_launcher stage=first_write status=failed reason=deadline_exceeded'
    )

    const [childPid, grandchildPid] = await Promise.all([
      readFixturePid(fixture.childPidPath),
      readFixturePid(fixture.grandchildPidPath)
    ])
    const [childGone, grandchildGone] = await Promise.all([
      waitForProcessExit(childPid, 3_000),
      waitForProcessExit(grandchildPid, 3_000)
    ])

    expect(childGone, `fake child PID ${childPid} must be gone`).toBe(true)
    expect(grandchildGone, `fake grandchild PID ${grandchildPid} must be gone`).toBe(true)
  })

  it('bounds combined stdout and stderr and terminates the exact fake pwsh process tree', async () => {
    const fixture = await makeFixture(makePrompt('tester'))
    const run = runLauncher(fixture, 'tester', {
      timeoutSeconds: 10,
      maxOutputBytes: 1024,
      flood: true
    })

    expect(run.spawnErrorName, 'PowerShell must be available for output validation').toBeNull()
    expect(
      run.status,
      `output limit must use the launcher output exit code; launcherFailureMarker=${run.launcherFailureMarker}; stdoutBytes=${run.stdoutBytes}; stderrBytes=${run.stderrBytes}; powerShellFailureClass=${run.powerShellFailureClass}; launcherLine=${run.launcherLine}; emptyParameterName=${run.emptyParameterName}`
    ).toBe(2)
    expect(run.launcherFailureMarker, 'output limit must report the exact launcher marker').toBe(
      'codex_worker_launcher stage=output status=failed reason=limit_exceeded'
    )
    expect(
      run.stdoutBytes + run.stderrBytes,
      'forwarded combined output must stay within the cap plus marker/framing allowance'
    ).toBeLessThanOrEqual(1024 + 256)
    expect(run.forwardedFloodSentinel, 'flood sentinels must not be forwarded').toBe(false)

    const [childPid, grandchildPid] = await Promise.all([
      readFixturePid(fixture.childPidPath),
      readFixturePid(fixture.grandchildPidPath)
    ])
    const [childGone, grandchildGone] = await Promise.all([
      waitForProcessExit(childPid, 3_000),
      waitForProcessExit(grandchildPid, 3_000)
    ])

    expect(childGone, `fake child PID ${childPid} must be gone`).toBe(true)
    expect(grandchildGone, `fake grandchild PID ${grandchildPid} must be gone`).toBe(true)
  })
})
