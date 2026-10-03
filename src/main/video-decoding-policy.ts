/** Call before app.ready. Keep WebGL acceleration; only video decode changes.
 * The Windows D3D11 path reproducibly stalls buffered video on this host.
 * Software decoding trades CPU for reliable playback; Mac requires its own QA.
 */
export function configureVideoDecoding(platform: string, appendSwitch: (name: string) => void): string {
  if (platform !== 'win32') return 'platform_default_video_decode'
  appendSwitch('disable-accelerated-video-decode')
  return 'windows_software_video_decode'
}
