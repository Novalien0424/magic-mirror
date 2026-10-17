import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { screen } from 'electron'
import type { LoopVideoSettings, LoopVideoView, OperatorLoopSnapshot } from '../shared/operator-loop'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

const CASES = [
  'operator_loop_avatar_authored', 'operator_loop_settings_saved', 'operator_loop_settings_reloaded',
  'operator_loop_muted_preview', 'operator_loop_embedded_audio', 'operator_loop_duplicate_play',
  'operator_loop_avatar_return', 'operator_loop_separate_audio', 'operator_loop_independent_wraps',
  'operator_loop_single_reload', 'operator_loop_failed_black', 'operator_loop_start_normal_recovery',
  'operator_console_on_mirror', 'operator_console_preserves_loop_and_draft',
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
  const shot = async (name: string, onMirror = false): Promise<void> => {
    if (!onMirror) {
      input.console.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
      await edit("(panel ?? document.querySelector('.console__publish-bar'))?.scrollIntoView({block:'end'})")
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
  const operatorCommand = async (action: 'normal' | 'show_console'): Promise<void> => {
    // START's mode switch uses this same production mailbox. Stay inside this
    // process's isolated userData; never invoke the field launcher or TV control.
    const id = randomUUID(), directory = join(userData, 'operator-control')
    const request = join(directory, 'requests', `${id}.json`), temporary = `${request}.tmp`
    const response = join(directory, 'responses', `${id}.json`), issuedAt = Date.now()
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, id, action, issuedAt, expiresAt: issuedAt + 45000 }),
        { mode: 0o600, flag: 'wx' })
      await rename(temporary, request)
      await waitFor(async () => {
        let raw = ''
        try { raw = await readFile(response, 'utf8') }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; fail('normal_response_unreadable') }
        const reply = JSON.parse(raw)
        if (reply.version !== 1 || reply.id !== id || reply.status !== 'success'
          || reply.reason !== 'operator_control_complete') fail('normal_command_failed')
        return true
      })
    } finally {
      for (const path of [temporary, request, response]) {
        await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') fail('normal_cleanup_failed') })
      }
    }
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

    step = CASES[1]
    await click('Loop Video')
    await waitFor(() => evaluate(`const r = await bridge.mediaFolders({action:'get'});
      return r.ok && r.value.shared?.status === 'ready' && r.value.entries.length === 2
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

    step = CASES[6]
    await click('Return to Avatar'); await returnedAvatar(); await persisted(embedded, 'avatar')
    await shot('operator-loop-avatar-return.png', true); pass()

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
    await waitFor(() => evaluate("return panel?.textContent.includes('Avatar mode') && !button('Play on Mirror').matches(':disabled')"))
    await shot('operator-loop-start-normal-avatar.png', true)
    pass({ normal_acknowledged: true, saved_avatar_unchanged: true })
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
