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
  it.each([
    'Play only local music.', 'Play the local video.', 'Play Rain from our music folder.',
    'Play Small Cloud from our video library.', 'Don’t use YouTube.', 'Do not go to YouTube.',
    'Do not look on YouTube.', 'Play Distant Harbor from our vault instead of YouTube.',
    'Play Distant Harbor from our vault rather than YouTube.',
    'Do not search for Rain on YouTube.', 'Don’t play Small Cloud from YouTube.',
    'Do not use the YouTube website.',
  ])('keeps equivalent local-source and negative YouTube wording local: %s', text => {
    expect(localMediaOnly(text)).toBe(true)
  })
  it.each([
    'I watched it on YouTube yesterday. Play Rain from our vault.',
    'The title mentions YouTube. Play it from our folder.',
    'YouTube has many videos, but play Small Cloud from our video library.',
  ])('does not let an incidental YouTube mention override an explicit local request: %s', text => {
    expect(localMediaOnly(text)).toBe(true)
  })
  it('keeps a prior local constraint when YouTube is mentioned without requesting it', async () => {
    const policy = createMediaSourcePolicy()
    policy.begin('local'); policy.observe('local', 'Play Rain from our vault.')
    policy.begin('discussion'); policy.observe('discussion', 'I read about YouTube yesterday.')
    policy.searchedLocal()
    expect(await policy.youtube()).toBe('restricted')
  })
  it.each(['Play Rain on YouTube.', 'On YouTube, play Rain.', 'YouTube, please.',
    '在 YouTube 循環播放雨聲。', 'Play https://youtu.be/abcdefghijk', 'Play Rain on ＹｏｕＴｕｂｅ.'])('allows a directed YouTube choice: %s', async text => {
    const policy = createMediaSourcePolicy()
    policy.begin('local'); policy.observe('local', 'Play from our vault.')
    policy.begin('youtube'); policy.observe('youtube', text)
    expect(await policy.youtube()).toBe('allowed')
  })
  it('does not carry explicit YouTube authorization into a different request', async () => {
    const policy = createMediaSourcePolicy()
    policy.begin('youtube'); policy.observe('youtube', 'Play Rain on YouTube.')
    expect(await policy.youtube()).toBe('allowed')
    policy.begin('generic'); policy.observe('generic', 'Play Small Cloud.')
    expect(await policy.youtube()).toBe('local_lookup_required')
    policy.searchedLocal()
    expect(await policy.youtube()).toBe('allowed')
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
