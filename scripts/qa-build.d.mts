interface BuildManifest {
  version: number
  status: string
  source: string
  output: string
  builtAt: string
}
export function beginBuild(root: string): Promise<void>
export function finishBuild(root: string): Promise<BuildManifest>
export function verifyBuild(root: string): Promise<BuildManifest>
