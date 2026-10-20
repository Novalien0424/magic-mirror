/** Demand-driven recovery only: failed requests are never replayed. */
export class MemoryWorkerRecovery {
  private attempts: number[] = []
  private retryAfter = 0
  failed(): void {
    this.retryAfter = performance.now() + Math.min(1000 * 2 ** this.attempts.length, 60_000)
  }
  take(): 'allowed' | 'backoff' | 'budget_exhausted' {
    const now = performance.now()
    this.attempts = this.attempts.filter(at => now - at < 3_600_000)
    if (this.attempts.length >= 3) return 'budget_exhausted'
    if (now < this.retryAfter) return 'backoff'
    this.attempts.push(now)
    return 'allowed'
  }
}
