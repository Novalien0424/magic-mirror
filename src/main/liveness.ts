import { Worker } from 'node:worker_threads'

/** The worker observes a counter, never application state or private content.
 * It terminates a hung process; launchd alone decides whether to restart it.
 */
export function startMainLiveness(onFailure: () => void): () => void {
  const state = new Int32Array(new SharedArrayBuffer(8))
  const worker = new Worker(`
    const { workerData } = require('node:worker_threads');
    const state = new Int32Array(workerData);
    let last = Atomics.load(state, 0), changed = Date.now(), polled = changed;
    setInterval(() => {
      if (Atomics.load(state, 1)) return;
      const now = Date.now();
      // System sleep pauses both threads. Allow Main to resume before judging
      // its health; an ordinary event-loop hang leaves this worker ticking.
      if (now - polled > 10000) changed = now;
      polled = now;
      const next = Atomics.load(state, 0);
      if (next !== last) { last = next; changed = Date.now(); }
      if (Date.now() - changed >= 60000 && !Atomics.load(state, 1)) {
        // Worker stdout forwarding needs Main's event loop. Write directly to
        // the inherited descriptor before terminating the hung process.
        try { require('node:fs').writeSync(1, 'MAIN_LIVENESS_FAILED at=' + new Date().toISOString() + ' reason=main_heartbeat_timeout\\n'); } catch {}
        process.kill(process.pid, 'SIGKILL');
      }
    }, 5000);
  `, { eval: true, workerData: state.buffer })
  worker.unref()
  let stopped = false
  worker.on('error', () => { if (!stopped) onFailure() })
  worker.on('exit', () => { if (!stopped) onFailure() })
  const timer = setInterval(() => Atomics.add(state, 0, 1), 5000)
  timer.unref()
  return () => {
    if (stopped) return
    stopped = true
    Atomics.store(state, 1, 1)
    clearInterval(timer)
    void worker.terminate()
  }
}

/** A new window has a startup allowance; each valid preload heartbeat renews it. */
export function createRendererLiveness(now: () => number, failed: () => void): { beat(): void; check(): void } {
  let last = now(), reported = false
  return {
    beat() { if (!reported) last = now() },
    check() { if (!reported && now() - last >= 30_000) { reported = true; failed() } },
  }
}
