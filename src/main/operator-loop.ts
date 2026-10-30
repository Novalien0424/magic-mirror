import { readFileSync } from 'node:fs'
import { DEFAULT_LOOP_VIDEO, parseLoopVideoSettings, type LoopVideoSettings, type LoopVideoView, type OperatorLoopReport, type OperatorLoopSnapshot } from '../shared/operator-loop'
const writeFileAtomic = require('write-file-atomic') as { sync(path: string, value: string, options?: { mode: number }): void }

/** One appliance playback owner. Avatar settings and conversations are never saved here. */
export function createOperatorLoop(input: {
  path: string
  validate(settings: LoopVideoSettings): Promise<boolean>
  suspendAvatar(): Promise<void>
  resumeAvatar(): Promise<void>
  publish(snapshot: OperatorLoopSnapshot): void
  report(reason: string): void
  music?: { start(): Promise<boolean>; stop(): Promise<void> }
  dance?: { start(): Promise<boolean>; stop(): Promise<void> }
}) {
  let settings = { ...DEFAULT_LOOP_VIDEO }, intent: OperatorLoopSnapshot['mode'] = 'avatar'
  let loadFailed = false
  try {
    const saved = JSON.parse(readFileSync(input.path, 'utf8'))
    const parsed = parseLoopVideoSettings(saved.settings)
    if (saved.version !== 1 || !parsed || !['avatar', 'loop', 'desktop', 'music'].includes(saved.intent)) throw Error()
    settings = parsed; intent = saved.intent
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') loadFailed = true }
  let snapshot: OperatorLoopSnapshot = { mode: intent, status: intent !== 'avatar' ? 'preparing' : 'idle',
    reason: loadFailed ? 'operator_loop_settings_unreadable' : 'operator_loop_idle', generation: 0, settings: { ...settings } }
  let revision = 0, disposed = false, retry = 0, timer: ReturnType<typeof setTimeout> | undefined
  let lastVideo: number | undefined, lastAudio: number | undefined, lastFrames: number | undefined
  let pending: { promise: Promise<boolean>; resolve(value: boolean): void } | null = null
  // Return to Avatar and shutdown abandon a slow media check instead of queueing behind it.
  let abandonValidation: (() => void) | undefined
  let setup: Promise<void> = Promise.resolve()
  let released: { generation: number; resolve(): void } | null = null
  let releasedGeneration = -1
  let reportedReason = ''
  const persist = () => {
    writeFileAtomic.sync(input.path, JSON.stringify({ version: 1, settings, intent: intent === 'dance' || intent === 'black' ? 'avatar' : intent }), { mode: 0o600 })
    loadFailed = false
  }
  const publish = (patch: Partial<OperatorLoopSnapshot>) => {
    snapshot = { ...snapshot, ...patch }
    input.publish(structuredClone(snapshot)); input.report(snapshot.reason)
  }
  const settle = (success: boolean) => { pending?.resolve(success); pending = null }
  const clear = () => { clearTimeout(timer); timer = undefined }
  const fail = (reason: string) => {
    clear(); settle(false)
    publish({ mode: 'loop', status: 'failed', reason })
  }
  const watch = () => { clear(); timer = setTimeout(() => recover('operator_loop_playback_stalled'), 8000) }
  const launch = (recovering: boolean) => {
    lastVideo = lastAudio = lastFrames = undefined
    reportedReason = ''
    publish({ mode: 'loop', status: recovering ? 'recovering' : 'preparing', reason: recovering ? 'operator_loop_reloading' : 'operator_loop_loading', generation: snapshot.generation + 1 })
    watch()
  }
  const recover = (reason: string) => {
    if (disposed || intent !== 'loop' || snapshot.status === 'failed') return
    if (retry++ === 0) { input.report(reason); launch(true) }
    else fail(reason)
  }
  const queue = (operation: () => Promise<void>) => { const next = setup.then(operation); setup = next.catch(() => undefined); return next }
  const view = (): LoopVideoView => structuredClone({ settings, snapshot })
  const stopAudio = () => Promise.all([input.music?.stop(), input.dance?.stop()]).then(() => undefined)
  const controller = {
    view,
    isLoopMode: () => intent === 'loop',
    isDesktopMode: () => intent === 'desktop',
    isInputSuspended: () => intent !== 'avatar',
    async save(value: LoopVideoSettings): Promise<void> {
      const parsed = parseLoopVideoSettings(value)
      if (!parsed || !await input.validate(parsed)) throw Error('operator_loop_media_unavailable')
      const previous = settings
      settings = parsed
      try { persist() } catch { settings = previous; throw Error('operator_loop_save_failed') }
    },
    async play(): Promise<boolean> {
      if (disposed) return false
      if (intent === 'loop' && snapshot.status === 'playing' && JSON.stringify(snapshot.settings) === JSON.stringify(settings)) return true
      if (pending) return pending.promise
      const run = ++revision
      // Keep an already-playing playlist until the requested video validates.
      // A pending music start must still be cancelled before joining its queue.
      const keepMusic = (intent === 'music' || intent === 'dance') && snapshot.status === 'playing'
      const musicReleased = keepMusic ? Promise.resolve() : stopAudio()
      void musicReleased.catch(() => undefined)
      const chosen = { ...settings }
      let resolve!: (value: boolean) => void
      const promise = new Promise<boolean>(done => { resolve = done })
      pending = { promise, resolve }
      void queue(async () => {
        try {
          await musicReleased
          const valid = await new Promise<boolean>((resolve, reject) => {
            abandonValidation = () => resolve(false)
            input.validate(chosen).then(resolve, reject)
          }).finally(() => { abandonValidation = undefined })
          if (!valid) throw Error('operator_loop_media_unavailable')
          if (disposed || run !== revision) return
          intent = 'loop'; persist()
          await stopAudio()
          // Inhibit wake before ending Realtime so sleep cannot reacquire a mic.
          await input.suspendAvatar()
          if (disposed || run !== revision) return
          snapshot.settings = chosen; retry = 0; launch(false)
        } catch (error) {
          if (disposed || run !== revision) return
          const reason = error instanceof Error && /^operator_loop_[a-z0-9_]+$/.test(error.message) ? error.message : 'operator_loop_start_failed'
          settle(false)
          if (intent === 'loop') fail(reason)
          else publish({ reason, ...((intent === 'music' || intent === 'dance') && !keepMusic ? { status: 'failed' as const } : {}) })
        }
      })
      return promise
    },
    async normal(target: 'avatar' | 'desktop' | 'music' | 'dance' | 'black' = 'avatar'): Promise<boolean> {
      if ((target === 'music' || target === 'dance') && intent === target && snapshot.mode === target && snapshot.generation > 0
        && ['playing', 'preparing'].includes(snapshot.status)) return true
      const run = ++revision
      clear(); settle(false); abandonValidation?.()
      // Cancel a slow native start/cloud copy before entering the transition queue.
      const musicReleased = stopAudio()
      void musicReleased.catch(() => undefined)
      return queue(async () => {
        if (disposed || run !== revision) return
        const wasSuspended = intent !== 'avatar', previous = intent
        const visibleLoop = snapshot.mode === 'loop', oldGeneration = snapshot.generation
        // Desktop inhibits input before any async release. Keep the Console renderer
        // alive so unsaved operator edits survive a trip to macOS and back.
        if (target !== 'avatar') intent = target
        try {
          await musicReleased
          if (target !== 'avatar') await input.suspendAvatar()
          if (disposed || run !== revision) return
          // Keep the input gate closed until both old playback elements release.
          const release = visibleLoop && oldGeneration > 0 && releasedGeneration !== oldGeneration ? new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { released = null; reject(Error('operator_loop_release_timeout')) }, 4000)
            released = { generation: oldGeneration, resolve: () => { clearTimeout(timeout); released = null; resolve() } }
          }) : Promise.resolve()
          const audio = target === 'music' || target === 'dance'
          publish({ mode: target, status: audio ? 'preparing' : 'idle', reason: audio ? `operator_loop_${target}_preparing` : target === 'desktop' ? 'operator_loop_desktop' : 'operator_loop_stopped', generation: oldGeneration + 1 })
          await release
          if (disposed || run !== revision) return
          intent = target; persist()
          if (target === 'music' || target === 'dance') {
            // Acknowledge mode ownership, not playback. Downloads must not hold
            // the operator mailbox/transition queue hostage for minutes or hours.
            void Promise.resolve(input[target]?.start()).then(success => {
              if (disposed || run !== revision || intent !== target) return
              if (!success && snapshot.status !== 'failed') publish({ status: 'failed', reason: `operator_loop_${target}_start_failed` })
              else if (success && snapshot.status === 'preparing') publish({ status: 'playing', reason: `operator_loop_${target}_playing` })
            }).catch(() => {
              if (!disposed && run === revision && intent === target) publish({ status: 'failed', reason: `operator_loop_${target}_start_failed` })
            })
          }
          if (target === 'avatar' && wasSuspended) await input.resumeAvatar()
        } catch {
          intent = target !== 'avatar' ? target : previous !== 'avatar' ? previous : 'loop'
          clear(); settle(false)
          publish({ mode: intent, status: 'failed', reason: 'operator_loop_release_failed' })
          throw Error('operator_loop_release_failed')
        }
      }).then(() => run === revision && intent === target && snapshot.status !== 'failed', () => false)
    },
    desktop(): Promise<boolean> { return controller.normal('desktop') },
    music(): Promise<boolean> { return controller.normal('music') },
    dance(): Promise<boolean> { return controller.normal('dance') },
    black(): Promise<boolean> { return controller.normal('black') },
    danceFailed(reason: string) { if (!disposed && intent === 'dance') publish({ status: 'failed', reason }) },
    musicFailed(reason: string) {
      if (!disposed && intent === 'music') publish({ status: 'failed', reason })
    },
    musicState(status: 'preparing' | 'playing', pending: number, oversized = 0) {
      if (disposed || intent !== 'music') return
      publish({ status, reason: status === 'preparing' ? 'operator_loop_music_downloading'
        : pending > 0 ? 'operator_loop_music_playing_downloading'
          : oversized > 0 ? 'operator_loop_music_playing_oversize_skipped' : 'operator_loop_music_playing' })
    },
    rendererReady() {
      if (disposed) return
      // Never recreate loud playback automatically after renderer loss.
      if (intent === 'dance') { void controller.normal(); return }
      if (intent === 'music') { if (snapshot.generation === 0) void controller.music(); return }
      if (intent === 'desktop') { void controller.desktop(); return }
      if (intent !== 'loop') return
      if (snapshot.generation === 0) void controller.play()
      else if (snapshot.status !== 'failed') { retry = 0; launch(true) }
    },
    report(report: OperatorLoopReport) {
      if (report.status === 'released') {
        if (report.generation === snapshot.generation) releasedGeneration = report.generation
        if (released?.generation === report.generation) released.resolve()
        return
      }
      if (disposed || intent !== 'loop' || report.generation !== snapshot.generation || snapshot.status === 'failed') return
      if (report.status === 'failed') { recover(report.reason ?? 'operator_loop_playback_failed'); return }
      if (report.reason && report.reason !== reportedReason) { reportedReason = report.reason; input.report(report.reason) }
      const separate = snapshot.settings.audioMode === 'separate'
      const advanced = lastVideo !== undefined && lastFrames !== undefined
        && report.videoTimeMs !== undefined && report.videoTimeMs > 0 && report.frames !== undefined && report.frames > 0
        && report.videoTimeMs !== lastVideo && report.frames !== lastFrames
        && (!separate || lastAudio !== undefined && report.audioTimeMs !== undefined && report.audioTimeMs > 0 && report.audioTimeMs !== lastAudio)
      if (report.videoTimeMs !== undefined && report.frames !== undefined) {
        lastVideo = report.videoTimeMs; lastFrames = report.frames; lastAudio = report.audioTimeMs
      }
      if (advanced) {
        watch()
        if (snapshot.status !== 'playing') { publish({ status: 'playing', reason: 'operator_loop_playing' }); settle(true) }
      }
    },
    clearIntent() { intent = 'avatar'; try { persist() } catch { input.report('operator_loop_save_failed') } },
    dispose() {
      disposed = true; ++revision; clear(); settle(false); abandonValidation?.(); released?.resolve()
      void stopAudio().catch(() => input.report('operator_loop_music_stop_failed'))
    },
  }
  return controller
}
