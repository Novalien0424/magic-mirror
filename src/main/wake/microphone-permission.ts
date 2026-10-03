/** Main requests TCC access before a native child opens the microphone. */
export async function requestWakeMicrophonePermission(input: {
  required: boolean
  request: () => Promise<boolean>
  stopping: () => boolean
}): Promise<'granted' | 'denied' | 'unavailable' | 'stopped'> {
  if (input.stopping()) return 'stopped'
  if (!input.required) return 'granted'
  try {
    const granted = await input.request()
    if (input.stopping()) return 'stopped'
    return granted ? 'granted' : 'denied'
  } catch {
    return input.stopping() ? 'stopped' : 'unavailable'
  }
}
