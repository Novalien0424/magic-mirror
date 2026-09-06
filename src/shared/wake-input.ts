/** Aggregate microphone health only. No audio buffers or recognized text. */
export interface WakeInputSnapshot {
  readonly state: 'inactive' | 'waiting' | 'stalled' | 'silent' | 'signal'
  readonly blocks: number
  readonly peak: number
  readonly rms: number
  readonly lastBlockAgeMs: number | null
  readonly detections: number
}
