import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..', '..')

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('portrait visitor avatar component', () => {
  it('renders the official Cubism canvas in a fixed 9:16 composition', () => {
    const component = read('src/renderer/avatar/AvatarCanvas.tsx')
    const styles = read('src/renderer/mirror/styles.css')

    expect(component).toContain('computePortraitLayout')
    expect(component).toContain('createCubismAvatarRenderer')
    expect(component).toContain('data-avatar-state')
    expect(styles).toContain('aspect-ratio: 9 / 16')
    expect(styles).toContain('.avatar-stage__canvas')
  })

  it('keeps a visible static fallback when Cubism cannot load', () => {
    const component = read('src/renderer/avatar/AvatarCanvas.tsx')

    expect(component).toContain('avatar_static_fallback')
    expect(component).toContain('avatar-stage__fallback')
  })

  it('stops both actual and recorded output at the interrupt boundary', () => {
    const mirror = read('src/renderer/mirror/App.tsx')
    const media = read('src/renderer/avatar/audio/avatar-media-controller.ts')

    expect(mirror).toMatch(
      /coordinator\.handleActivity\('interrupted'\)[\s\S]*avatarMediaControllerRef\.current\?\.handleActivity\('interrupted'\)/,
    )
    expect(media).toMatch(/activity === 'interrupted'[\s\S]*stopRecorded\(\)/)
  })

  it('routes the recorded-output fixture through the same music ducking boundary', () => {
    const media = read('src/renderer/avatar/audio/avatar-media-controller.ts')

    expect(media).toMatch(/recordedSource = source[\s\S]*ducking\.setSpeechActive\(true\)/)
    expect(media).toMatch(/source\.disconnect\(\)[\s\S]*ducking\.setSpeechActive\(false\)/)
  })

  it('observes actual Realtime underruns without counting local loop boundaries', () => {
    const media = read('src/renderer/avatar/audio/avatar-media-controller.ts')

    expect(media).toContain("output.audioElement.addEventListener('waiting', noteRealtimeUnderrun)")
    expect(media).toContain("output.audioElement.addEventListener('stalled', noteRealtimeUnderrun)")
    expect(media).toContain('atLoopBoundary')
  })
})
