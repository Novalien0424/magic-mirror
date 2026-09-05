import { dialog } from 'electron'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

// This driver runs only in the isolated Phase 4 QA process. It substitutes the
// native file-picker selection; import, Chromium decode, edits, and publication
// still use the real Console controls and production bridge.
const DOM = `
  const panel = document.querySelector('.console__scenes');
  const fieldset = name => [...panel.querySelectorAll('fieldset')]
    .find(el => el.querySelector('legend')?.textContent === name);
  const button = (name, root = panel) => [...root.querySelectorAll('button')]
    .find(el => (el.getAttribute('aria-label') || el.textContent.trim()) === name);
  const control = (name, root = panel) => [...root.querySelectorAll('label')]
    .find(el => [...el.childNodes].filter(n => n.nodeType === 3 || n.nodeName === 'SPAN')
      .map(n => n.textContent).join('').trim() === name)?.querySelector('input,select,textarea');
  const action = () => panel.querySelector('.scene-action-editor');
  const scene = () => panel.querySelector('.scene-composer__body');
  const stage = () => scene().querySelector('.console__stage-card');
  const status = () => panel.querySelector('[aria-live]').textContent;
  const click = el => {
    if (!el || el.disabled) throw new Error('phase4_qa_console_control_unavailable');
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS' && !parent.open) parent.querySelector('summary').click();
    }
    el.scrollIntoView({block: 'center'}); el.click();
  };
  const set = (el, value) => {
    if (!el) throw new Error('phase4_qa_console_field_missing');
    el.scrollIntoView({block: 'center'});
    const prototype = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  };
`

export async function runPhase4ConsoleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let checkCount = 0
  let screenshotCount = 0
  let step = 'console_ready'
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(
    `(async () => { ${DOM} ${source} })()`, true,
  ) as Promise<T>
  const wait = async (source: string, reason = step, timeoutMs = 15_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(source)) return
      await new Promise(resolveWait => setTimeout(resolveWait, 50))
    }
    throw new Error(`phase4_qa_${reason}`)
  }
  const edit = async (source: string): Promise<void> => {
    await evaluate(source)
    // Let React commit before the next distinct user interaction.
    await new Promise(resolveWait => setTimeout(resolveWait, 50))
  }
  const passed = (): void => {
    checkCount += 1
    input.onEvidence({ step, status: 'passed' })
  }
  const screenshot = async (name: string, mirror = false): Promise<void> => {
    const evidence = await capture(mirror ? input.mirror : input.console, input.outputDir, name)
    screenshotCount += 1
    input.onEvidence({ step, status: 'captured', file: name, sha256: evidence.sha256,
      nonblack_pixels: evidence.nonblackPixels })
  }
  const save = async (): Promise<void> => {
    await edit("click(button('Save Draft'))")
    await wait("return status() === 'Draft saved.' || status() === 'Operation completed.'")
    await wait("return !button('Save Draft').disabled && !button('Test Draft').disabled")
  }
  const testAndPublish = async (): Promise<void> => {
    await edit("click(button('Test Draft'))")
    await wait("return !button('Publish').disabled")
    await edit("click(button('Publish'))")
    await wait("return !button('Save Draft').disabled && button('Publish').disabled")
  }
  const picker = dialog.showOpenDialog
  let selection: string | string[] | null = null
  dialog.showOpenDialog = (async () => ({ canceled: selection === null,
    filePaths: selection === null ? [] : Array.isArray(selection) ? selection : [selection] })) as typeof dialog.showOpenDialog
  try {
    await wait("return !!button('Scenes', document)")
    await edit("click(button('Scenes', document))")
    await wait("return !!panel && !button('Add scene').disabled")
    await edit("click(button('Media library'))")

    step = 'console_import_cancel'
    await edit("click(button('Browse & upload media…'))")
    await wait("return status() === 'Media import cancelled.'")
    passed()

    step = 'console_invalid_import'
    selection = join(resolve(input.outputDir, '..'), 'invalid.webm')
    await writeFile(selection, 'synthetic invalid media')
    await edit("click(button('Browse & upload media…'))")
    await wait("return status().includes('1 failed')")
    const pending = await readdir(join(resolve(input.outputDir, '..'), 'user-data', 'assets', 'visual', '.pending'))
    if (pending.length !== 0) throw new Error('phase4_qa_console_pending_leak')
    await wait("return fieldset('Managed visuals').querySelectorAll('li').length === 0")
    passed()

    step = 'console_import_finite'
    selection = join(process.cwd(), 'resources', 'phase4-trial-assets', 'phase4-finite-silent.webm')
    await edit("click(button('Browse & upload media…'))")
    await wait("return fieldset('Managed visuals').querySelectorAll('li').length === 1")
    await wait("return fieldset('Managed visuals').textContent.includes('360×640')")
    await wait("return fieldset('Managed visuals').querySelector('video').readyState >= 2")
    await wait(`const url = fieldset('Managed visuals').querySelector('video').src;
      const r = await fetch(url, { headers: { Range: 'bytes=0-15' } });
      return r.status === 206 && (await r.arrayBuffer()).byteLength === 16;`, 'media_byte_range', 1000)
    passed()

    step = 'console_unpublished_presentation_preview'
    await edit("click(button('Avatar presentation'))")
    await edit("const el = control('Background image / looping video'); set(el, el.options[1].value)")
    await edit("const el = control('Sleep ambience (loops)'); set(el, el.options[1].value)")
    const previewStarted = Date.now()
    await edit("click(button('Preview exit'))")
    await wait(`const p = panel.querySelector('.presentation'); const v = p.querySelector('video'); const a = p.querySelector('audio');
      return p.dataset.backgroundReady === 'true' && v && !v.paused && v.currentTime > 0 && a && !a.paused && a.currentTime > 0;`, 'unpublished_preview_media_playback', 6000)
    input.onEvidence({ step: 'draft_media_startup_ms', item: String(Date.now() - previewStarted), status: 'measured' })
    const canvasSize = await evaluate<string>(`const c=panel.querySelector('.presentation canvas'); return c.width+'x'+c.height+'_expected_'+Math.round(parseFloat(c.style.width)*devicePixelRatio)+'x'+Math.round(parseFloat(c.style.height)*devicePixelRatio);`)
    input.onEvidence({ step: 'draft_avatar_canvas_size', item: canvasSize, status: 'measured' })
    const [actualSize, expectedSize] = canvasSize.split('_expected_')
    if (actualSize !== expectedSize) throw new Error('phase4_qa_preview_canvas_size_stale')
    const playback = await evaluate<{ advanced: boolean; frames: number; dropped: number }>(`
      const v=panel.querySelector('.presentation video'); const before=v.getVideoPlaybackQuality();
      await new Promise(r=>setTimeout(r,1200)); const after=v.getVideoPlaybackQuality();
      return {advanced: !v.paused && !panel.querySelector('.presentation audio').paused,
        frames:after.totalVideoFrames-before.totalVideoFrames, dropped:after.droppedVideoFrames-before.droppedVideoFrames};`)
    input.onEvidence({ step: 'draft_video_frames', item: `${playback.frames}_decoded_${playback.dropped}_dropped`, status: 'measured' })
    if (!playback.advanced || playback.frames < 10 || playback.dropped > playback.frames * 0.1) throw new Error('phase4_qa_preview_playback_stalled')
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok && r.value.active.visualAssets.length === 0;`)
    await edit("click(button('Spell scenes'))")
    passed()

    step = 'console_author_finite'
    await edit("click(button('Spell scenes'))")
    await edit("click(button('Add scene'))")
    await edit("set(control('Scene name', scene()), 'Magic Vision')")
    await edit("set(control('Exact phrase', scene()), 'Mirror show the vision')")
    await edit("set(control('Step name', stage()), 'Vision')")
    await edit("click(button('+ Image / video'))")
    await edit("click(button('Browse & upload image / video…'))")
    await wait("return status().includes('Selected in this action.') && control('Asset', action()).value !== ''")
    await edit("set(control('Name', action()), 'Magic Vision visual')")
    await edit("set(control('Ends when', stage()), 'video_complete')")
    await wait("return control('Step name', stage()).value === 'Vision' && control('Completion video', stage()).value !== ''")
    await save()
    await wait(`const r = await window.magicMirror.getConfig();
      return r.ok && r.value.active.scenes.length === 0 && r.value.draft.scenes[0]?.name === 'Magic Vision'
        && r.value.draft.scenes[0].stages[0].name === 'Vision'
        && r.value.draft.scenes[0].stages[0].endCondition.kind === 'video_complete'
        && r.value.draft.sceneActions[0].fit === 'cover';`)
    passed()

    step = 'console_publish_finite'
    await testAndPublish()
    await wait(`const r = await window.magicMirror.getConfig();
      return r.ok && r.value.active.scenes[0]?.name === 'Magic Vision';`)
    await screenshot('console-magic-vision.png')
    passed()

    step = 'console_run_finite'
    if (!input.editorOnly) {
      await edit("click(button('Run Published Scene', scene()))")
      const mirrorWait = async (source: string): Promise<void> => {
        const deadline = Date.now() + 10_000
        while (Date.now() < deadline) {
          if (await input.mirror.webContents.executeJavaScript(source)) return
          await new Promise(resolveWait => setTimeout(resolveWait, 50))
        }
        throw new Error(`phase4_qa_${step}`)
      }
      await mirrorWait("!!document.querySelector('.scene-visual video') && !document.querySelector('.scene-visual').hidden")
      await screenshot('console-finite-active.png', true)
      await wait("return status().includes(': completed.')")
      await mirrorWait("!document.querySelector('.scene-visual video')")
      await screenshot('console-finite-return.png', true)
      passed()
    } else input.onEvidence({ step, status: 'not_executed' })

    step = 'console_invalid_draft_preserved'
    await edit("set(control('Scene name', scene()), 'Unsaved correction')")
    await edit("click(control('Magic Vision visual', stage()))")
    await edit("click(button('Save Draft'))")
    await wait("return status().includes('console_config_invalid')")
    await wait("return control('Scene name', scene()).value === 'Unsaved correction' && !control('Magic Vision visual', stage()).checked")
    await wait(`const r = await window.magicMirror.getConfig();
      return r.ok && r.value.active.scenes[0]?.name === 'Magic Vision' && r.value.draft.scenes[0]?.name === 'Magic Vision';`)
    await screenshot('console-invalid-draft.png')
    passed()
    await edit("click(control('Magic Vision visual', stage()))")
    await edit("set(control('Completion video', stage()), control('Completion video', stage()).options[1].value)")
    await edit("set(control('Scene name', scene()), 'Magic Vision')")

    step = 'console_unsaved_publish_blocked'
    await save()
    await edit("click(button('Test Draft'))")
    await wait("return !button('Publish').disabled")
    await edit("set(control('Scene name', scene()), 'Unpublished title')")
    await wait("return button('Publish').disabled && button('Test Draft').disabled")
    await edit("click(button('Stop All'))")
    await wait("return control('Scene name', scene()).value === 'Unpublished title'")
    await edit("set(control('Scene name', scene()), 'Magic Vision')")
    passed()

    step = 'console_incompatible_end_condition'
    await edit("set(control('Playback', action()), 'loop')")
    await edit("click(button('Save Draft'))")
    await wait("return status().includes('console_config_invalid') && control('Playback', action()).value === 'loop'")
    await edit("set(control('Ends when', stage()), 'until_stopped')")
    await edit("set(control('Maximum seconds', stage()), '5')")
    await save()
    passed()

    step = 'console_duplicate_isolation'
    await edit("click(button('Duplicate step'))")
    await edit("set(control('Name', action()), 'Independent copy')")
    await edit("set(control('Ends when', stage()), 'duration')")
    await edit("click(button('Move earlier'))")
    await save()
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok
      && r.value.draft.scenes[0].stages.length === 2
      && r.value.draft.scenes[0].stages[0].actionIds[0] !== r.value.draft.scenes[0].stages[1].actionIds[0]
      && r.value.draft.sceneActions[0].name === 'Magic Vision visual';`)
    passed()

    step = 'console_stage_reorder_and_delete'
    await edit("click(button('Move later'))")
    await edit("click(button('Save Draft'))")
    await wait("return status().includes('console_config_invalid')")
    await edit("click(button('Remove step'))")
    await edit("click(button('Undo removal'))")
    await wait("return scene().querySelectorAll('.scene-steps > button').length === 3")
    await edit("click(button('Remove step'))")
    await save()
    passed()

    step = 'console_spell_edit_and_collision'
    const spellRoot = "panel.querySelector('.scene-spell')"
    await edit(`set(control('Spell name', ${spellRoot}), 'Vision spell')`)
    await edit(`set(control('Exact phrase', ${spellRoot}), 'Mirror show the vision')`)
    await edit(`set(control('Cooldown seconds', ${spellRoot}), '1.2')`)
    await save()
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok
      && r.value.draft.spells[0].phrase === 'Mirror show the vision' && r.value.draft.spells[0].cooldownMs === 1200;`)
    await edit("click(button('Add spell'))")
    await edit("set(control('Exact phrase', panel.querySelectorAll('.scene-spell')[1]), 'Mirror show the vision!')")
    await edit("click(button('Save Draft'))")
    await wait("return status().includes('console_config_invalid') && panel.querySelectorAll('.scene-spell').length === 2")
    await edit("click(button('Remove spell', panel.querySelectorAll('.scene-spell')[1]))")
    passed()

    step = 'console_enabled_controls'
    await edit(`click(control('Spell enabled', ${spellRoot}))`)
    await edit("click(control('Enabled', scene()))")
    await edit("click(control('Enabled', action()))")
    await save()
    await testAndPublish()
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok
      && !r.value.active.scenes[0].enabled && !r.value.active.sceneActions[0].enabled && !r.value.active.spells[0].enabled
      && button('Run Published Scene', scene()).disabled;`)
    await edit("click(control('Enabled', action()))")
    await edit("click(control('Enabled', scene()))")
    await edit(`click(control('Spell enabled', ${spellRoot}))`)
    await save()
    await testAndPublish()
    passed()

    step = 'console_asset_changed_before_publish'
    await edit("click(button('Test Draft'))")
    await wait("return !button('Publish').disabled")
    const config = await input.runtime.console.getConfig()
    if (!config.ok || !config.value.draft.visualAssets[0]) throw new Error('phase4_qa_console_asset_missing')
    const asset = config.value.draft.visualAssets[0]
    const assetPath = join(resolve(input.outputDir, '..'), 'user-data', 'assets', 'visual', asset.fileName)
    const original = await readFile(assetPath)
    const activeVersion = config.value.active.configVersion
    try {
      await writeFile(assetPath, 'synthetic corrupt managed media')
      await edit("click(button('Publish'))")
      await wait("return status().includes('console_config_test_failed')")
      await wait(`const r = await window.magicMirror.getConfig(); return r.ok && r.value.active.configVersion === ${activeVersion};`)
      await edit("click(button('Test Draft'))")
      await wait("return (status().includes('Draft media test failed') || status().includes('Draft test failed')) && button('Publish').disabled")
    } finally {
      await writeFile(assetPath, original)
    }
    await testAndPublish()
    passed()

    step = 'console_presentation_preview'
    const beforePreview = input.runtime.snapshot().lifecycle
    await edit("click(button('Avatar presentation'))")
    await edit("set(control('Visibility mode'), 'emerge')")
    await edit("const el = control('Background image / looping video'); set(el, el.options[1].value)")
    await edit("const el = control('Sleep ambience (loops)'); set(el, el.options[1].value)")
    await edit("set(control('Entrance seconds'), '0.8')")
    await edit("set(control('Exit seconds'), '0.9')")
    await edit("click(button('Preview full cycle'))")
    await wait("return panel.querySelector('.presentation').dataset.phase === 'awake'")
    await screenshot('console-presentation-awake.png')
    await wait("return panel.querySelector('.presentation').dataset.phase === 'asleep'")
    if (input.runtime.snapshot().lifecycle !== beforePreview) throw new Error('phase4_qa_preview_changed_lifecycle')
    await screenshot('console-presentation-asleep.png')
    await save()
    await testAndPublish()
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok
      && r.value.active.presentation.mode === 'emerge' && r.value.active.presentation.exitMs === 900;`)
    passed()

    if (!input.editorOnly) {
      step = 'presentation_simulated_lifecycle_cycle'
      const mirrorWait = async (phase: string) => {
        const deadline = Date.now() + 10000
        while (Date.now() < deadline) {
          if (await input.mirror.webContents.executeJavaScript(
            `document.querySelector('.presentation')?.dataset.phase === ${JSON.stringify(phase)}`)) return
          await new Promise(resolveWait => setTimeout(resolveWait, 50))
        }
        throw new Error('phase4_qa_presentation_phase_' + phase)
      }
      await mirrorWait('asleep')
      await screenshot('presentation-dormant.png', true)
      const loop = await input.mirror.webContents.executeJavaScript(
        "(()=>{const v=document.querySelector('.presentation video'); return !!v && v.loop && !v.paused && v.muted})()")
      if (!loop) throw new Error('phase4_qa_presentation_loop_missing')
      const sound = await input.mirror.webContents.executeJavaScript(
        "(()=>{const a=document.querySelector('[data-presentation-ambience]'); return !!a && a.loop && !a.paused && a.volume > 0})()")
      if (!sound) throw new Error('phase4_qa_presentation_ambience_missing')
      await input.runtime.handleSimulator({ type: 'wake' })
      await mirrorWait('entering')
      await screenshot('presentation-entering.png', true)
      await mirrorWait('awake')
      await wait("return document.querySelector('.console__status').textContent === 'active' && !button('Disconnect', document).disabled", 'overview_live_active')
      await new Promise(resolveWait => setTimeout(resolveWait, 550))
      const quiet = await input.mirror.webContents.executeJavaScript(
        "(()=>{const a=document.querySelector('[data-presentation-ambience]'); return !!a && a.paused && a.volume === 0})()")
      if (!quiet) throw new Error('phase4_qa_presentation_ambience_not_paused')
      const visible = await input.mirror.webContents.executeJavaScript(
        "(()=>{const p=document.querySelector('.presentation'); return p.querySelector('video').paused && getComputedStyle(p.querySelector('.presentation__avatar')).opacity === '1'})()")
      if (!visible) throw new Error('phase4_qa_presentation_avatar_not_visible')
      await screenshot('presentation-awake.png', true)
      await input.runtime.handleSimulator({ type: 'sleep' })
      await mirrorWait('exiting')
      await screenshot('presentation-exiting.png', true)
      await mirrorWait('asleep')
      await wait("return document.querySelector('.console__status').textContent === 'dormant' && !button('Start Conversation', document).disabled", 'overview_live_dormant')
      await screenshot('presentation-return.png', true)
      passed()
    }

    step = 'console_delete_referenced_action'
    await edit("click(button('Action library'))")
    await wait("return button('Delete unused action').disabled")
    passed()
    await edit("click(button('Spell scenes'))")

    step = 'console_delete_scene_and_spell'
    await edit("click(button('Remove scene and its spells'))")
    await save()
    await testAndPublish()
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok
      && r.value.active.scenes.length === 0 && r.value.active.spells.length === 0
      && r.value.active.visualAssets.length === 1;`)
    await screenshot('console-editor-complete.png')
    passed()

    step = 'console_config_rejected_edit'
    await edit("click(button('Config', document))")
    const configRoot = "document.querySelector('[aria-labelledby=console-config]')"
    await wait(`return !!control('idleSeconds', ${configRoot}) && !control('idleSeconds', ${configRoot}).disabled`)
    await edit(`set(control('idleSeconds', ${configRoot}), '0')`)
    await edit(`click(button('Save Draft', ${configRoot}))`)
    await wait(`return ${configRoot}.textContent.includes('console_config_invalid') && control('idleSeconds', ${configRoot}).value === '0'`)
    await screenshot('console-config-invalid.png')
    await edit(`set(control('idleSeconds', ${configRoot}), '300')`)
    passed()

    step = 'console_mixed_batch_and_previews'
    await edit("click(button('Scenes', document))")
    await edit("click(button('Media library'))")
    selection = [join(process.cwd(), 'resources', 'phase4-trial-assets', 'phase4-still.png'),
      join(resolve(input.outputDir, '..'), 'user-data', 'assets', 'music', 'phase4-qa-tone.wav'),
      join(resolve(input.outputDir, '..'), 'invalid.webm')]
    await edit("click(button('Browse & upload media…'))")
    await wait("return status().includes('Imported 2 file(s)') && status().includes('1 failed')")
    await wait("const img = fieldset('Managed visuals').querySelector('img'); return img?.complete && img.naturalWidth > 0")
    await wait("return fieldset('Managed visuals').querySelectorAll('li').length === 2 && fieldset('Managed music').querySelectorAll('li').length === 2")
    await screenshot('console-media-batch.png')
    await edit("click([...fieldset('Managed music').querySelectorAll('button')].at(-1))")
    await wait("const audio = panel.querySelector('[data-library-audio]'); return audio && !audio.paused && audio.currentTime > 0")
    await edit("click(fieldset('Managed music').querySelector('button'))")
    await wait("const audio = panel.querySelector('[data-library-audio]'); return panel.querySelectorAll('[data-library-audio]').length === 1 && audio && !audio.paused && audio.currentTime > 0")
    await edit("click(button('Overview', document))")
    await wait("return !document.querySelector('[data-library-audio]')")
    await edit("click(button('Scenes', document))")
    await save()
    await testAndPublish()
    passed()

    step = 'console_avatar_dialogue'
    await edit("click(button('Avatar / Audio', document))")
    await wait("return !!control('Wake greeting') && !control('Wake greeting').disabled")
    await edit("set(control('Wake greeting'), 'Welcome to the mirror.')")
    await edit("set(control('Sleep farewell (verbatim)'), 'Rest now.')")
    await save()
    await testAndPublish()
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok
      && r.value.active.presentation.wakeGreeting === 'Welcome to the mirror.'
      && r.value.active.presentation.sleepFarewell === 'Rest now.'
      && r.value.active.visualAssets.length === 2 && r.value.active.musicAssets.length === 2;`)
    await screenshot('console-avatar-dialogue.png')
    passed()

    step = 'console_navigation'
    for (const tab of ['Overview', 'Avatar / Audio', 'Simulator', 'Events', 'Phase Tests', 'Models', 'Scenes']) {
      await edit(`click(button(${JSON.stringify(tab)}, document))`)
      await wait(`return [...document.querySelectorAll('h2')].some(el => el.textContent.includes(${JSON.stringify(tab === 'Models' ? 'Models' : tab)}))`)
    }
    passed()
    step = 'console_readability_responsive'
    const originalSize = input.console.getSize()
    try {
      for (const width of [1000, 1280]) {
        input.console.setSize(width, 900)
        await new Promise(resolveWait => setTimeout(resolveWait, 150))
        for (const page of ['Overview', 'Scenes', 'Avatar / Audio']) {
          await edit(`click(button(${JSON.stringify(page)}, document))`)
          const metrics = await evaluate<{ overflow: boolean; font: number; smallControls: number; smallText: number; lowContrast: number }>(`
            const visible = el => el.getBoundingClientRect().height > 0 && !el.closest('details:not([open]),.console__sr-only');
            const rgb = value => (value.match(/[0-9.]+/g) || []).map(Number);
            const luminance = c => c.slice(0,3).map(v => v/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
              .reduce((sum,v,i) => sum + v*[.2126,.7152,.0722][i], 0);
            const text = [...document.querySelectorAll('.console *')].filter(visible)
              .filter(el => !el.matches(':disabled') && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
            const contrast = el => {
              const fg = rgb(getComputedStyle(el).color); let bg = [16,20,24];
              for (let p = el; p; p = p.parentElement) {
                const c = rgb(getComputedStyle(p).backgroundColor);
                if (c.length === 3 || c[3] === 1) { bg = c; break; }
              }
              const a = luminance(fg), b = luminance(bg); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
            };
            return {overflow: document.documentElement.scrollWidth > innerWidth,
              font: parseFloat(getComputedStyle(document.documentElement).fontSize),
              smallText: text.filter(el => parseFloat(getComputedStyle(el).fontSize) < 15).length,
              lowContrast: text.filter(el => contrast(el) < 4.5).length,
              smallControls: [...document.querySelectorAll('button,select,input:not([type=checkbox])')]
                .filter(visible).filter(el => el.getBoundingClientRect().height < 43).length};`)
          if (metrics.overflow || metrics.font < 18 || metrics.smallControls > 0 || metrics.smallText > 0 || metrics.lowContrast > 0) throw new Error('phase4_qa_readability_' + width + '_' + page + '_' + JSON.stringify(metrics))
          await screenshot('console-' + page.replaceAll(/[^a-z]/gi, '-').toLowerCase() + '-' + width + '.png')
        }
      }
    } finally { input.console.setSize(originalSize[0], originalSize[1]) }
    passed()
    return { motionCount: 0, expressionCount: 0, sceneCount: input.editorOnly ? 0 : 1, visualCount: input.editorOnly ? 0 : 1,
      screenshotCount, musicAnalyser: 'not_executed', consoleCheckCount: checkCount }
  } catch (error) {
    input.onEvidence({ step, status: 'failed' })
    await screenshot('console-failure.png').catch(() => input.onEvidence({ step: 'console_failure_capture', status: 'failed' }))
    throw error
  } finally {
    dialog.showOpenDialog = picker
  }
}
