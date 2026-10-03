import { z } from 'zod'
import type { WakeInputSnapshot } from './wake-input'

export const wakeCalibrationSettingsSchema = z.object({
  avatarId: z.string().min(1).max(96),
  phrase: z.string().trim().min(1).max(96).refine(value => !/[\u0000-\u001f\u007f]/u.test(value)),
  threshold: z.number().min(0).max(1),
  score: z.number().positive().max(100),
  numTrailingBlanks: z.number().int().min(1).max(100),
}).strict()
export type WakeCalibrationSettings = z.infer<typeof wakeCalibrationSettingsSchema>
const sessionId = z.string().min(1).max(96)
export const wakeCalibrationCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status') }).strict(),
  z.object({ type: z.literal('start'), settings: wakeCalibrationSettingsSchema }).strict(),
  z.object({ type: z.literal('update'), sessionId, settings: wakeCalibrationSettingsSchema }).strict(),
  z.object({ type: z.literal('read'), sessionId }).strict(),
  z.object({ type: z.literal('stop'), sessionId }).strict(),
])
export type WakeCalibrationCommand = z.infer<typeof wakeCalibrationCommandSchema>
export interface WakeCalibrationSnapshot {
  readonly status: 'testing' | 'stopped' | 'failed'
  readonly sessionId: string | null
  readonly settings: WakeCalibrationSettings | null
  readonly input: WakeInputSnapshot | null
  readonly detections: number
  readonly lastDetectionAgeMs: number | null
  readonly reason: string | null
}
