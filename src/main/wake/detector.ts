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

export function createConfiguredWakeDetector<TPackage extends { readonly engine: 'porcupine' | 'sherpa' }>(
  input: {
    readonly package: TPackage
    readonly createPorcupine: (wakePackage: TPackage) => WakeDetector
    readonly createSherpa: (wakePackage: TPackage) => WakeDetector
  },
): WakeDetector {
  return input.package.engine === 'porcupine'
    ? input.createPorcupine(input.package)
    : input.createSherpa(input.package)
}
