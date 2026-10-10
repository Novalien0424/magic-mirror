// Match the deployed Mac's launch context without installing a restart owner.
import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function runRavenQaLaunchAgent({ repo, root, stamp, environment }) {
  const label = 'com.magicmirror.qa.' + stamp.toLowerCase()
  const domain = 'gui/' + process.getuid(), job = domain + '/' + label
  const plist = join(root, 'one-shot.plist'), stdout = join(root, 'launch.out.log')
  // Never persist inherited environment variables or credentials in a plist.
  const env = { PATH: '/usr/bin:/bin:/opt/homebrew/bin', HOME: process.env.HOME }
  for (const key of ['MIRROR_PHASE4_QA', 'MIRROR_RAVEN_CONVERSATION_QA', 'MIRROR_PHASE4_QA_LIVE',
    'MIRROR_RAVEN_CONVERSATION_QA_SCENARIO', 'MIRROR_PHASE4_QA_CONSOLE', 'MIRROR_PHASE4_QA_OUTPUT_DIR',
    'MIRROR_PHASE0_USER_DATA_ROOT', 'MIRROR_USER_DATA_DIR', 'MIRROR_SMOKE_MS', 'MIRROR_DEVELOPER_MODE']) {
    if (environment[key] !== undefined) env[key] = environment[key]
  }
  await writeFile(plist, JSON.stringify({ Label: label,
    ProgramArguments: [join(repo, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), repo],
    WorkingDirectory: repo, EnvironmentVariables: env, RunAtLoad: true, KeepAlive: false,
    StandardOutPath: stdout, StandardErrorPath: '/dev/null' }), { mode: 0o600 })
  if (spawnSync('/usr/bin/plutil', ['-convert', 'xml1', plist]).status !== 0) throw Error('raven_qa_plist_failed')
  if (spawnSync('/bin/launchctl', ['bootstrap', domain, plist]).status !== 0) throw Error('raven_qa_launch_failed')
  let stopped = false
  const stop = () => { stopped = true }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
  console.log(JSON.stringify({ event: 'raven_qa_launch', route: 'one_shot_launchagent', root }))
  try {
    const deadline = Date.now() + 1800000
    while (!stopped && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const state = spawnSync('/bin/launchctl', ['print', job], { encoding: 'utf8' }).stdout ?? ''
      if (!/\bpid = \d+/.test(state) && /last exit code =/.test(state)) {
        const log = await readFile(stdout, 'utf8').catch(() => '')
        const markers = log.match(/PHASE4_QA_RESULT[^\n]*/g) ?? []
        return markers.length === 1 && markers[0].includes('status=passed') && /last exit code = 0\b/.test(state) ? 0 : 2
      }
    }
    return 2
  } finally {
    spawnSync('/bin/launchctl', ['bootout', job])
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
  }
}
