interface ArtifactInventory {
  fingerprint: string
  files: number
  bytes: number
}

export function createQaArtifact(repo: string, runId: string): Promise<string>
export function finishQaArtifact(repo: string, runId: string, exitCode: number): Promise<void>
export function reviewQaArtifact(repo: string, runId: string, report: string): Promise<ArtifactInventory & {
  runId: string
  report: string
  reviewed: boolean
}>
export function cleanQaArtifact(repo: string, runId: string, deleteFiles?: boolean): Promise<ArtifactInventory & {
  runId: string
  root: string
  report: string
  exitCode: number
  deleted: boolean
}>
