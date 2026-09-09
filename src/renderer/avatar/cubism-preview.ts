/** Public rig metadata only; parameter IDs originate in the loaded MOC. */
export interface CubismParameter {
  id: string
  index: number
  min: number
  max: number
  defaultValue: number
}
export interface CubismMotionEntry { group: string; index: number; file: string }
export interface CubismCapabilities {
  motions: CubismMotionEntry[]
  expressions: string[]
  parameters: CubismParameter[]
}
export interface CubismPreviewControls {
  capabilities: CubismCapabilities
  reset(): void
  setParameter(id: string, value: number): boolean
  readParameters(): Readonly<Record<string, number>>
}

export function motionKey(group: string, index: number): string {
  return JSON.stringify([group, index])
}

export function clampPreviewParameter(parameter: CubismParameter | undefined, value: number): number | null {
  if (!parameter || !Number.isFinite(value)) return null
  return Math.min(parameter.max, Math.max(parameter.min, value))
}
