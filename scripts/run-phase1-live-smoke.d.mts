export type Phase1LiveStage =
  | 'renderer_ready'
  | 'start'
  | 'active'
  | 'stop'
  | 'dormant'
  | 'runner'

export type Phase1LiveSmokeModelAvailability = 'available' | 'unavailable' | 'probe_failed'

export interface Phase1LiveSmokeOptions {
  timeoutMs?: number
  maxOutputBytes?: number
  command?: string
  args?: unknown[]
  cwd?: string
  env?: Record<string, string | undefined>
}

export interface Phase1LiveSmokeResult {
  status: 'passed' | 'failed'
  stage: Phase1LiveStage
  reason: string
  exitCode: number
  durationMs: number
  cleanup: 'passed' | 'failed'
  temporaryRoot: string
  markerCount: number
  outputMarkerCount: number
  orphanCount: number
  modelAvailability: Phase1LiveSmokeModelAvailability
}

export declare const PHASE1_LIVE_RESULT_PREFIX: 'PHASE1_LIVE_RESULT '

export declare function formatPhase1LiveResult(
  result?: Partial<Phase1LiveSmokeResult> | null,
): string

export declare function runPhase1LiveSmoke(
  options?: Phase1LiveSmokeOptions,
): Promise<Phase1LiveSmokeResult>
