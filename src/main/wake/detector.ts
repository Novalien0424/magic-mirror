export type WakeDetectorResult =
  | Readonly<{ status: 'listening' }>
  | Readonly<{ status: 'detected' }>

export interface WakeDetector {
  readonly sampleRateHz: 16_000
  process(samples: Int16Array): WakeDetectorResult
  reset(): void
  close(): void
}

export const WAKE_LISTENING: WakeDetectorResult = Object.freeze({ status: 'listening' })
export const WAKE_DETECTED: WakeDetectorResult = Object.freeze({ status: 'detected' })
