export type WakeRuntimePlatform = 'win32-x64' | 'darwin-arm64'

export function resolveWakeRuntimePlatform(
  platform: string,
  arch: string,
): WakeRuntimePlatform | null {
  if (platform === 'win32' && arch === 'x64') return 'win32-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  return null
}
