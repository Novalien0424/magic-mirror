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
const powerShellFailureClassPattern =
  /\b(?:ParserError|CommandNotFoundException|PropertyNotFoundException|MethodInvocationException|PropertyAssignmentException|ParameterBindingException|RuntimeException|ParentContainsErrorRecordException|UnauthorizedAccess)\b/
const launcherLinePattern = /(?:invoke-codex-worker\.ps1:|line\s+)(\d+)/i

type WorkerRole = 'implementer' | 'surveyor' | 'tester'

interface Fixture {
  readonly captureDir: string
  readonly fakeCodexPath: string
  readonly promptPath: string
  readonly stdinPath: string
  readonly argvPath: string
}

interface LauncherRun {
  readonly status: number | null
  readonly spawnErrorName: string | null
  readonly launcherFailureMarker: string
  readonly stderrBytes: number
  readonly stdoutBytes: number
  readonly powerShellFailureClass: string
  readonly launcherLine: string
  readonly emptyParameterName: string
}

const fixtureDirs: string[] = []

const fakeCodexScript = `
$capture = $env:MM_CODEX_WORKER_CAPTURE_DIR
$utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
$argvText = @($args) -join [char]0
[System.IO.File]::WriteAllText((Join-Path $capture 'argv.txt'), $argvText, $utf8)

$inputStream = [Console]::OpenStandardInput()
$memory = New-Object System.IO.MemoryStream
$buffer = New-Object byte[] 4096
$read = 0
do {
  $read = $inputStream.Read($buffer, 0, $buffer.Length)
  if ($read -gt 0) {
    $memory.Write($buffer, 0, $read)
  }
} while ($read -gt 0)
[System.IO.File]::WriteAllBytes((Join-Path $capture 'stdin.bin'), $memory.ToArray())
exit 0
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

async function makeFixture(prompt: string): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'magic-mirror-codex-worker-'))
  fixtureDirs.push(root)

  const captureDir = join(root, 'capture')
  const promptPath = join(root, 'prompt.txt')
  const fakeCodexPath = join(root, 'fake-codex.ps1')
  const stdinPath = join(captureDir, 'stdin.bin')
  const argvPath = join(captureDir, 'argv.txt')

  await mkdir(captureDir)
  await writeFile(promptPath, Buffer.from(prompt, 'utf8'))
  await writeFile(fakeCodexPath, Buffer.from(fakeCodexScript, 'utf8'))

  return { captureDir, fakeCodexPath, promptPath, stdinPath, argvPath }
}

function runLauncher(fixture: Fixture, role: WorkerRole): LauncherRun {
  const result = spawnSync(
    powershell,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      launcherPath,
      '-Role',
      role,
      '-PromptPath',
      fixture.promptPath,
      '-CodexCommandPath',
      fixture.fakeCodexPath
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, MM_CODEX_WORKER_CAPTURE_DIR: fixture.captureDir },
      encoding: 'buffer',
      maxBuffer: outputCapBytes,
      stdio: ['ignore', 'pipe', 'pipe'],
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
  const combinedOutput = `${stdoutBuffer.toString('utf8')}\n${stderrBuffer.toString('utf8')}`
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

afterEach(async () => {
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
  })

  it('launches a matching tester envelope with exact argv and byte-preserved prompt stdin', async () => {
    const prompt = makePrompt('tester')
    const fixture = await makeFixture(prompt)
    const run = runLauncher(fixture, 'tester')

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
      '-'
    ])
    expect(await readFile(fixture.stdinPath)).toEqual(Buffer.from(prompt, 'utf8'))
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
})
