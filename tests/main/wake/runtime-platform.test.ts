import { describe, expect, it } from 'vitest'
import { resolveWakeRuntimePlatform } from '../../../src/main/wake/runtime-platform'

describe('wake evaluation runtime platform', () => {
  it.each([
    ['win32', 'x64', 'win32-x64'],
    ['darwin', 'arm64', 'darwin-arm64'],
    ['linux', 'x64', null],
    ['win32', 'arm64', null],
  ] as const)('maps %s-%s to the supported package platform %s', (platform, arch, expected) => {
    expect(resolveWakeRuntimePlatform(platform, arch)).toBe(expected)
  })
})
