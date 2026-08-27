export interface SleepCommandRequest {
  readonly transcript: string
  readonly waitForActualEnd: () => unknown | PromiseLike<unknown>
  readonly requestSleep: () => void | PromiseLike<void>
}

export function isExactSleepCommand(transcript: unknown): boolean {
  return typeof transcript === 'string'
    && transcript.normalize('NFKC').trim() === '睡吧'
}

export async function requestSleepAfterPlayback(
  input: SleepCommandRequest,
): Promise<boolean> {
  if (!isExactSleepCommand(input.transcript)) return false
  await input.waitForActualEnd()
  await input.requestSleep()
  return true
}
