import { describe, expect, it, vi, afterEach } from 'vitest'
import { createMediaSourcePolicy, localMediaOnly } from '../../src/shared/media-source-policy'

afterEach(() => vi.useRealTimers())
describe('visitor-owned media source restriction', () => {
  it.each(['Play Moonlit Lake from our vault.', 'Play music from our folder.', 'Play from my local library.',
    '只在我們的資料夾找月光湖', '循環播放我們寶庫的雨聲音樂', '从我们的文件夹播放', '不要用 YouTube 播放'])('retains local-only source: %s', text => {
    expect(localMediaOnly(text)).toBe(true)
  })
  it('allows explicit YouTube and retains the restriction across a clue clarification', () => {
    expect(localMediaOnly('The piano version.', true)).toBe(true)
    expect(localMediaOnly('Okay, try YouTube instead.', true)).toBe(false)
    expect(localMediaOnly('找不到的話就用 YouTube。', true)).toBe(false)
    expect(localMediaOnly('Play Rain.')).toBe(false)
    expect(localMediaOnly('Do not search YouTube.')).toBe(true)
  })
  it('waits for current ASR before permitting network access and ignores an older turn', async () => {
    const policy = createMediaSourcePolicy()
    policy.begin('current')
    const pending = policy.youtube()
    policy.observe('old', 'Play on YouTube')
    policy.observe('current', 'Play from our vault')
    expect(await pending).toBe('restricted')
    policy.begin('next'); policy.observe('next', 'Search YouTube')
    expect(await policy.youtube()).toBe('allowed')
    policy.reset()
    expect(await policy.youtube()).toBe('local_lookup_required')
  })
  it('requires local lookup before an unspecified source can use YouTube, while explicit YouTube skips it', async () => {
    const policy = createMediaSourcePolicy()
    policy.begin('generic'); policy.observe('generic', 'Play Moonlit Lake')
    expect(await policy.youtube()).toBe('local_lookup_required')
    policy.searchedLocal()
    expect(await policy.youtube()).toBe('allowed')
    policy.reset(); policy.begin('youtube'); policy.observe('youtube', 'Play Moonlit Lake on YouTube')
    expect(await policy.youtube()).toBe('allowed')
  })
  it('does not send a query while final ASR is missing', async () => {
    vi.useFakeTimers()
    const policy = createMediaSourcePolicy()
    policy.begin('current')
    const pending = policy.youtube()
    await vi.advanceTimersByTimeAsync(1500)
    expect(await pending).toBe('pending')
  })
})
