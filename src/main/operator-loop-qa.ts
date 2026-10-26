import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import type { LoopVideoSettings, LoopVideoView, OperatorLoopSnapshot } from '../shared/operator-loop'
import type { OperatorAction } from './operator-control'
import { besideMirror, consolePlacement, overMirror, sendQaOperatorCommand, type ConsolePlacement } from './operator-command-qa'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'
import { selectConsoleMainDisplay } from './portrait-display'

const CASES = [
  'operator_loop_avatar_authored', 'operator_loop_settings_saved', 'operator_loop_settings_reloaded',
  'operator_loop_muted_preview', 'operator_loop_embedded_audio', 'operator_loop_duplicate_play',
  'operator_loop_avatar_return', 'operator_loop_separate_audio', 'operator_loop_independent_wraps',
  'operator_loop_single_reload', 'operator_loop_failed_black', 'operator_loop_start_normal_recovery',
  'operator_console_on_mirror', 'operator_console_preserves_loop_and_draft',
  'operator_loop_saved_replacement_button', 'operator_loop_start_cancel',
  'operator_console_remote_main_then_deck',
  'operator_remote_console_beside_avatar', 'operator_remote_console_repeat_restores_window',
  'operator_remote_console_display_change', 'operator_remote_console_no_main_display',
  'operator_remote_console_venue_keys',
  'operator_desktop_preserves_draft', 'operator_desktop_return_buttons',
  'operator_music_loop_play_repeat_console', 'operator_music_loop_transitions', 'operator_music_loop_empty_recovery',
] as const

const DOM = `
  const bridge = window.mirrorConsole ?? window.magicMirror;
  const panel = document.querySelector('.loop-video-panel');
  const visible = el => !!el && !el.closest('[hidden]') && el.getClientRects().length > 0;
  const button = name => [...document.querySelectorAll('button')].find(el => visible(el)
    && (el.getAttribute('aria-label') || el.textContent.trim()) === name);
  const control = name => [...document.querySelectorAll('input,select,textarea')]
    .find(el => visible(el) && el.getAttribute('aria-label') === name)
    ?? [...document.querySelectorAll('label')].find(el => visible(el) && el.textContent.trim().startsWith(name))
      ?.querySelector('input,select,textarea');
  const click = name => {
    const el = button(name);
    if (!el || el.matches(':disabled')) throw Error('phase4_qa_operator_loop_button_unavailable');
    el.scrollIntoView({block:'center'}); el.click();
  };
  const set = (el, value) => {
    if (!el || el.matches(':disabled')) throw Error('phase4_qa_operator_loop_field_unavailable');
    const prototype = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
  };
`

interface PlaybackSample {
  elapsed_ms: number
  decoded_frames: number
  dropped_frames: number
  distinct_frames: number
  video_duration_ms: number
  audio_duration_ms: number | null
  video_wraps: number
  audio_wraps: number
  video_only_wraps: number
  audio_only_wraps: number
  unexpected_resets: number
  stable_elements: boolean
  sample_error: boolean
}

/** Real DOM authoring, Chromium decoding and production IPC; only synthetic isolated media. */
export async function runOperatorLoopQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const userData = resolve(input.outputDir, '..', 'user-data')
  if (process.env['MIRROR_PHASE4_QA'] !== '1' || process.env['MIRROR_OPERATOR_LOOP_QA'] !== '1'
    || resolve(process.env['MIRROR_USER_DATA_DIR'] ?? '') !== userData
    || resolve(process.env['MIRROR_PHASE4_QA_OUTPUT_DIR'] ?? '') !== resolve(input.outputDir)) {
    throw Error('phase4_qa_operator_loop_isolation_required')
  }
  let step: string = CASES[0], screenshots = 0
  const passed = new Set<string>()
  const fail = (reason: string): never => { throw Error(`phase4_qa_operator_loop_${reason}`) }
  const bounded = async <T>(operation: Promise<T>, ms = 5000): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([operation, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('phase4_qa_operator_loop_probe_timeout')), ms)
      })])
    } finally { clearTimeout(timer) }
  }
  const evaluate = <T>(source: string): Promise<T> => bounded(input.console.webContents.executeJavaScript(
    `(async () => { ${DOM} ${source} })()`, true,
  ) as Promise<T>)
  const mirror = <T>(source: string, ms = 5000): Promise<T> => bounded(input.mirror.webContents.executeJavaScript(
    `(async () => { const root = document.querySelector('.operator-loop');
      const video = root?.querySelector('video'), audio = root?.querySelector('audio'); ${source} })()`, true,
  ) as Promise<T>, ms)
  const waitFor = async (probe: () => Promise<boolean>, ms = 15000): Promise<void> => {
    const end = performance.now() + ms
    while (performance.now() < end) {
      if (await bounded(probe(), Math.max(1, Math.min(5000, end - performance.now())))) return
      await new Promise(done => setTimeout(done, 100))
    }
    throw Error(`phase4_qa_${step}_timeout`)
  }
  const edit = (source: string): Promise<void> => evaluate(`${source};
    await new Promise(done => requestAnimationFrame(() => done()));`)
  const click = async (name: string): Promise<void> => {
    await waitFor(() => evaluate(`return !!button(${JSON.stringify(name)}) && !button(${JSON.stringify(name)}).matches(':disabled')`))
    await edit(`click(${JSON.stringify(name)})`)
  }
  const set = async (name: string, value: string): Promise<void> => {
    await waitFor(() => evaluate(`const el = control(${JSON.stringify(name)}); return !!el && !el.matches(':disabled')`))
    await edit(`set(control(${JSON.stringify(name)}), ${JSON.stringify(value)})`)
    await waitFor(() => evaluate(`return control(${JSON.stringify(name)})?.value === ${JSON.stringify(value)}`))
  }
  const pass = (metrics?: object): void => {
    if (passed.has(step)) fail('duplicate_case')
    passed.add(step)
    input.onEvidence({ step, status: 'passed', ...(metrics ? { item: JSON.stringify(metrics) } : {}) })
  }
  const shot = async (name: string, onMirror = false, top = false): Promise<void> => {
    if (!onMirror) {
      input.console.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
      await edit(top ? "document.querySelector('.live-bar')?.scrollIntoView({block:'start'})"
        : "(panel ?? document.querySelector('.console__publish-bar'))?.scrollIntoView({block:'end'})")
    }
    const result = await capture(onMirror ? input.mirror : input.console, input.outputDir, name)
    screenshots++
    input.onEvidence({ step, status: 'captured', file: name, sha256: result.sha256, nonblack_pixels: result.nonblackPixels })
  }
  // Expected black is an exception to capture()'s useful nonblack-frame guard.
  // Retain the raw synthetic frame even if its pixel assertion fails.
  const blackShot = async (): Promise<void> => {
    const frame = await input.mirror.capturePage(), bitmap = frame.toBitmap()
    let nonblack = 0
    for (let i = 0; i + 3 < bitmap.length; i += 4) {
      if (bitmap[i] !== 0 || bitmap[i + 1] !== 0 || bitmap[i + 2] !== 0) nonblack++
    }
    const png = frame.toPNG(), name = 'operator-loop-failed-black.png'
    await writeFile(join(input.outputDir, name), png)
    screenshots++
    input.onEvidence({ step, status: 'captured', file: name,
      sha256: createHash('sha256').update(png).digest('hex'), nonblack_pixels: nonblack })
    if (bitmap.length === 0 || nonblack !== 0) fail('failure_surface_not_black')
  }
  const snapshot = (): Promise<OperatorLoopSnapshot> => mirror('return window.magicMirror.getOperatorLoop()')
  const view = (): Promise<LoopVideoView> => evaluate(`const r = await bridge.loopVideo({action:'get'});
    if (!r.ok) throw Error('phase4_qa_operator_loop_read_failed'); return r.value;`)
  const fingerprint = async (): Promise<string> => {
    const json = await evaluate<string>(`const r = await bridge.getConfig();
      if (!r.ok) throw Error('phase4_qa_operator_loop_config_read_failed'); return JSON.stringify(r.value.active);`)
    return createHash('sha256').update(json).digest('hex')
  }
  const persisted = async (settings: LoopVideoSettings, intent: 'avatar' | 'loop'): Promise<void> => {
    const saved = JSON.parse(await readFile(join(userData, 'operator-loop.json'), 'utf8'))
    if (saved.version !== 1 || saved.intent !== intent
      || JSON.stringify(saved.settings) !== JSON.stringify(settings)) fail('saved_settings_mismatch')
  }
  const save = async (): Promise<LoopVideoSettings> => {
    await click('Save settings')
    await waitFor(() => evaluate(`return panel?.textContent.includes('Settings saved.')
      && !!button('Play on Mirror') && !button('Play on Mirror').matches(':disabled')
      && button('Save settings').matches(':disabled')`))
    return (await view()).settings
  }
  const playing = async (): Promise<OperatorLoopSnapshot> => {
    await waitFor(() => mirror(`const s = await window.magicMirror.getOperatorLoop();
      return s.mode === 'loop' && s.status === 'playing' && root?.dataset.state === 'playing'
        && !!video && !video.paused && video.readyState >= 2 && video.getVideoPlaybackQuality().totalVideoFrames > 0;`))
    await waitFor(() => evaluate(`return document.querySelector('.runtime-status')?.textContent.includes('Voice, wake listening and camera are off.')
      && !document.querySelector('.runtime-status')?.textContent.includes('Check the microphone');`))
    return snapshot()
  }
  const protocol = async (host: 'visual-draft' | 'visual' | 'music', id: string, generation?: number): Promise<void> => {
    const source = `const media = ${host === 'visual-draft' ? "panel?.querySelector('.loop-video-preview video')" : host === 'music' ? 'audio' : 'video'};
      if (!media?.currentSrc) return false;
      const url = new URL(media.currentSrc);
      if (url.protocol !== 'magic-mirror-media:' || url.hostname !== ${JSON.stringify(host)}
        || decodeURIComponent(url.pathname.slice(1)) !== ${JSON.stringify(id)}
        || ${generation === undefined ? "url.searchParams.has('operatorLoop')" : `url.searchParams.get('operatorLoop') !== '${generation}'`}) return false;
      const response = await fetch(media.currentSrc, {headers:{Range:'bytes=0-31'}});
      return response.status === 206 && (await response.arrayBuffer()).byteLength === 32
        && response.headers.get('Content-Type')?.startsWith(${JSON.stringify(host === 'music' ? 'audio/wav' : 'video/webm')});`
    if (!await (host === 'visual-draft' ? evaluate<boolean>(source) : mirror<boolean>(source))) fail('protocol_range_failed')
  }
  const sample = async (independent = false): Promise<PlaybackSample> => {
    // Hash actual decoded pixels and count real wraps during a bounded sample;
    // neither currentTime nor reports are fabricated.
    const ms = independent ? 12500 : 2000
    const result = await mirror<PlaybackSample>(`return new Promise(done => {
      const v = video, a = audio, start = performance.now(), q = v.getVideoPlaybackQuality();
      const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 85;
      const context = canvas.getContext('2d', {willReadFrequently:true});
      const hashes = new Set(); let previousVideo = v.currentTime, previousAudio = a?.currentTime ?? 0;
      let videoWraps = 0, audioWraps = 0, videoOnly = 0, audioOnly = 0, resets = 0, stable = true, error = false;
      let timer, deadline, finished = false;
      const finish = () => {
        if (finished) return; finished = true; clearInterval(timer); clearTimeout(deadline);
        const after = v.getVideoPlaybackQuality();
        done({elapsed_ms:Math.round(performance.now()-start), decoded_frames:after.totalVideoFrames-q.totalVideoFrames,
          dropped_frames:after.droppedVideoFrames-q.droppedVideoFrames, distinct_frames:hashes.size,
          video_duration_ms:Math.round(v.duration*1000), audio_duration_ms:a ? Math.round(a.duration*1000) : null,
          video_wraps:videoWraps, audio_wraps:audioWraps, video_only_wraps:videoOnly, audio_only_wraps:audioOnly,
          unexpected_resets:resets, stable_elements:stable, sample_error:error});
      };
      const tick = () => {
        try {
          stable = stable && document.querySelector('.operator-loop video') === v
            && document.querySelector('.operator-loop audio') === (a ?? null) && !v.paused && !v.error
            && (!a || !a.paused && !a.error);
          if (!stable) { finish(); return; }
          const vt = v.currentTime, at = a?.currentTime ?? 0;
          const vw = vt < previousVideo - .3, aw = !!a && at < previousAudio - .3;
          if (vw) { videoWraps++; if (previousVideo < v.duration*.6 || vt > v.duration*.4) resets++; }
          if (aw) { audioWraps++; if (previousAudio < a.duration*.6 || at > a.duration*.4) resets++; }
          if (vw && !aw && at >= previousAudio) videoOnly++;
          if (aw && !vw && vt >= previousVideo) audioOnly++;
          previousVideo = vt; previousAudio = at;
          context.drawImage(v, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let hash = 2166136261;
          for (let i=0; i<pixels.length; i++) hash = Math.imul(hash ^ pixels[i], 16777619);
          hashes.add(hash >>> 0);
          if (${independent} && performance.now()-start >= 5000 && videoWraps >= 2 && audioWraps >= 3
            && videoOnly > 0 && audioOnly > 0) finish();
        } catch { error = true; finish(); }
      };
      timer = setInterval(tick, 75); deadline = setTimeout(finish, ${ms}); tick();
    });`, ms + 2000)
    input.onEvidence({ step, status: 'measured', item: JSON.stringify(result) })
    if (!result.stable_elements || result.sample_error || !Number.isFinite(result.elapsed_ms) || result.elapsed_ms < 1500
      || !Number.isFinite(result.video_duration_ms) || Math.abs(result.video_duration_ms - 3008) > 200
      || result.decoded_frames < Math.max(12, Math.floor(result.elapsed_ms / 100))
      || result.distinct_frames < 2 || result.unexpected_resets !== 0) fail('decoded_motion_not_proven')
    if (independent && (result.video_wraps < 2 || result.audio_wraps < 3
      || result.video_only_wraps < 1 || result.audio_only_wraps < 1
      || result.audio_duration_ms === null || !Number.isFinite(result.audio_duration_ms)
      || Math.abs(result.audio_duration_ms - 1250) > 100
      || Math.abs(result.video_duration_ms - result.audio_duration_ms) < 500)) {
      fail('independent_wraps_not_proven')
    }
    return result
  }
  let savedAvatarId = '', avatarFingerprint = ''
  const returnedAvatar = async (): Promise<void> => {
    await waitFor(() => mirror(`const s = await window.magicMirror.getOperatorLoop();
      return s.mode === 'avatar' && s.status === 'idle' && !root
        && document.querySelector('.mirror-presentation')?.dataset.mode === 'always_visible'
        && document.querySelector('.mirror-presentation')?.dataset.loading === 'false'
        && document.querySelector('.avatar-stage')?.dataset.rendererState === 'ready'
        && !!document.querySelector('.avatar-stage canvas');`), 20000)
    if (!await evaluate<boolean>(`const r = await bridge.getConfig();
      return r.ok && r.value.active.avatarCatalog?.activeAvatarId === ${JSON.stringify(savedAvatarId)}
        && r.value.active.avatarCatalog.avatars.find(a => a.id === ${JSON.stringify(savedAvatarId)})?.modelId === 'builtin-ren'
        && r.value.publishDiff.changed.length === 0;`)) fail('saved_avatar_not_restored')
    if (avatarFingerprint && await fingerprint() !== avatarFingerprint) fail('avatar_settings_changed')
  }
  const operatorCommand = async (action: OperatorAction, expected: 'success' | 'failed' = 'success'): Promise<void> => {
    // The Stream Deck apps' and Remote Console's production mailbox. Stay inside this
    // process's isolated userData; never invoke the field launcher or TV control.
    const status = await sendQaOperatorCommand(userData, action)
    if (status === 'timeout' || status === 'invalid') fail(`operator_command_${status}`)
    if (status !== expected) fail('normal_command_failed')
  }
  const placement = (): ConsolePlacement => consolePlacement(input.console, input.mirror)
  const modeFile = (): Promise<string> => readFile(join(userData, 'mirror-mode.json'), 'utf8').catch(() => 'missing')
  let mirrorBounds = '', remoteBounds = ''
  // The avatar on the TV is untouched: same glass bounds, avatar idle and rendering, settings unchanged.
  const avatarIntact = async (): Promise<boolean> => JSON.stringify(input.mirror.getBounds()) === mirrorBounds
    && (await snapshot()).mode === 'avatar' && await fingerprint() === avatarFingerprint
    && await mirror<boolean>(`return document.querySelector('.avatar-stage')?.dataset.rendererState === 'ready'
      && !!document.querySelector('.avatar-stage canvas')`)
  // Remote Console fills the main display's work area, inset 16 px like the Console over the mirror.
  const remoteConsole = async (): Promise<ConsolePlacement> => {
    await operatorCommand('show_console_main')
    const p = placement(), mirrorId = screen.getDisplayMatching(input.mirror.getBounds()).id
    const main = selectConsoleMainDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay().id, mirrorId)
    if (!besideMirror(p) || !main || screen.getDisplayMatching(p.bounds).id !== main.id) fail('remote_console_not_beside_avatar')
    const area = main!.workArea
    if (JSON.stringify(p.bounds) !== JSON.stringify({ x: area.x + 16, y: area.y + 16,
      width: area.width - 32, height: area.height - 32 })) fail('remote_console_bounds_unexpected')
    return p
  }
  try {
    input.onEvidence({ step: 'operator_loop_scope', status: 'metadata', item: JSON.stringify({
      media: 'isolated_synthetic', cases: CASES.length, provider: 'not_executed', physical_audio: 'not_executed',
      hardware: 'not_executed', field_launcher: 'not_executed', normal_route: 'production_isolated_mailbox',
    }) })
    await waitFor(() => mirror(`return !!window.magicMirror?.getOperatorLoop
      && !!window.magicMirror.onOperatorLoop && !!window.magicMirror.reportOperatorLoop;`))
    await mirror(`window.__operatorLoopQa = {events:[]};
      window.__operatorLoopQa.unsubscribe = window.magicMirror.onOperatorLoop(s => {
        const events = window.__operatorLoopQa.events;
        events.push({mode:s.mode,status:s.status,generation:s.generation,reason:s.reason});
        if (events.length > 128) events.shift();
      });`)
    if ((await snapshot()).mode !== 'avatar') fail('fixture_started_in_loop')

    await click('Avatars'); await click('New avatar')
    await set('Avatar name', 'Operator Loop QA Return')
    savedAvatarId = await evaluate<string>("return control('Editing avatar').value")
    await click('Appearance')
    await set('Model bundle', 'builtin-ren')
    await set('Visibility mode', 'always_visible')
    await set('Background image / looping video', '')
    await set('Dormant music', '')
    await click('Save & apply all changes')
    await waitFor(() => evaluate(`return !!button('Save & apply all changes')
      && !button('Save & apply all changes').matches(':disabled')
      && document.querySelector('.console__publish-bar .console__scene-result')?.textContent === 'Saved and applied. Ready for the next conversation.'`))
    await click('Use on Mirror')
    await returnedAvatar()
    avatarFingerprint = await fingerprint()
    pass()

    // Remote Console journeys (owner away, Chrome Remote Desktop on the main display).
    step = CASES[17]
    const qaConsoleBounds = input.console.getBounds(), windowCount = BrowserWindow.getAllWindows().length
    mirrorBounds = JSON.stringify(input.mirror.getBounds())
    const modeBefore = await modeFile()
    const sentinel = await evaluate<string>('window.__remoteConsoleQa = crypto.randomUUID(); return window.__remoteConsoleQa')
    const sameRenderer = async (): Promise<boolean> => BrowserWindow.getAllWindows().length === windowCount
      && await evaluate<string>('return window.__remoteConsoleQa') === sentinel
    input.console.hide()
    await waitFor(async () => !input.console.isVisible(), 5000)
    const remote = await remoteConsole()
    remoteBounds = JSON.stringify(remote.bounds)
    if (!await avatarIntact() || await modeFile() !== modeBefore) fail('remote_console_changed_mirror')
    if (!await sameRenderer()) fail('remote_console_not_same_window')
    await shot('operator-remote-console-avatar.png', false, true)
    pass({ beside_mirror: true, always_on_top: false, focused: remote.focused, windows_over_mirror: remote.windowsOverMirror,
      width: remote.bounds.width, height: remote.bounds.height, same_renderer: true, mirror_mode_unchanged: true })

    step = CASES[18]
    // Pressed again, minimized or maximized (a remote viewer may do either): the same window returns, inset on main.
    await remoteConsole()
    input.console.minimize()
    await waitFor(async () => input.console.isMinimized(), 5000)
    await remoteConsole()
    input.console.maximize()
    await waitFor(async () => input.console.isMaximized(), 5000)
    const restored = await remoteConsole()
    if (input.console.isMaximized() || JSON.stringify(restored.bounds) !== remoteBounds) fail('remote_console_window_not_restored')
    if (!await avatarIntact() || !await sameRenderer()) fail('remote_console_changed_mirror')
    pass({ repeat_same_bounds: true, minimized_restored: true, maximized_restored: true, same_renderer: true })

    step = CASES[19]
    // A display change (TV reconnect, a remote session resizing the virtual display) re-places
    // the CONSOLE key's Console over the mirror as before, and leaves Remote Console beside it.
    if (screen.listenerCount('display-metrics-changed') === 0) fail('display_watch_not_configured')
    const realDisplays = screen.getAllDisplays
    let displayQueries = 0
    screen.getAllDisplays = () => { displayQueries++; return realDisplays() }
    try {
      const metricsChanged = async (): Promise<void> => {
        const before = displayQueries
        screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), ['workArea'])
        await waitFor(async () => displayQueries > before, 5000)
        await new Promise(done => setTimeout(done, 300))
      }
      await operatorCommand('show_console')
      const deck = placement()
      if (!overMirror(deck)) fail('deck_console_not_over_mirror')
      input.console.setBounds(remote.bounds)
      await metricsChanged()
      const deckAfter = placement()
      if (!overMirror(deckAfter) || JSON.stringify(deckAfter.bounds) !== JSON.stringify(deck.bounds)) fail('deck_console_not_replaced_over_mirror')
      await remoteConsole()
      await metricsChanged()
      const remoteAfter = placement()
      if (!besideMirror(remoteAfter) || JSON.stringify(remoteAfter.bounds) !== remoteBounds) fail('remote_console_pulled_over_mirror')
    } finally { screen.getAllDisplays = realDisplays }
    if (!await avatarIntact()) fail('remote_console_changed_mirror')
    pass({ deck_replaced_over_mirror: true, remote_stayed_beside: true, rehomes_observed: 2 })

    step = CASES[20]
    // Fault injection: only the mirror's display is reported (virtual display missing).
    // Remote Console reports failure, so the Desktop app alerts, and never covers the avatar.
    const glassDisplay = screen.getDisplayMatching(input.mirror.getBounds())
    const realPrimary = screen.getPrimaryDisplay
    input.console.hide()
    await waitFor(async () => !input.console.isVisible(), 5000)
    screen.getAllDisplays = () => [glassDisplay]
    screen.getPrimaryDisplay = () => glassDisplay
    try { await operatorCommand('show_console_main', 'failed') }
    finally { screen.getAllDisplays = realDisplays; screen.getPrimaryDisplay = realPrimary }
    const refused = placement()
    if (refused.visible || refused.alwaysOnTop || refused.windowsOverMirror !== 0 || !await avatarIntact()) fail('remote_console_covered_avatar_without_main')
    await remoteConsole()
    pass({ reply: 'failed', console_visible: false, windows_over_mirror: 0, recovered_when_main_returns: true })
    input.console.setBounds(qaConsoleBounds)

    step = CASES[1]
    await click('Loop Video')
    await waitFor(() => evaluate(`const r = await bridge.mediaFolders({action:'get'});
      return r.ok && r.value.shared?.status === 'ready' && r.value.entries.length === 5
        && ['operator-loop-qa-video','operator-loop-qa-music'].every(name => r.value.entries.some(e => e.origin === 'shared' && e.name === name))
        && !!control('Loop video') && !control('Loop video').matches(':disabled')
        && [...control('Loop video').options].some(o => o.textContent === 'operator-loop-qa-video');`))
    const videoId = await evaluate<string>(`return [...control('Loop video').options].find(o => o.textContent === 'operator-loop-qa-video')?.value`)
    if (!/^folder-[a-f0-9]{40}$/.test(videoId)) fail('fixture_video_missing')
    await set('Loop video', videoId)
    await set('Loop audio source', 'embedded'); await set('Loop video fit', 'contain'); await set('Loop volume', '0.42')
    const embedded = await save()
    if (embedded.videoId !== videoId || embedded.audioMode !== 'embedded' || embedded.audioId !== ''
      || embedded.fit !== 'contain' || embedded.volume !== 0.42) fail('authored_settings_mismatch')
    await persisted(embedded, 'avatar'); pass()
    await shot('operator-loop-console-saved.png')

    step = CASES[2]
    input.console.webContents.reload()
    await click('Loop Video')
    await waitFor(() => evaluate(`return control('Loop video')?.value === ${JSON.stringify(videoId)}
      && control('Loop audio source')?.value === 'embedded' && control('Loop video fit')?.value === 'contain'
      && control('Loop volume')?.value === '0.42' && !!button('Play on Mirror')
      && !button('Play on Mirror').matches(':disabled') && button('Save settings').matches(':disabled');`))
    if (JSON.stringify((await view()).settings) !== JSON.stringify(embedded)) fail('reload_lost_settings')
    pass()

    step = CASES[3]
    await edit("panel.querySelector('.loop-video-preview summary').click()")
    await waitFor(() => evaluate(`const v = panel?.querySelector('.loop-video-preview video');
      return !!v && v.readyState >= 2 && v.muted && v.volume === 0;`))
    await evaluate("await panel.querySelector('.loop-video-preview video').play()")
    const previewFrames = await evaluate<number>("return panel.querySelector('.loop-video-preview video').getVideoPlaybackQuality().totalVideoFrames")
    await waitFor(() => evaluate(`const v = panel.querySelector('.loop-video-preview video');
      return !v.paused && v.muted && v.volume === 0 && v.currentTime > .15
        && v.getVideoPlaybackQuality().totalVideoFrames >= ${previewFrames + 3};`), 5000)
    await protocol('visual-draft', videoId)
    if ((await snapshot()).mode !== 'avatar' || await fingerprint() !== avatarFingerprint) fail('preview_changed_mirror')
    await shot('operator-loop-console-preview.png')
    await edit("panel.querySelector('.loop-video-preview summary').click()")
    await waitFor(() => evaluate("return panel.querySelector('.loop-video-preview video').paused"))
    pass()

    step = CASES[4]
    await click('Play on Mirror')
    const embeddedPlaying = await playing()
    if (!await mirror<boolean>(`return !video.muted && video.loop && Math.abs(video.volume-.42)<.001
      && !audio && getComputedStyle(video).objectFit === 'contain';`)) fail('embedded_audio_mode_invalid')
    await protocol('visual', videoId, embeddedPlaying.generation)
    const motion = await sample()
    const embeddedAudio = await mirror<{ available: boolean; decoded_bytes: number }>(`return {
      available: typeof video.webkitAudioDecodedByteCount === 'number', decoded_bytes: video.webkitAudioDecodedByteCount ?? 0 };`)
    if (embeddedAudio.available && embeddedAudio.decoded_bytes <= 0) fail('embedded_audio_not_decoded')
    input.onEvidence({ step, status: embeddedAudio.available ? 'measured' : 'not_executed',
      item: JSON.stringify({ decoder_audio_meter: embeddedAudio.available, decoded_bytes: embeddedAudio.decoded_bytes }) })
    await persisted(embedded, 'loop')
    await shot('operator-loop-embedded-playing.png', true); pass(motion)

    step = CASES[5]
    await mirror(`window.__operatorLoopQa.nodes = {video, audio, source:video.currentSrc, loads:0};
      video.addEventListener('loadstart', () => window.__operatorLoopQa.nodes.loads++);`)
    await click('Play on Mirror'); await click('Play on Mirror')
    await waitFor(() => evaluate("return !!button('Play on Mirror') && !button('Play on Mirror').matches(':disabled')"))
    if ((await snapshot()).generation !== embeddedPlaying.generation
      || !await mirror<boolean>(`const n = window.__operatorLoopQa.nodes;
        return video === n.video && audio === n.audio && video.currentSrc === n.source && n.loads === 0 && !video.paused;`)) {
      fail('duplicate_play_restarted')
    }
    pass({ generation_unchanged: true, media_nodes_unchanged: true, source_loads: 0, duplicate_clicks: 2 })

    step = CASES[14]
    const replacementId = await evaluate<string>(`return [...control('Loop video').options].find(o => o.textContent === 'operator-loop-qa-replacement')?.value`)
    if (!/^folder-[a-f0-9]{40}$/.test(replacementId) || replacementId === videoId) fail('replacement_fixture_missing')
    await set('Loop video', replacementId)
    const replacement = await save()
    await persisted(replacement, 'loop')
    if ((await snapshot()).settings.videoId !== videoId) fail('save_changed_playback_before_button')
    await operatorCommand('play_loop')
    const replaced = await playing()
    if (replaced.settings.videoId !== replacementId || replaced.generation <= embeddedPlaying.generation) fail('button_used_old_selection')
    await protocol('visual', replacementId, replaced.generation)
    await shot('operator-loop-saved-replacement.png', true)
    pass({ saved_selection_used: true, new_generation: true, route: 'production_isolated_mailbox' })
    await operatorCommand('show_console')
    await set('Loop video', videoId); await save()

    step = CASES[6]
    await click('Return to Avatar'); await returnedAvatar(); await persisted(embedded, 'avatar')
    await shot('operator-loop-avatar-return.png', true); pass()

    step = CASES[15]
    // Hold the Mirror's media start: Main stays preparing while Play waits, and
    // the control bar must still offer Return to Avatar (TODO P2, 2026-10-18).
    await mirror(`window.__operatorLoopQa.play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { return new Promise(() => {}) };`)
    try {
      await click('Play on Mirror')
      await waitFor(async () => {
        const s = await snapshot()
        return s.mode === 'loop' && s.status === 'preparing' && await evaluate<boolean>(`return !!button('Return to Avatar')
          && !button('Return to Avatar').matches(':disabled') && !!panel?.textContent.includes('Preparing loop video')
          && button('Play on Mirror').matches(':disabled')`)
      }, 10000)
      await shot('operator-loop-console-starting.png')
    } finally {
      await mirror(`if (window.__operatorLoopQa?.play) { HTMLMediaElement.prototype.play = window.__operatorLoopQa.play; delete window.__operatorLoopQa.play }`)
    }
    await click('Return to Avatar'); await returnedAvatar(); await persisted(embedded, 'avatar')
    // The cancelled Play settles as stopped: no start-failure alert, controls ready again.
    await waitFor(() => evaluate(`return !!panel?.textContent.includes('Not playing') && !button('Play on Mirror').matches(':disabled')
      && !panel.querySelector('.console__fault') && !button('Return to Avatar')`))
    pass({ return_offered_while_preparing: true, start_failure_shown: false })

    step = CASES[7]
    await set('Loop audio source', 'separate')
    await waitFor(() => evaluate("return [...(control('Loop music')?.options ?? [])].some(o => o.textContent === 'operator-loop-qa-music')"))
    const audioId = await evaluate<string>("return [...control('Loop music').options].find(o => o.textContent === 'operator-loop-qa-music').value")
    await set('Loop music', audioId); await set('Loop video fit', 'cover')
    const separate = await save()
    if (separate.audioMode !== 'separate' || separate.audioId !== audioId || separate.videoId !== videoId
      || separate.volume !== .42 || separate.fit !== 'cover') fail('separate_settings_mismatch')
    await click('Play on Mirror')
    const separatePlaying = await playing()
    await waitFor(() => mirror(`return video.muted && video.loop && !!audio && !audio.muted && audio.loop
      && !audio.paused && audio.currentTime > 0 && Math.abs(audio.volume-.42)<.001
      && getComputedStyle(video).objectFit === 'cover';`))
    await protocol('visual', videoId, separatePlaying.generation)
    await protocol('music', audioId, separatePlaying.generation)
    await persisted(separate, 'loop'); pass()

    step = CASES[8]
    const loops = await sample(true)
    await shot('operator-loop-independent-playing.png', true); pass(loops)

    step = CASES[12]
    const beforeConsole = await snapshot()
    // Unsaved loop volume survives re-presenting the same Console renderer.
    await edit("set(control('Loop volume'), '0.43')")
    input.console.hide()
    await operatorCommand('show_console')
    const consoleBounds = input.console.getBounds()
    const consoleDisplay = screen.getDisplayMatching(consoleBounds)
    const mirrorDisplay = screen.getDisplayMatching(input.mirror.getBounds())
    if (!input.console.isVisible() || !input.console.isFocused() || !input.console.isAlwaysOnTop()
      || consoleDisplay.id !== mirrorDisplay.id) fail('console_not_above_mirror')
    const workArea = mirrorDisplay.workArea
    if (consoleBounds.x < workArea.x || consoleBounds.y < workArea.y
      || consoleBounds.x + consoleBounds.width > workArea.x + workArea.width
      || consoleBounds.y + consoleBounds.height > workArea.y + workArea.height) fail('console_outside_mirror')
    await shot('operator-console-on-mirror.png')
    pass({ on_mirror: true, visible: true, focused: true, always_on_top: true })

    step = CASES[13]
    await operatorCommand('show_console')
    const afterConsole = await snapshot()
    if (afterConsole.generation !== beforeConsole.generation || afterConsole.mode !== 'loop'
      || afterConsole.status !== 'playing' || !await evaluate<boolean>("return control('Loop volume').value === '0.43'")) {
      fail('console_changed_program_or_draft')
    }
    const overlayMotion = await sample()
    await edit("set(control('Loop volume'), '0.42')")
    pass({ generation_unchanged: true, unsaved_draft_preserved: true, decoded_frames: overlayMotion.decoded_frames })

    step = CASES[16]
    // Remote Console moves the same renderer beside the mirror at the normal level; the
    // next CONSOLE press must put it back over the mirror exactly as before.
    const beforeRemote = await snapshot()
    await edit("set(control('Loop volume'), '0.44')")
    const remoteDuringLoop = await remoteConsole()
    // The loop keeps decoding new frames while the Console sits beside it.
    const besideMotion = await sample()
    await shot('operator-console-remote-main.png')
    await operatorCommand('show_console')
    if (!overMirror(placement())) fail('deck_console_not_over_mirror')
    const afterRemote = await snapshot()
    if (afterRemote.generation !== beforeRemote.generation || afterRemote.mode !== 'loop'
      || afterRemote.status !== 'playing' || !await evaluate<boolean>("return control('Loop volume').value === '0.44'")) {
      fail('remote_console_changed_program_or_draft')
    }
    await edit("set(control('Loop volume'), '0.42')")
    pass({ remote_beside_mirror: true, remote_focused: remoteDuringLoop.focused, decoded_frames_beside: besideMotion.decoded_frames,
      deck_back_over_mirror: true, generation_unchanged: true, unsaved_draft_preserved: true })

    step = CASES[9]
    const beforePause = await snapshot()
    if (!await mirror<boolean>("video.pause(); return video.paused")) fail('first_pause_not_applied')
    await waitFor(async () => {
      const s = await snapshot()
      if (s.generation > beforePause.generation + 1 || s.status === 'failed') fail('first_pause_did_not_recover')
      return s.generation === beforePause.generation + 1 && s.status === 'playing'
    }, 13000)
    const recovered = await playing()
    const recoveredMotion = await sample()
    const reloadCount = await mirror<number>(`return window.__operatorLoopQa.events.filter(e =>
      e.generation > ${beforePause.generation} && e.status === 'recovering' && e.reason === 'operator_loop_reloading').length;`)
    if (reloadCount !== 1 || recovered.generation !== beforePause.generation + 1) fail('reload_count_invalid')
    await shot('operator-loop-recovered-once.png', true)
    pass({ reloads: reloadCount, decoded_frames: recoveredMotion.decoded_frames, elapsed_ms: recoveredMotion.elapsed_ms })

    step = CASES[10]
    if (!await mirror<boolean>("video.pause(); return video.paused")) fail('second_pause_not_applied')
    await waitFor(async () => {
      const s = await snapshot()
      if (s.generation !== recovered.generation) fail('unexpected_second_reload')
      return s.mode === 'loop' && s.status === 'failed' && s.reason === 'operator_loop_playback_stalled'
    }, 12000)
    await waitFor(() => mirror(`return root?.dataset.state === 'black' && root.getAttribute('aria-label') === 'operator_loop_failed'
      && !video && !audio && !document.querySelector('.mirror-presentation');`))
    await waitFor(() => evaluate("return panel?.textContent.includes('Loop video failed. Mirror stays black.')"))
    // Observe a full watchdog interval: failed mode must never start a third load.
    const failedAt = performance.now()
    await waitFor(async () => {
      const s = await snapshot()
      if (s.generation !== recovered.generation || s.mode !== 'loop' || s.status !== 'failed') fail('failure_did_not_hold')
      return performance.now() - failedAt >= 8500
    }, 10000)
    await blackShot(); await shot('operator-loop-console-failed.png')
    pass({ reloads: 1, failure_hold_ms: Math.round(performance.now() - failedAt), nonblack_pixels: 0 })

    step = CASES[11]
    await operatorCommand('normal'); await returnedAvatar(); await persisted(separate, 'avatar')
    if (input.console.isVisible()) fail('start_kept_console_overlay')
    await waitFor(() => evaluate("return panel?.textContent.includes('Not playing') && !button('Play on Mirror').matches(':disabled')"))
    await shot('operator-loop-start-normal-avatar.png', true)
    pass({ normal_acknowledged: true, saved_avatar_unchanged: true })

    step = CASES[21]
    // Venue keys keep their behavior while the Console is on the main display: INTERACTIVE
    // STUDIO, PLAY LOOP and START hide it; Remote Console then shows the state they set.
    await remoteConsole()
    await operatorCommand('studio')
    if (input.console.isVisible()) fail('studio_kept_remote_console')
    if (JSON.parse(await modeFile()).mode !== 'studio') fail('studio_mode_not_saved')
    await returnedAvatar()
    await remoteConsole()
    await waitFor(() => evaluate(`return [...document.querySelectorAll('.studio-live__switch button[aria-pressed="true"]')]
      .map(b => b.textContent.trim()).join() === 'Interactive Studio'`))
    await shot('operator-remote-console-studio-mode.png', false, true)
    await operatorCommand('play_loop')
    if (input.console.isVisible()) fail('play_loop_kept_remote_console')
    await playing()
    await remoteConsole()
    await waitFor(() => evaluate("return !!panel?.textContent.includes('Loop video playing.') && !!button('Return to Avatar')"))
    // An earlier "Back to the avatar" result must not read as the current state.
    if (await evaluate<boolean>("return (document.querySelector('.live-bar__result')?.textContent ?? '').includes('Back to the avatar')")) {
      fail('stale_result_line')
    }
    const venueMotion = await sample()
    await shot('operator-remote-console-loop.png')
    await operatorCommand('normal')
    if (input.console.isVisible()) fail('start_kept_remote_console')
    await returnedAvatar(); await persisted(separate, 'avatar')
    if (JSON.parse(await modeFile()).mode !== 'conversation') fail('start_mode_not_conversation')
    pass({ studio_hid_console: true, studio_mode_shown: true, play_loop_hid_console: true,
      decoded_frames_beside: venueMotion.decoded_frames, start_hid_console: true, mode_after_start: 'conversation' })
    step = CASES[22]
    await remoteConsole()
    const savedVolume = await evaluate<string>("return control('Loop volume').value")
    await set('Loop volume', '0.23')
    const consoleId = input.console.webContents.id
    await operatorCommand('desktop')
    if (input.mirror.isVisible() || input.console.isVisible()) fail('desktop_windows_visible')
    await waitFor(() => mirror("return !document.querySelector('video,audio,.avatar-stage')"))
    if ((await snapshot()).mode !== 'desktop') fail('desktop_not_selected')
    await operatorCommand('desktop')
    // Desktop intentionally hides the Mirror, so the avatar-beside-Console
    // helper's visible-Mirror assertion does not apply to this route.
    await operatorCommand('show_console_main')
    if (!input.console.isVisible() || screen.getDisplayMatching(input.console.getBounds()).id === screen.getDisplayMatching(input.mirror.getBounds()).id) fail('desktop_remote_wrong_display')
    if (input.mirror.isVisible() || input.console.webContents.id !== consoleId) fail('desktop_remote_replaced_windows')
    await waitFor(() => evaluate("return control('Loop volume')?.value === '0.23' && document.querySelector('.runtime-status')?.textContent.includes('macOS desktop')"))
    await shot('operator-desktop-remote-console.png', false, true)
    await operatorCommand('show_console')
    if (!input.mirror.isVisible() || !input.console.isVisible()) fail('desktop_console_not_restored')
    if (await evaluate<string>("return control('Loop volume').value") !== '0.23') fail('desktop_lost_draft')
    await set('Loop volume', savedVolume)
    pass({ windows_hidden: true, media_released: true, repeated_desktop: true, unsaved_draft_preserved: true, console_renderer_preserved: true })

    step = CASES[23]
    for (const action of ['normal', 'studio', 'play_loop', 'show_console'] as const) {
      await operatorCommand('desktop')
      if (input.mirror.isVisible() || input.console.isVisible()) fail('desktop_return_start_visible')
      await operatorCommand(action)
      if (!input.mirror.isVisible()) fail('desktop_return_mirror_hidden')
      if (action === 'play_loop') await playing()
      else await returnedAvatar()
      if (input.console.isVisible() !== (action === 'show_console')) fail('desktop_return_console_wrong')
      if (action === 'studio' && JSON.parse(await modeFile()).mode !== 'studio') fail('desktop_return_studio_wrong')
      if (action === 'normal' && JSON.parse(await modeFile()).mode !== 'conversation') fail('desktop_return_conversation_wrong')
    }
    await operatorCommand('normal')
    pass({ normal: true, studio: true, play_loop: true, show_console: true })
    step = CASES[24]
    await operatorCommand('music_loop')
    const musicGeneration = (await snapshot()).generation
    if ((await snapshot()).status !== 'playing') fail('music_not_playing')
    await operatorCommand('music_loop')
    if ((await snapshot()).generation !== musicGeneration) fail('music_duplicate_restarted')
    await waitFor(() => mirror("return !document.querySelector('video,audio,.avatar-stage')"))
    await operatorCommand('show_console')
    await waitFor(() => evaluate("return document.querySelector('.live-bar')?.textContent.includes('MusicLoop · playing on all outputs')"))
    await new Promise(resolve => setTimeout(resolve, 5500))
    if ((await snapshot()).status !== 'playing') fail('music_repeat_failed')
    await shot('operator-music-loop-console.png', false, true)
    pass({ native_playback_acknowledged: true, repeated_press: true, black_mirror: true, console_preserves_playback: true })

    step = CASES[25]
    for (const action of ['normal', 'studio', 'play_loop', 'desktop'] as const) {
      await operatorCommand('music_loop')
      await operatorCommand(action)
      if ((await snapshot()).mode === 'music') fail('music_not_released')
      if (action === 'play_loop') await playing()
    }
    await operatorCommand('music_loop'); await operatorCommand('show_console')
    await click('Return to Avatar'); await returnedAvatar()
    pass({ normal: true, studio: true, video_loop: true, desktop: true, console_return: true })

    step = CASES[26]
    const musicDirectory = join(userData, 'operator-loop-shared', 'MusicLoop'), moved = musicDirectory + '-saved'
    await rename(musicDirectory, moved); await mkdir(musicDirectory)
    try {
      const reply = await sendQaOperatorCommand(userData, 'music_loop')
      if (reply !== 'failed' || (await snapshot()).reason !== 'operator_loop_music_empty') fail('music_empty_not_reported')
      await operatorCommand('show_console')
      await waitFor(() => evaluate("return document.querySelector('.live-bar')?.textContent.includes('MusicLoop is empty.')"))
      await shot('operator-music-loop-empty.png', false, true)
    } finally { await rm(musicDirectory, { recursive: true }); await rename(moved, musicDirectory) }
    await operatorCommand('music_loop')
    if ((await snapshot()).status !== 'playing') fail('music_empty_retry_failed')
    // Finish while native music is playing: the runner's ordinary Main shutdown
    // must release it. The outer check verifies that no music worker remains.
    pass({ empty_visible: true, retry_after_files_added: true, shutdown_with_music_active: true })
    if (passed.size !== CASES.length || !CASES.every(name => passed.has(name))) fail('cases_incomplete')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, visualCount: 3,
      screenshotCount: screenshots, musicAnalyser: 'not_executed', consoleCheckCount: passed.size }
  } catch (error) {
    const reason = error instanceof Error && /^phase4_qa_[a-z_]+$/.test(error.message)
      ? error.message : 'phase4_qa_operator_loop_failed'
    const state = await snapshot().then(s => ({ mode: s.mode, status: s.status, generation: s.generation,
      reason: /^operator_loop_[a-z0-9_]+$/.test(s.reason) ? s.reason : 'operator_loop_unknown' })).catch(() => null)
    input.onEvidence({ step, status: 'failed', item: JSON.stringify({ reason, state, completed_cases: passed.size }) })
    await shot('operator-loop-console-failure.png').catch(() => undefined)
    throw Error(reason)
  } finally {
    await mirror('window.__operatorLoopQa?.unsubscribe?.(); delete window.__operatorLoopQa;').catch(() => {
      input.onEvidence({ step: 'operator_loop_probe_cleanup', status: 'degraded', item: 'operator_loop_probe_cleanup_failed' })
    })
  }
}
