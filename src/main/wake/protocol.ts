import { z } from 'zod'

const safeToken = z.string().regex(/^[a-z][a-z0-9._-]{0,95}$/)
const requestId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
const artifactPaths = z.record(safeToken, z.string().trim().min(1).max(512))

const packageSchema = z.object({
  packageId: safeToken,
  engine: z.literal('sherpa'),
  engineVersion: z.string().trim().min(1).max(48),
  modelVersion: z.string().trim().min(1).max(96),
  phrase: z.string().trim().min(1).max(96),
  sampleRateHz: z.literal(16_000),
  artifactPaths,
  tuning: z.object({
    threshold: z.number().min(0).max(1).optional(),
    score: z.number().positive().max(100).optional(),
    numTrailingBlanks: z.number().int().min(1).max(100).optional(),
  }).strict(),
}).strict()

const initializeSchema = z.object({
  type: z.literal('initialize'),
  requestId,
  package: packageSchema,
}).strict()

const wakeWorkerCommandSchema = z.discriminatedUnion('type', [
  initializeSchema,
  z.object({
    type: z.literal('update_config'),
    requestId,
    package: packageSchema,
  }).strict(),
  z.object({ type: z.literal('acquire_microphone'), requestId }).strict(),
  z.object({ type: z.literal('release_microphone'), requestId }).strict(),
  z.object({ type: z.literal('shutdown'), requestId }).strict(),
])

const wakeWorkerOutcomeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), requestId, packageId: safeToken }).strict(),
  z.object({ type: z.literal('microphone_acquired'), requestId }).strict(),
  z.object({ type: z.literal('microphone_released'), requestId }).strict(),
  z.object({
    type: z.literal('wake_detected'),
    packageId: safeToken,
    modelVersion: z.string().trim().min(1).max(96),
  }).strict(),
  z.object({ type: z.literal('failed'), requestId: requestId.optional(), reason: safeToken }).strict(),
  z.object({ type: z.literal('stopped'), requestId }).strict(),
])

export type WakeWorkerCommand = z.infer<typeof wakeWorkerCommandSchema>
export type WakeWorkerInitialization = z.infer<typeof initializeSchema>
export type WakeWorkerPackage = WakeWorkerInitialization['package']
export type WakeWorkerOutcome = z.infer<typeof wakeWorkerOutcomeSchema>

export type WakeProtocolResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string }

export function parseWakeWorkerCommand(value: unknown): WakeProtocolResult<WakeWorkerCommand> {
  const parsed = wakeWorkerCommandSchema.safeParse(value)
  return parsed.success
    ? Object.freeze({ ok: true, value: parsed.data })
    : Object.freeze({ ok: false, reason: 'invalid_wake_worker_command' })
}

export function parseWakeWorkerOutcome(value: unknown): WakeProtocolResult<WakeWorkerOutcome> {
  const parsed = wakeWorkerOutcomeSchema.safeParse(value)
  return parsed.success
    ? Object.freeze({ ok: true, value: parsed.data })
    : Object.freeze({ ok: false, reason: 'invalid_wake_worker_outcome' })
}
