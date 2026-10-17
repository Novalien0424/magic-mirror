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
}) {
  let settings = { ...DEFAULT_LOOP_VIDEO }, intent: 'avatar' | 'loop' = 'avatar'
  let loadFailed = false
  try {
    const saved = JSON.parse(readFileSync(input.path, 'utf8'))
    const parsed = parseLoopVideoSettings(saved.settings)
    if (saved.version !== 1 || !parsed || !['avatar', 'loop'].includes(saved.intent)) throw Error()
    settings = parsed; intent = saved.intent
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') loadFailed = true }
  let snapshot: OperatorLoopSnapshot = { mode: intent, status: intent === 'loop' ? 'preparing' : 'idle',
    reason: loadFailed ? 'operator_loop_settings_unreadable' : 'operator_loop_idle', generation: 0, settings: { ...settings } }
  let revision = 0, disposed = false, retry = 0, timer: ReturnType<typeof setTimeout> | undefined
  let lastVideo: number | undefined, lastAudio: number | undefined, lastFrames: number | undefined
  let pending: { promise: Promise<boolean>; resolve(value: boolean): void } | null = null
  let setup: Promise<void> = Promise.resolve()
  let released: { generation: number; resolve(): void } | null = null
  let releasedGeneration = -1
  let reportedReason = ''
  const persist = () => {
    writeFileAtomic.sync(input.path, JSON.stringify({ version: 1, settings, intent }), { mode: 0o600 })
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
  const controller = {
    view,
    isLoopMode: () => intent === 'loop',
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
      const chosen = { ...settings }
      let resolve!: (value: boolean) => void
      const promise = new Promise<boolean>(done => { resolve = done })
      pending = { promise, resolve }
      void queue(async () => {
        try {
          if (!await input.validate(chosen)) throw Error('operator_loop_media_unavailable')
          if (disposed || run !== revision) return
          intent = 'loop'; persist()
          // Inhibit wake before ending Realtime so sleep cannot reacquire a mic.
          await input.suspendAvatar()
          if (disposed || run !== revision) return
          snapshot.settings = chosen; retry = 0; launch(false)
        } catch (error) {
          if (disposed || run !== revision) return
          const reason = error instanceof Error && /^operator_loop_[a-z0-9_]+$/.test(error.message) ? error.message : 'operator_loop_start_failed'
          settle(false)
          if (intent === 'loop') fail(reason)
          else publish({ reason })
        }
      })
      return promise
    },
    async normal(): Promise<boolean> {
      const run = ++revision
      clear(); settle(false)
      return queue(async () => {
        if (disposed || run !== revision) return
        const wasLoop = intent === 'loop', visibleLoop = snapshot.mode === 'loop', oldGeneration = snapshot.generation
        // Keep the input gate closed until both old playback elements release.
        const release = visibleLoop && oldGeneration > 0 && releasedGeneration !== oldGeneration ? new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => { released = null; reject(Error('operator_loop_release_timeout')) }, 4000)
          released = { generation: oldGeneration, resolve: () => { clearTimeout(timeout); released = null; resolve() } }
        }) : Promise.resolve()
        publish({ mode: 'avatar', status: 'idle', reason: 'operator_loop_stopped', generation: oldGeneration + 1 })
        try {
          await release
          if (disposed || run !== revision) return
          intent = 'avatar'; persist()
          if (wasLoop) await input.resumeAvatar()
        } catch {
          intent = 'loop'
          fail('operator_loop_release_failed')
          throw Error('operator_loop_release_failed')
        }
      }).then(() => run === revision && intent === 'avatar', () => false)
    },
    rendererReady() {
      if (disposed || intent !== 'loop') return
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
    dispose() { disposed = true; ++revision; clear(); settle(false); released?.resolve() },
  }
  return controller
}
