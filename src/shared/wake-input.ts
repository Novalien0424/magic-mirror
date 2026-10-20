/** Aggregate microphone health only. No audio buffers or recognized text. */
export interface WakeInputSnapshot {
  readonly state: 'inactive' | 'waiting' | 'stalled' | 'silent' | 'signal' | 'recovering' | 'failed'
  readonly blocks: number
  readonly peak: number
  readonly rms: number
  readonly lastBlockAgeMs: number | null
  readonly detections: number
  readonly lastDetectionAgeMs?: number | null
  readonly detector?: WakeScore | null
  readonly recovery?: Readonly<{
    state: 'failed' | 'restarting' | 'recovered'
    reason: string
    attempts: number
  }> | null
}
import type { WakeScore } from './wake-score'
