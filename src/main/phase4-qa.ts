import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BrowserWindow, NativeImage } from 'electron'

import type { BootRuntime } from './boot'
import { REN_EXPRESSION_NAMES, REN_MOTION_GROUPS } from '../shared/types'
import { runPhase4ConsoleQa } from './phase4-console-qa'
import { runPhase4LifecycleQa } from './phase4-lifecycle-qa'

type QaWindow = Pick<BrowserWindow, 'capturePage' | 'webContents' | 'getSize' | 'setSize'>

export interface Phase4QaEvidence {
  readonly step: string
  readonly item?: string
  readonly status: string
  readonly file?: string
  readonly sha256?: string
  readonly nonblack_pixels?: number
  readonly byte_length?: number
  readonly max_mouth_open?: number
}

export interface Phase4QaResult {
  readonly motionCount: number
  readonly expressionCount: number
  readonly sceneCount: number
  readonly screenshotCount: number
  readonly musicAnalyser: 'active' | 'not_executed'
  readonly visualCount: number
  readonly consoleCheckCount?: number
}

export interface Phase4QaInput {
  readonly runtime: BootRuntime
  readonly mirror: QaWindow
  readonly console: QaWindow
  readonly outputDir: string
  readonly musicOnly?: boolean
  readonly live?: boolean
  readonly consoleOnly?: boolean
  readonly editorOnly?: boolean
  readonly lifecycleLive?: boolean
  readonly onEvidence: (evidence: Phase4QaEvidence) => void
}

const POLL_MS = 100

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

async function avatarReasonSeen(runtime: BootRuntime, reason: string): Promise<boolean> {
  const page = runtime.console.getEvents({ limit: 100, module: 'avatar', source: 'runtime' })
  return page.ok && page.value.events.some((event) => event.reason === reason)
}

async function waitForAvatarReason(
  runtime: BootRuntime,
  reason: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await avatarReasonSeen(runtime, reason)) return
    await delay(POLL_MS)
  }
  throw new Error('phase4_qa_avatar_event_timeout')
}

async function startLiveRealtime(input: Phase4QaInput): Promise<void> {
  const start = await invokeConsole<{
    ok?: boolean
    value?: { status?: string }
  }>(input.console, 'startConversation')
  if (start.ok !== true) throw new Error('phase4_qa_realtime_start_failed')
  const deadline = Date.now() + 25_000
  while (Date.now() < deadline) {
    if (
      input.runtime.snapshot().lifecycle === 'active'
      && input.runtime.snapshot().realtimeSessionId !== null
    ) return
    await delay(POLL_MS)
  }
  throw new Error('phase4_qa_realtime_start_timeout')
}

async function waitForActualOutputMouth(input: Phase4QaInput): Promise<number> {
  const deadline = Date.now() + 20_000
  let maxMouthOpen = 0
  while (Date.now() < deadline) {
    const response = await invokeConsole<{
      ok?: boolean
      value?: { mouthOpen?: number }
    }>(input.console, 'getAvatarRuntime')
    const mouthOpen = response.ok === true && typeof response.value?.mouthOpen === 'number'
      ? response.value.mouthOpen
      : 0
    maxMouthOpen = Math.max(maxMouthOpen, mouthOpen)
    if (maxMouthOpen >= 0.03) return maxMouthOpen
    await delay(50)
  }
  throw new Error('phase4_qa_realtime_lipsync_not_observed')
}

export async function capture(
  win: QaWindow,
  outputDir: string,
  fileName: string,
): Promise<{ sha256: string; nonblackPixels: number }> {
  const image = await win.capturePage()
  return saveCapture(image, outputDir, fileName)
}

async function saveCapture(image: NativeImage, outputDir: string, fileName: string): Promise<{ sha256: string; nonblackPixels: number }> {
  const bitmap = image.toBitmap()
  let nonblackPixels = 0
  for (let index = 0; index + 3 < bitmap.length; index += 4) {
    if (bitmap[index] > 60 || bitmap[index + 1] > 60 || bitmap[index + 2] > 60) {
      nonblackPixels += 1
    }
  }
  if (nonblackPixels < 1_000) throw new Error('phase4_qa_black_frame')
  const png = image.toPNG()
  await writeFile(join(outputDir, fileName), png)
  return {
    sha256: createHash('sha256').update(png).digest('hex'),
    nonblackPixels,
  }
}

async function invokeConsole<T>(win: QaWindow, method: string, argument?: unknown): Promise<T> {
  const encodedMethod = JSON.stringify(method)
  const encodedArgument = argument === undefined ? '' : `, ${JSON.stringify(argument)}`
  return win.webContents.executeJavaScript(
    `window.magicMirror[${encodedMethod}](${encodedArgument.slice(2)})`,
    true,
  ) as Promise<T>
}

async function injectFinalTranscript(
  win: QaWindow,
  transcript: string,
  turnId: string,
): Promise<{
  decision?: string
  reason?: string
  result?: {
    status?: string
    durationMs?: number
    actions?: Array<{ actionId?: string; stageId?: string; status?: string; errorCode?: string }>
  }
}> {
  return win.webContents.executeJavaScript(`(async () => {
    if (window.magicMirrorPhase4Qa === undefined) throw new Error('phase4_qa_transcript_hook_missing')
    return window.magicMirrorPhase4Qa.injectFinalTranscript(${JSON.stringify(transcript)}, ${JSON.stringify(turnId)})
  })()`, true) as Promise<{
    decision?: string
    reason?: string
    result?: {
      status?: string
      durationMs?: number
      actions?: Array<{ actionId?: string; stageId?: string; status?: string; errorCode?: string }>
    }
  }>
}

async function injectFinalTranscriptStart(
  win: QaWindow,
  transcript: string,
  turnId: string,
): Promise<{
  decision?: string
  reason?: string
  result?: { runId?: string; sceneId?: string; status?: string } | 'stopped' | 'stale'
}> {
  return win.webContents.executeJavaScript(`(async () => {
    if (window.magicMirrorPhase4Qa === undefined) throw new Error('phase4_qa_transcript_hook_missing')
    return window.magicMirrorPhase4Qa.injectFinalTranscriptStart(${JSON.stringify(transcript)}, ${JSON.stringify(turnId)})
  })()`, true) as Promise<{
    decision?: string
    reason?: string
    result?: { runId?: string; sceneId?: string; status?: string } | 'stopped' | 'stale'
  }>
}

export async function runPhase4Qa(input: Phase4QaInput): Promise<Phase4QaResult> {
  await mkdir(input.outputDir, { recursive: true })
  await waitForAvatarReason(input.runtime, 'cubism_avatar_ready', 20_000)
  if (input.lifecycleLive) return runPhase4LifecycleQa(input)
  if (input.consoleOnly) return runPhase4ConsoleQa(input)
  if (input.live === true) {
    await startLiveRealtime(input)
    input.onEvidence({ step: 'realtime_session', status: 'connected' })
  }
  let screenshotCount = 0

  for (const group of input.musicOnly ? [] : REN_MOTION_GROUPS) {
    await invokeConsole(input.console, 'controlAvatar', { type: 'motion', group })
    await waitForAvatarReason(input.runtime, `avatar_motion_started:${group}`, 3_000)
    await delay(350)
    const activeFile = `motion-${group.toLowerCase()}-active.png`
    const active = await capture(input.mirror, input.outputDir, activeFile)
    screenshotCount += 1
    await waitForAvatarReason(input.runtime, `avatar_motion_completed:${group}`, 12_000)
    await delay(250)
    const resumedFile = `motion-${group.toLowerCase()}-resumed.png`
    const resumed = await capture(input.mirror, input.outputDir, resumedFile)
    if (active.sha256 === resumed.sha256) throw new Error('phase4_qa_static_frame')
    screenshotCount += 1
    input.onEvidence({
      step: 'motion', item: group, status: 'passed', file: activeFile,
      sha256: active.sha256, nonblack_pixels: Math.min(active.nonblackPixels, resumed.nonblackPixels),
    })
  }

  for (const expression of input.musicOnly ? [] : REN_EXPRESSION_NAMES) {
    await invokeConsole(input.console, 'controlAvatar', { type: 'expression', name: expression })
    await delay(500)
    const file = `expression-${expression}.png`
    const evidence = await capture(input.mirror, input.outputDir, file)
    screenshotCount += 1
    input.onEvidence({
      step: 'expression', item: expression, status: 'passed', file,
      sha256: evidence.sha256, nonblack_pixels: evidence.nonblackPixels,
    })
  }

  const assetProbe = await input.mirror.webContents.executeJavaScript(`(async () => {
    const response = await fetch('magic-mirror-media://music/music-qa-tone')
    const blob = await response.blob()
    return { ok: response.ok, status: response.status, size: blob.size, type: blob.type }
  })()`, true) as { ok?: unknown; status?: unknown; size?: unknown; type?: unknown }
  if (
    assetProbe.ok !== true
    || assetProbe.status !== 200
    || assetProbe.size !== 384_044
    || assetProbe.type !== 'audio/wav'
  ) throw new Error('phase4_qa_music_asset_invalid')
  input.onEvidence({ step: 'music_asset', status: 'passed', byte_length: assetProbe.size })

  const sceneIds: readonly string[] = input.musicOnly
    ? ['scene-avatar-music']
    : ['scene-avatar-music', 'scene-fog-light', 'scene-ending']
  const spellPhrases: Readonly<Record<string, string>> = {
    'scene-avatar-music': 'Mirror begin the ceremony',
    'scene-fog-light': 'Mirror call the mist',
    'scene-ending': 'Mirror end the ceremony',
  }
  const negative = await injectFinalTranscript(
    input.mirror,
    'Please Mirror begin the ceremony now',
    'qa-negative-turn',
  )
  if (negative.decision !== 'ignored' || negative.reason !== 'not_exact_match') {
    throw new Error('phase4_qa_negative_spell_triggered')
  }
  input.onEvidence({ step: 'spell', item: 'negative', status: 'passed' })

  for (const sceneId of sceneIds) {
    const phrase = spellPhrases[sceneId]
    if (phrase === undefined) throw new Error('phase4_qa_spell_fixture_missing')
    const turnId = `qa-${sceneId}-turn`
    const mouthPromise = input.live === true && sceneId === 'scene-avatar-music'
      ? waitForActualOutputMouth(input)
      : undefined
    // The scene assertion can fail before this probe is awaited. Observe its
    // rejection immediately so Electron cleanup never leaves a dangling task.
    void mouthPromise?.catch(() => undefined)
    const responsePromise = injectFinalTranscript(input.mirror, phrase, turnId)
    let activeStage: { sha256: string; nonblackPixels: number } | undefined
    let endingStage: { sha256: string; nonblackPixels: number } | undefined
    let openingFrame: NativeImage | undefined
    let endingFrame: NativeImage | undefined
    if (!input.musicOnly && sceneId === 'scene-avatar-music') {
      await delay(350)
      openingFrame = await input.mirror.capturePage()
      await delay(1_550)
      endingFrame = await input.mirror.capturePage()
    }
    const response = await responsePromise
    // PNG encoding is synchronous and must not stall Main's scene timers.
    if (openingFrame && endingFrame) {
      activeStage = await saveCapture(openingFrame, input.outputDir, 'spell-stage-opening.png')
      endingStage = await saveCapture(endingFrame, input.outputDir, 'spell-stage-ending.png')
      screenshotCount += 2
      if (activeStage.sha256 === endingStage.sha256) throw new Error('phase4_qa_spell_stage_static')
    }
    const status = response.decision === 'triggered' ? response.result?.status : undefined
    const expectedStatus = input.live === true || sceneId === 'scene-fog-light'
      ? 'completed'
      : 'partial_failure'
    if (status !== expectedStatus) {
      throw new Error('phase4_qa_scene_failed')
    }
    const dialogueIds = sceneId === 'scene-avatar-music'
      ? ['dialogue-opening', 'dialogue-ending']
      : sceneId === 'scene-ending'
        ? ['dialogue-ending']
        : []
    for (const dialogueId of dialogueIds) {
      const dialogue = response.result?.actions?.find((action) => action.actionId === dialogueId)
      if (input.live === true) {
        if (dialogue?.status !== 'acknowledged' || dialogue.errorCode !== undefined) {
          throw new Error('phase4_qa_live_dialogue_not_dispatched')
        }
      } else if (dialogue?.status !== 'failed' || dialogue.errorCode !== 'no_active_realtime_session') {
        throw new Error('phase4_qa_dialogue_false_positive')
      }
    }
    if (sceneId === 'scene-avatar-music') {
      const expectedStages: Readonly<Record<string, string>> = {
        'dialogue-opening': 'avatar-open',
        'motion-opening': 'avatar-open',
        'music-play': 'avatar-open',
        'light-on': 'avatar-open',
        'expression-one': 'avatar-effect',
        'fog-on': 'avatar-effect',
        'fog-value': 'avatar-effect',
        'music-fade': 'avatar-release',
        'fog-off': 'avatar-release',
        'light-off': 'avatar-release',
        'dialogue-ending': 'avatar-ending',
        'motion-ending': 'avatar-ending',
        'music-stop': 'avatar-ending',
      }
      for (const [actionId, stageId] of Object.entries(expectedStages)) {
        const action = response.result?.actions?.find((candidate) => candidate.actionId === actionId)
        if (action?.stageId !== stageId || action.status === 'failed' && !actionId.startsWith('dialogue-')) {
          throw new Error('phase4_qa_integrated_action_failed')
        }
      }
      const durationMs = response.result?.durationMs
      if (durationMs === undefined || durationMs < 2_350 || durationMs > 3_200) {
        throw new Error('phase4_qa_stage_timing_failed_' + durationMs)
      }
      if (activeStage !== undefined && endingStage !== undefined) {
        input.onEvidence({
          step: 'spell_stages', item: sceneId, status: 'passed', file: 'spell-stage-ending.png',
          sha256: endingStage.sha256,
          nonblack_pixels: Math.min(activeStage.nonblackPixels, endingStage.nonblackPixels),
        })
      }
    }
    if (mouthPromise !== undefined) {
      const maxMouthOpen = await mouthPromise
      input.onEvidence({
        step: 'realtime_dialogue', item: sceneId, status: 'passed', max_mouth_open: maxMouthOpen,
      })
    }
    input.onEvidence({ step: 'scene', item: sceneId, status })
    const duplicate = await injectFinalTranscript(input.mirror, phrase, turnId)
    if (duplicate.decision !== 'ignored' || duplicate.reason !== 'duplicate_turn') {
      throw new Error('phase4_qa_duplicate_turn_replayed')
    }
    input.onEvidence({ step: 'spell', item: `${sceneId}:duplicate`, status: 'passed' })
  }

  if (!input.musicOnly) {
    const finitePromise = injectFinalTranscript(
      input.mirror, 'Mirror play the finite vision', 'qa-visual-finite-turn',
    )
    await delay(500)
    const finiteFrame = await capture(input.mirror, input.outputDir, 'visual-finite-active.png')
    screenshotCount += 1
    const finite = await finitePromise
    if (finite.decision !== 'triggered' || finite.result?.status !== 'completed') {
      throw new Error('phase4_qa_finite_visual_failed')
    }
    await delay(250)
    const finiteReturn = await capture(input.mirror, input.outputDir, 'visual-finite-return.png')
    screenshotCount += 1
    if (finiteFrame.sha256 === finiteReturn.sha256) throw new Error('phase4_qa_visual_return_failed')
    input.onEvidence({
      step: 'visual_finite', status: 'passed', file: 'visual-finite-active.png',
      sha256: finiteFrame.sha256, nonblack_pixels: Math.min(finiteFrame.nonblackPixels, finiteReturn.nonblackPixels),
    })

    const stillPromise = injectFinalTranscript(
      input.mirror, 'Mirror show the portrait', 'qa-visual-still-turn',
    )
    await delay(300)
    const stillFrame = await capture(input.mirror, input.outputDir, 'visual-still-active.png')
    screenshotCount += 1
    const still = await stillPromise
    if (still.decision !== 'triggered' || still.result?.status !== 'completed') {
      throw new Error('phase4_qa_still_visual_failed')
    }
    input.onEvidence({
      step: 'visual_still', status: 'passed', file: 'visual-still-active.png',
      sha256: stillFrame.sha256, nonblack_pixels: stillFrame.nonblackPixels,
    })

    const loop = await injectFinalTranscriptStart(
      input.mirror, 'Mirror hold the vision', 'qa-visual-loop-turn',
    )
    if (loop.decision !== 'triggered' || typeof loop.result !== 'object' || loop.result.status !== 'accepted') {
      throw new Error('phase4_qa_loop_visual_start_failed')
    }
    await delay(500)
    const loopFrame = await capture(input.mirror, input.outputDir, 'visual-loop-active.png')
    screenshotCount += 1
    const stop = await injectFinalTranscriptStart(
      input.mirror, '魔鏡阿魔鏡', 'qa-visual-stop-turn',
    )
    if (stop.decision !== 'stopped' || stop.result !== 'stopped') {
      throw new Error('phase4_qa_loop_visual_stop_failed')
    }
    await delay(250)
    const loopReturn = await capture(input.mirror, input.outputDir, 'visual-loop-return.png')
    screenshotCount += 1
    if (loopFrame.sha256 === loopReturn.sha256) throw new Error('phase4_qa_loop_visual_return_failed')
    input.onEvidence({
      step: 'visual_loop_stop', status: 'passed', file: 'visual-loop-active.png',
      sha256: loopFrame.sha256, nonblack_pixels: Math.min(loopFrame.nonblackPixels, loopReturn.nonblackPixels),
    })

    const replacementLoop = await injectFinalTranscriptStart(
      input.mirror, 'Mirror hold the vision', 'qa-visual-replacement-turn',
    )
    if (replacementLoop.decision !== 'triggered' || typeof replacementLoop.result !== 'object' || replacementLoop.result.status !== 'accepted') {
      throw new Error('phase4_qa_replacement_source_failed')
    }
    await delay(300)
    const replacement = await invokeConsole<{
      ok?: boolean; value?: { status?: string }
    }>(input.console, 'runScene', 'scene-visual-finite')
    if (replacement.ok !== true || replacement.value?.status !== 'accepted') {
      throw new Error('phase4_qa_visual_replacement_failed')
    }
    await input.mirror.webContents.executeJavaScript(`window.magicMirror.reportSceneVisual(${JSON.stringify({
      runId: typeof replacementLoop.result === 'object' ? replacementLoop.result.runId : '',
      sceneId: 'scene-visual-loop',
      stageId: 'visual-loop-stage',
      actionId: 'visual-loop',
      type: 'ended',
    })})`, true)
    await waitForAvatarReason(input.runtime, 'stale_scene_event', 3_000)
    await delay(500)
    const replacementFrame = await capture(input.mirror, input.outputDir, 'visual-replacement.png')
    screenshotCount += 1
    input.onEvidence({
      step: 'visual_replacement', status: 'passed', file: 'visual-replacement.png',
      sha256: replacementFrame.sha256, nonblack_pixels: replacementFrame.nonblackPixels,
    })
    await delay(3500)

    const embedded = await injectFinalTranscript(
      input.mirror, 'Mirror play the sounding vision', 'qa-visual-embedded-turn',
    )
    if (embedded.decision !== 'triggered' || embedded.result?.status !== 'completed') {
      throw new Error('phase4_qa_embedded_visual_failed')
    }
    input.onEvidence({ step: 'visual_embedded_audio', status: 'passed' })

    const missing = await injectFinalTranscript(
      input.mirror, 'Mirror play the missing vision', 'qa-visual-missing-turn',
    )
    if (missing.decision !== 'triggered' || missing.result?.status !== 'failed') {
      throw new Error('phase4_qa_missing_visual_fallback_failed')
    }
    const failureReturn = await capture(input.mirror, input.outputDir, 'visual-failure-return.png')
    screenshotCount += 1
    input.onEvidence({
      step: 'visual_failure_cleanup', status: 'passed', file: 'visual-failure-return.png',
      sha256: failureReturn.sha256, nonblack_pixels: failureReturn.nonblackPixels,
    })
  }

  await waitForAvatarReason(input.runtime, 'avatar_music_analyser_active', 5_000)
  await invokeConsole(input.console, 'stopScenes')
  input.onEvidence({ step: 'music_analyser', status: 'active' })
  input.onEvidence({ step: 'physical_hardware', status: 'not_executed' })

  return {
    motionCount: input.musicOnly ? 0 : REN_MOTION_GROUPS.length,
    expressionCount: input.musicOnly ? 0 : REN_EXPRESSION_NAMES.length,
    sceneCount: sceneIds.length,
    screenshotCount,
    musicAnalyser: 'active',
    visualCount: input.musicOnly ? 0 : 5,
  }
}
