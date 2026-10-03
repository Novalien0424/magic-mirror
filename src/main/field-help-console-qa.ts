import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

/** Isolated Console QA: no provider calls, microphone capture or publication. */
export async function runFieldHelpConsoleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let checks = 0, screenshots = 0
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async () => {
    const visible = el => !!el && el.getClientRects().length > 0;
    const button = name => [...document.querySelectorAll('button')].find(el => visible(el) && el.textContent.trim() === name);
    const help = name => [...document.querySelectorAll('.field-help__trigger')].find(el => visible(el) && el.getAttribute('aria-label').startsWith('Help: ' + name));
    const tooltip = () => [...document.querySelectorAll('.field-help__tooltip')].find(visible);
    const control = name => [...document.querySelectorAll('label')].find(el => visible(el) && el.textContent.trim().startsWith(name))?.querySelector('input, select, textarea');
    const set = (el, value) => { if (!el) throw Error('field_help_control_missing');
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
    ${source}
  })()`, true) as Promise<T>
  const wait = async (source: string, reason: string): Promise<void> => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) { if (await evaluate<boolean>(source)) return; await pause(60) }
    throw Error(`field_help_qa_${reason}`)
  }
  const edit = async (source: string): Promise<void> => { await evaluate(source); await pause(80) }
  const click = async (name: string): Promise<void> => {
    await wait(`return !!button(${JSON.stringify(name)}) && !button(${JSON.stringify(name)}).disabled`, 'button_ready')
    await edit(`button(${JSON.stringify(name)}).click()`)
  }
  const pass = (step: string): void => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const shot = async (file: string): Promise<void> => {
    const result = await capture(input.console, input.outputDir, file); screenshots++
    input.onEvidence({ step: 'field_help_screenshot', status: 'captured', file, sha256: result.sha256 })
  }
  const assert = async (source: string, reason: string): Promise<void> => {
    if (!await evaluate<boolean>(source)) throw Error(`field_help_qa_${reason}`)
  }
  const audit = async (page: string): Promise<void> => {
    await assert(`const controls = [...document.querySelectorAll('input, select, textarea')].filter(el => visible(el) || el.type === 'file' && visible(el.closest('.field-help')));
      return controls.length > 0 && controls.every(el => {
        const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        return ids.length > 0 && ids.every(id => (document.getElementById(id)?.textContent.trim().length || 0) > 40);
      }) && [...document.querySelectorAll('.field-help__trigger')].filter(visible).every(el => {
        const r = el.getBoundingClientRect(); return r.width >= 44 && r.height >= 44;
      }) && document.documentElement.scrollWidth <= innerWidth;`, `coverage_${page}`)
    pass(`field_help_coverage_${page}`)
  }
  const key = async (keyCode: string): Promise<void> => {
    input.console.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    input.console.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await pause(80)
  }
  const point = async (selector: string): Promise<{ x: number; y: number }> => evaluate(`const r=(${selector}).getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) };`)
  const move = async (p: { x: number; y: number }): Promise<void> => {
    input.console.webContents.sendInputEvent({ type: 'mouseMove', ...p }); await pause(40)
  }
  try {
    await click('System')
    await wait("return !!help('BGM')", 'devices_ready')
    await audit('devices')
    await edit("help('BGM').scrollIntoView({ block: 'center' }); document.activeElement?.blur()")
    const bgm = await point("help('BGM')")
    await move(bgm)
    await assert('return !tooltip()', 'hover_delay')
    await wait('return !!tooltip()', 'hover_open')
    await move(await point('tooltip()'))
    await pause(250)
    await assert('return !!tooltip()', 'hoverable_popup')
    await shot('field-help-hover.png')
    await move({ x: 4, y: 4 }); await pause(250)
    await assert('return !tooltip()', 'hover_leave')
    pass('field_help_hover_delay_and_popup')

    await wait("return !!control('BGM') && !control('BGM').disabled", 'volume_focus_ready')
    await edit("control('BGM').focus()")
    await assert("return document.activeElement === control('BGM')", 'volume_focused')
    await key('Tab')
    await assert("return !!tooltip() && document.activeElement === help('BGM')", 'tab_focus_open')
    await key('Escape')
    await assert("return !tooltip() && document.activeElement === help('BGM')", 'escape_keeps_focus')
    await key('Enter')
    await assert('return !!tooltip()', 'keyboard_pin')
    await key('Escape')
    await edit("help('BGM').blur()")
    await pause(250)
    await move(bgm)
    input.console.webContents.sendInputEvent({ type: 'mouseDown', ...bgm, button: 'left', clickCount: 1 })
    input.console.webContents.sendInputEvent({ type: 'mouseUp', ...bgm, button: 'left', clickCount: 1 })
    await move({ x: 4, y: 4 }); await pause(500)
    await assert('return !!tooltip()', 'click_pin')
    input.console.webContents.sendInputEvent({ type: 'mouseDown', x: 4, y: 4, button: 'left', clickCount: 1 })
    input.console.webContents.sendInputEvent({ type: 'mouseUp', x: 4, y: 4, button: 'left', clickCount: 1 })
    await pause(100)
    await assert('return !tooltip()', 'outside_dismiss')
    pass('field_help_keyboard_click_escape_outside')

    for (const page of ['Models', 'Advanced config', 'Events', 'Phase Tests']) {
      await click(page); await audit(page.replaceAll(' ', '_'))
    }
    await click('Avatars')
    for (const page of ['Persona', 'Appearance', 'Voice']) {
      await click(page)
      if (page === 'Voice') await edit("document.querySelector('.voice-studio details').open = true")
      await audit(page)
    }
    await click('Persona')
    // Exercise HTML disabled-fieldset semantics without changing any application data.
    await edit("document.querySelector('.avatar-character').disabled = true; help('Personality').scrollIntoView({block:'center'}); help('Personality').focus()")
    await assert("return !!tooltip() && document.activeElement === help('Personality') && control('Personality').matches(':disabled')", 'disabled_help')
    await key('Escape'); await key('Space')
    await assert('return !!tooltip()', 'disabled_keyboard_pin')
    await shot('field-help-disabled.png')
    await key('Escape')
    await edit("document.querySelector('.avatar-character').disabled = false")
    pass('field_help_disabled_fieldset')

    await click('Appearance')
    await edit("document.querySelector('details:has(.cubism-studio)').open = true")
    await wait("return !!document.querySelector('.cubism-studio__parameter input')", 'rig_parameters')
    await audit('dynamic_rig')
    await click('Rig library'); await click('Load preview')
    await wait("return !!document.querySelector('.cubism-studio__parameter input')", 'library_parameters')
    await pause(1500)
    await audit('rig_library')
    await edit("document.querySelector('.cubism-studio__parameter .field-help__trigger').scrollIntoView({block:'center'}); document.querySelector('.cubism-studio__parameter .field-help__trigger').focus()")
    await assert("return tooltip()?.textContent.includes('Range:') && tooltip()?.textContent.includes('neutral/default:')", 'rig_description')
    await shot('field-help-rig.png'); await key('Escape')

    await click('Spells & scenes'); await click('Add scene')
    await audit('scene')
    for (const kind of ['duration', 'until_stopped', 'video_complete']) {
      await edit(`set(control('Ends when'), '${kind}')`)
      await audit(`step_${kind}`)
    }
    await edit("set(control('Ends when'), 'duration')")
    await edit("help('Trigger Phrase').scrollIntoView({block:'center'}); help('Trigger Phrase').focus()")
    await shot('field-help-scene.png'); await key('Escape')
    for (const width of [1024, 768]) {
      await edit('document.activeElement?.blur()'); await pause(200)
      input.console.setSize(width, 768); await pause(200)
      await audit(`scene_${width}`)
      await edit("help('Cooldown').scrollIntoView({block:'center'}); help('Cooldown').focus()")
      await assert(`const r = tooltip()?.getBoundingClientRect(); return !!r && r.left >= 11 && r.top >= 11 && r.right <= innerWidth-11 && r.bottom <= innerHeight-11;`, 'viewport_bounds')
      await shot(`field-help-scene-${width}.png`); await key('Escape')
    }
    pass('field_help_viewport_bounds')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, visualCount: 0,
      screenshotCount: screenshots, musicAnalyser: 'not_executed', consoleCheckCount: checks }
  } catch (error) {
    input.onEvidence({ step: error instanceof Error && /^field_help_qa_[\w]+$/.test(error.message) ? error.message : 'field_help_qa_failed', status: 'failed' })
    await shot('field-help-failure.png').catch(() => undefined)
    throw error
  }
}
