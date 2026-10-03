import { describe, expect, it } from 'vitest'
import { configureVideoDecoding } from '../../src/main/video-decoding-policy'

describe('video decoding policy', () => {
  it('avoids the reproduced Windows platform decoder stall without disabling GPU rendering', () => {
    const switches: string[] = []
    expect(configureVideoDecoding('win32', name => switches.push(name))).toBe('windows_software_video_decode')
    expect(switches).toEqual(['disable-accelerated-video-decode'])
  })
  it.each(['darwin', 'linux'])('preserves the platform decoder on %s', platform => {
    const switches: string[] = []
    expect(configureVideoDecoding(platform, name => switches.push(name))).toBe('platform_default_video_decode')
    expect(switches).toEqual([])
  })
})
