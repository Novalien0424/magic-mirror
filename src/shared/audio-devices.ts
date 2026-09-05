export interface AudioPreferences {
  readonly inputId: string
  readonly inputLabel: string
  readonly outputId: string
}

export interface AudioDeviceState {
  readonly preferences: AudioPreferences
  readonly devices: readonly { readonly deviceId: string; readonly label: string; readonly kind: 'audioinput' | 'audiooutput' }[]
  readonly reason: string
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = Object.freeze({ inputId: '', inputLabel: '', outputId: '' })

export function parseAudioPreferences(value: unknown): AudioPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'inputId,inputLabel,outputId') return null
  if (!['inputId', 'inputLabel', 'outputId'].every((key) => typeof record[key] === 'string'
    && record[key].length <= 512 && !/[\u0000-\u001f]/.test(record[key]))) return null
  if ((record.inputId === '') !== (record.inputLabel === '')) return null
  return Object.freeze({ inputId: record.inputId as string, inputLabel: record.inputLabel as string, outputId: record.outputId as string })
}

export function isAudioDeviceState(value: unknown): value is AudioDeviceState {
  if (!value || typeof value !== 'object') return false
  const record = value as AudioDeviceState
  return Object.keys(record).sort().join(',') === 'devices,preferences,reason'
    && parseAudioPreferences(record.preferences) !== null
    && typeof record.reason === 'string' && /^audio_[a-z_]{1,80}$/.test(record.reason)
    && Array.isArray(record.devices) && record.devices.length <= 128
    && record.devices.every((device) => device && Object.keys(device).sort().join(',') === 'deviceId,kind,label'
      && (device.kind === 'audioinput' || device.kind === 'audiooutput')
      && typeof device.deviceId === 'string' && device.deviceId.length <= 512
      && typeof device.label === 'string' && device.label.length <= 512)
}

/** Chromium adds parenthesized product/transport names to Windows endpoint names. */
export function matchMicrophoneName(label: string, names: readonly string[]): string | null {
  const exact = names.filter((name) => name === label)
  if (exact.length) return exact.length === 1 ? exact[0]! : null
  const endpoint = label.replace(/(?: \([^)]*\))+$/, '')
  const matches = names.filter((name) => name === endpoint)
  return matches.length === 1 ? matches[0]! : null
}
