import { BrowserWindow } from 'electron'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

/**
 * Operator journey for the Interactive Studio, through the real Console and
 * production IPC in synthetic userData: Mirror mode switch, story setup (questions,
 * image prompt lines and instructions with preview, name step, on-glass text,
 * failure line, offer), validation, save/check/publish, prompt inspector, Studio
 * service page and narrow layout. No provider calls and no test picture.
 */
export async function runStudioJourneyQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let checks = 0, screenshots = 0, step = 'journey_ready'
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async () => {
    const visible = el => !!el && el.getClientRects().length > 0 && !el.closest('[hidden]');
    const button = name => [...document.querySelectorAll('button')].find(el => visible(el) && (el.getAttribute('aria-label') || el.textContent.trim()) === name);
    const click = name => { const el = button(name); if (!el || el.disabled) throw Error('journey_control_' + name); el.click() };
    const byLabel = label => [...document.querySelectorAll('[aria-label]')].find(el => visible(el) && el.getAttribute('aria-label') === label);
    const set = (el, value) => { if (!el) throw Error('journey_field_missing');
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) };
    const check = (label, on) => { const el = [...document.querySelectorAll('label')].find(l => visible(l) && l.textContent.trim().startsWith(label))?.querySelector('input[type=checkbox]');
      if (!el) throw Error('journey_checkbox_' + label); if (el.checked !== on) el.click() };
    const open = text => { const s = [...document.querySelectorAll('summary')].find(el => visible(el) && el.textContent.trim().replace(/^\\d+/, '').startsWith(text));
      if (!s) throw Error('journey_summary_' + text); if (!s.parentElement.open) s.click() };
    const modeButton = name => [...document.querySelectorAll('.studio-live__switch button')].find(el => el.textContent.trim() === name);
    // The Avatars tab and the Mirror mode button share the label "Interactive Studio"; scope each.
    const section = name => [...document.querySelectorAll('nav[aria-label="Avatar settings"] button')].find(el => el.textContent.trim() === name);
    const status = () => document.querySelector('.console__publish-bar .console__scene-result')?.textContent ?? '';
    const studioSection = () => document.querySelector('.experiences-editor');
    ${source}
  })()`, true) as Promise<T>
  const wait = async (source: string, timeoutMs = 15000): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) { if (await evaluate<boolean>(source)) return; await pause(80) }
    throw Error(`studio_journey_qa_${step}`)
  }
  const edit = async (source: string): Promise<void> => { await evaluate(source); await pause(120) }
  const pass = (): void => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const shot = async (file: string, target?: string): Promise<void> => {
    input.console.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 })
    await evaluate(target ? `document.querySelector(${JSON.stringify(target)})?.scrollIntoView({ block: 'start' })` : 'window.scrollTo(0, 0)')
    await pause(200)
    const result = await capture(input.console, input.outputDir, file); screenshots++
    input.onEvidence({ step, status: 'captured', file, sha256: result.sha256 })
  }
  const studioStatus = () => evaluate<{ mirrorMode: string; auth: string }>("const r = await window.magicMirror.studio({ action: 'status' }); if (!r.ok) throw Error('journey_status'); return r.value.status")
  // Every visible control is described for assistive technology and the page never scrolls sideways.
  const audit = async (): Promise<void> => {
    const gaps = await evaluate<string>(`const controls = [...document.querySelectorAll('.experiences-editor input, .experiences-editor select, .experiences-editor textarea')].filter(visible);
      const undescribed = controls.filter(el => { const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        return !(ids.length && ids.every(id => (document.getElementById(id)?.textContent.trim().length || 0) > 40)) })
        .map(el => el.getAttribute('aria-label') || el.closest('label')?.firstChild?.textContent?.trim() || el.tagName);
      return [...undescribed.map(n => 'undescribed:' + n), document.documentElement.scrollWidth > innerWidth + 2 ? 'horizontal_overflow' : ''].filter(Boolean).join(',')`)
    if (gaps) { input.onEvidence({ step, status: 'failed', item: gaps.replace(/[^\w:,·-]/g, '_').slice(0, 300) }); throw Error(`studio_journey_qa_${step}_audit`) }
  }
  try {
    step = 'journey_mirror_overview'
    await wait("return !!button('Avatars') && !!document.querySelector('.studio-live__switch')")
    await wait("return modeButton('Conversation')?.getAttribute('aria-pressed') === 'true' && !modeButton('Conversation').disabled")
    await wait("const t = document.querySelector('.mirror-overview')?.textContent ?? ''; return t.includes('Interactive Studio · ChatGPT') && t.includes('INTERACTIVE STUDIO on the Stream Deck') && t.includes('「招喚渡鴉使者」') && /Signed in|Not signed in|refresh|unknown/i.test(t)")
    if (await evaluate<boolean>("return !!document.querySelector('.runtime-status__mode')")) throw Error('studio_journey_qa_mode_badge_in_conversation')
    await shot('journey-01-mirror-conversation.png'); pass()

    step = 'journey_avatar_skill_selection'
    await edit("click('Avatars')")
    await wait("return !!byLabel('Editing avatar') && !!section('Skills') && !button('Duplicate').disabled")
    const originalId = await evaluate<string>("return byLabel('Editing avatar').value")
    await edit("section('Skills').click()")
    await wait("return document.querySelector('[aria-label=\"Avatar skills\"] input')?.checked === true")
    await shot('journey-skills-enabled.png', '[aria-label="Avatar skills"]')
    await edit("click('Duplicate')")
    const copyId = await evaluate<string>("return byLabel('Editing avatar').value")
    await edit("section('Skills').click()")
    await edit("check('Image generation', false)")
    await wait("return document.querySelector('[aria-label=\"Avatar skills\"] input')?.checked === false")
    await edit(`set(byLabel('Editing avatar'), ${JSON.stringify(originalId)})`)
    await wait("return document.querySelector('[aria-label=\"Avatar skills\"] input')?.checked === true")
    await edit(`set(byLabel('Editing avatar'), ${JSON.stringify(copyId)})`)
    await wait("return document.querySelector('[aria-label=\"Avatar skills\"] input')?.checked === false")
    pass()

    step = 'journey_avatar_skill_save_reload_publish'
    await edit("click('Save all changes')")
    await wait("return status() === 'Saved and checked. Ready to publish.' && !button('Save all changes').disabled")
    await new Promise<void>(resolve => { input.console.webContents.once('did-finish-load', () => resolve()); input.console.webContents.reload() })
    await wait("return !!button('Avatars')")
    await edit("click('Avatars')")
    await wait("return !!byLabel('Editing avatar') && !button('Save all changes').disabled")
    await edit(`set(byLabel('Editing avatar'), ${JSON.stringify(copyId)})`)
    await edit("section('Skills').click()")
    await wait("return document.querySelector('[aria-label=\"Avatar skills\"] input')?.checked === false")
    await edit("click('Publish all changes')")
    await wait("return !!document.querySelector('[aria-label=\"Confirm publication\"]')")
    await shot('journey-skills-publish.png', '.profile-publish-confirmation')
    await edit("click('Confirm publish')")
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok && r.value.active.avatarCatalog.avatars.find(a => a.id === ${JSON.stringify(copyId)})?.skills?.imageGeneration === false
      && r.value.active.avatarCatalog.avatars.find(a => a.id === ${JSON.stringify(originalId)})?.skills?.imageGeneration === true && !button('Use on Mirror').disabled`)
    pass()

    step = 'journey_avatar_skill_inspector'
    await evaluate("document.querySelectorAll('.prompt-launcher button').forEach(b => { if (b.textContent === 'Tools & input ↗') b.click() })")
    let skillInspector: BrowserWindow | undefined
    for (let i = 0; i < 100 && !skillInspector; i++) {
      skillInspector = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.getTitle() === 'Magic Mirror Prompts · Tools & input')
      if (!skillInspector) await pause(100)
    }
    if (!skillInspector) throw Error('studio_journey_qa_skill_inspector_missing')
    let inspected = false
    for (let i = 0; i < 100 && !inspected; i++) {
      inspected = await skillInspector.webContents.executeJavaScript(`(() => { const titles = [...document.querySelectorAll('article h2')].map(e => e.textContent);
        return titles.some(t => t.startsWith('look_at_surroundings')) && !titles.some(t => /^(create_image|edit_image|dismiss_image|start_portrait_studio|studio_)/.test(t)) })()`)
      if (!inspected) await pause(100)
    }
    skillInspector.close()
    if (!inspected) throw Error('studio_journey_qa_skill_inspector_tools')
    pass()

    step = 'journey_avatar_skill_disabled_on_mirror'
    await edit("click('Use on Mirror')")
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok && r.value.active.avatarCatalog.activeAvatarId === ${JSON.stringify(copyId)}`)
    await wait("return modeButton('Interactive Studio').disabled && !modeButton('Conversation').disabled && modeButton('Conversation').getAttribute('aria-pressed') === 'true'")
    for (const command of [{ action: 'mode', mode: 'studio' }, { action: 'test' }]) {
      const code = await evaluate<string>(`const r = await window.magicMirror.studio(${JSON.stringify(command)}); return r.ok ? (r.value.action ?? r.value.test)?.code : 'ipc_failed'`)
      if (code !== 'studio_skill_disabled') throw Error('studio_journey_qa_disabled_skill_bypass')
    }
    if (input.runtime.getAvatarSkillsForRuntime().imageGeneration) throw Error('studio_journey_qa_disabled_main_assignment')
    await edit("section('Interactive Studio').click()")
    await wait("return document.body.textContent.includes('Enable it in Skills to use Interactive Studio') && !!studioSection()")
    await edit("section('Skills').click()")
    const [skillWidth, skillHeight] = input.console.getSize()
    input.console.setSize(1024, 768); await pause(300)
    await wait("return document.documentElement.scrollWidth <= innerWidth + 2")
    await shot('journey-skills-disabled-narrow.png', '[aria-label="Avatar skills"]')
    input.console.setSize(skillWidth!, skillHeight!)
    pass()

    step = 'journey_avatar_skill_restore_original'
    await edit(`set(byLabel('Editing avatar'), ${JSON.stringify(originalId)})`)
    await wait("return !button('Use on Mirror').disabled")
    await edit("click('Use on Mirror')")
    await wait(`const r = await window.magicMirror.getConfig(); return r.ok && r.value.active.avatarCatalog.activeAvatarId === ${JSON.stringify(originalId)}`)
    await wait("return document.querySelector('[aria-label=\"Avatar skills\"] input')?.checked === true && !modeButton('Interactive Studio').disabled")
    if (!input.runtime.getAvatarSkillsForRuntime().imageGeneration) throw Error('studio_journey_qa_original_skill_changed')
    await edit("click('Mirror')")
    pass()

    step = 'journey_mode_switch_dormant'
    await edit("modeButton('Interactive Studio').click()")
    await wait("return modeButton('Interactive Studio').getAttribute('aria-pressed') === 'true' && document.querySelector('.runtime-status__mode')?.textContent === 'Interactive Studio mode'")
    await wait("return (document.querySelector('.live-bar')?.closest('.console__top')?.textContent ?? document.body.textContent).includes('Mirror mode: Interactive Studio')")
    if ((await studioStatus()).mirrorMode !== 'studio') throw Error('studio_journey_qa_main_mode_not_studio')
    if (input.runtime.snapshot().lifecycle === 'active') throw Error('studio_journey_qa_switch_woke_mirror')
    // The real wake listener reloads with the studio phrase (compiled from the package tokens).
    if ((await input.runtime.getPublishedWakeConfigForRuntime()).phrase !== '招喚渡鴉使者') throw Error('studio_journey_qa_wake_phrase_not_studio')
    await wait("return (document.querySelector('.runtime-status')?.textContent ?? '').includes('Listening for 「招喚渡鴉使者」')", 30000)
    await shot('journey-02-mirror-studio-mode.png')
    await edit("modeButton('Conversation').click()")
    await wait("return modeButton('Conversation').getAttribute('aria-pressed') === 'true' && !document.querySelector('.runtime-status__mode')")
    if ((await studioStatus()).mirrorMode !== 'conversation') throw Error('studio_journey_qa_main_mode_not_conversation')
    await wait("return !(document.querySelector('.runtime-status')?.textContent ?? '').includes('招喚渡鴉使者')", 30000)
    pass()

    step = 'journey_studio_section'
    await edit("click('Avatars')")
    await wait("return !!section('Interactive Studio')")
    await edit("section('Interactive Studio').click()")
    await wait("const t = studioSection()?.textContent ?? ''; return t.includes('In Interactive Studio mode (control bar') && ['1 · Start', '2 · Character', '3 · Name and questions', '4 · Picture', '5 · Ending'].every(l => t.includes(l)) && !t.includes('Default mode after wake')")
    await wait("const box = [...document.querySelectorAll('label')].find(l => visible(l) && l.textContent.trim().startsWith('Ask for a name first'))?.querySelector('input'); return !!box && box.checked")
    await shot('journey-03-studio-section.png', '.experiences-editor'); pass()

    step = 'journey_name_list'
    await wait("return !!byLabel('Guest names, one per line') && !byLabel('Guest names, one per line').closest('details')")
    await edit("set(byLabel('Name matching'), 'only')")
    await wait("return studioSection().textContent.includes('needs at least one name')")
    await edit("check('Ask for a name first', false)")
    await wait("return document.querySelector('fieldset[aria-label=\"Name list\"]').disabled && !document.querySelector('.experiences-editor__status').textContent.includes('attention')")
    await edit("check('Ask for a name first', true)")
    await wait("return studioSection().textContent.includes('needs at least one name')")
    await edit("set(byLabel('Guest names, one per line'), '王曉明\\n林美玲\\nAmy Chen\\n')")
    await wait("return studioSection().textContent.includes('Guest names · 3 of 1,000') && !document.querySelector('.experiences-editor__status').textContent.includes('attention')")
    await edit("set(byLabel('Name matching'), 'off')")
    await wait("return studioSection().textContent.includes('Matching is off; saved names are kept for later.') && byLabel('Guest names, one per line').value.includes('Amy Chen')")
    await edit("set(byLabel('Name matching'), 'prefer')")
    await shot('journey-name-list.png', 'fieldset[aria-label="Name list"]'); pass()

    step = 'journey_start_character_ending'
    const field = (label: string) => `[...document.querySelectorAll('.experiences-editor label')].find(l => visible(l) && l.textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input, textarea')`
    await edit("click('Restore default script and questions')")
    step = 'journey_question_count_limits'
    for (let n = 5; n <= 8; n++) await edit("click('Add question')")
    await wait("return button('Add question').disabled && !!byLabel('Question 8 in Traditional Chinese') && !byLabel('Question 9 in Traditional Chinese')")
    await edit("click('Restore default script and questions')")
    await wait("return !button('Add question').disabled && !byLabel('Question 5 in Traditional Chinese')")
    pass()
    step = 'journey_start_character_ending'
    await wait(`return ${field('Studio start script')}.value.includes('歡迎來到Gate thirty-three.') && byLabel('Question 4 in Traditional Chinese').value.includes('生活裡多一點什麼')`)
    await edit("click('Add question')")
    await edit("set(byLabel('Question 5 in Traditional Chinese'), '測試第五題。[pause=1s]請說說看。')")
    await edit("set(byLabel('Question 5 in English'), 'Test question five. [pause=1s] Tell me more.')")
    await edit("click('Move question 5 up')")
    await wait("return byLabel('Question 4 in Traditional Chinese').value.startsWith('測試第五題')")
    await edit("click('Remove question 4')")
    await wait("return !byLabel('Question 5 in Traditional Chinese') && byLabel('Question 4 in Traditional Chinese').value.includes('生活裡多一點什麼')")
    for (let n = 4; n > 1; n--) await edit(`click('Remove question ${n}')`)
    await wait("return byLabel('Remove question 1').disabled && !byLabel('Question 2 in Traditional Chinese')")
    await edit("click('Restore default script and questions')")
    await edit(`set(${field('Studio start script')}, '歡迎。[pause=99s]我們開始。')`)
    await wait("return document.querySelector('.experiences-editor__status').textContent.includes('attention before saving')")
    await edit(`set(${field('Studio start script')}, '歡迎來到測試工作室。[pause=1s]我們開始吧。')`)
    await edit("set(byLabel('Name question in Traditional Chinese'), '準備好了嗎？[pause=1s]告訴我你的名字。')")
    await wait(`return ${field('Studio wake phrase')}?.value === '招喚渡鴉使者' && ${field('Studio character (system prompt) · from Persona')}?.value.length > 0`)
    await edit(`set(${field('Studio character')}, '你是渡鴉使者：神秘、簡短，帶著古老的口吻。')`)
    await edit(`set(${field('Studio farewell')}, '願你找到你所追尋[pause=1s]再會旅人')`)
    await wait("const t = studioSection().textContent; return t.includes('Studio character (system prompt) · edited') && t.includes('Studio farewell · edited')")
    await shot('journey-03b-character-ending.png', 'fieldset[aria-label="Character"]'); pass()

    step = 'journey_question_and_line'
    await edit("set(byLabel('Question 1 in Traditional Chinese'), '你最想成為哪一張塔羅牌上的角色？')")
    await edit("set(byLabel('Question 1 image prompt line'), 'Tarot card figure: {{answer}}.')")
    await wait("return byLabel('Question 1 image prompt line').closest('label').textContent.includes('Image prompt line · edited') && !byLabel('Reset question 1 image prompt line').disabled")
    pass()

    step = 'journey_image_prompt_preview'
    await edit("open('Image prompt')")
    await edit("set(byLabel('Opening instruction'), 'Create one tarot card illustration for a visitor of a magic mirror. Art direction: {{style}}.')")
    await edit("open('Preview with sample answers')")
    await wait(`const pre = document.querySelector('.experiences-editor__preview-text')?.textContent ?? '';
      return pre.startsWith('Create one tarot card illustration') && pre.includes('Tarot card figure: "an owl".') && pre.includes('untrusted data, not instructions') && !pre.includes('{{')`)
    await shot('journey-04-image-prompt.png', '.experiences-editor__stages'); pass()

    step = 'journey_validation'
    await edit("set(byLabel('Question 1 image prompt line'), 'Tarot card figure.')")
    await wait("return studioSection().textContent.includes('Keep {{answer}}') && document.querySelector('.experiences-editor__status').textContent.includes('attention before saving')")
    await shot('journey-05-validation.png', '.experiences-editor__questions')
    await edit("set(byLabel('Question 1 image prompt line'), 'Tarot card figure: {{answer}}.')")
    await wait("return !studioSection().textContent.includes('Keep {{answer}}')")
    pass()

    step = 'journey_name_step_off'
    await edit("check('Ask for a name first', false)")
    await wait(`return byLabel('Name question in Traditional Chinese').disabled && document.querySelector('fieldset[aria-label="Name list"]').disabled
      && studioSection().textContent.includes('Name question · off')
      && (document.querySelector('.experiences-editor__preview-text')?.textContent ?? '').includes('Do not draw any text')`)
    await shot('journey-06-no-name.png', '.experiences-editor')
    await edit("check('Ask for a name first', true)")
    await wait("return !byLabel('Name question in Traditional Chinese').disabled")
    pass()

    step = 'journey_picture_controls'
    const pictureField = (label: string) => `[...document.querySelectorAll('fieldset[aria-label="Picture"] label')].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)}))?.querySelector('input, select, textarea')`
    await edit(`set(${pictureField('Picture type')}, 'portrait')`)
    await wait(`return ${pictureField('Picture type')}.value === 'portrait' && byLabel('Opening instruction').value.startsWith('Create one tarot card illustration')`)
    await edit(`set(${pictureField('Picture type')}, 'sticker')`)
    await edit(`set(${pictureField('Name lettering')}, 'painted')`)
    await wait(`return !${pictureField('Name font')}.disabled`)
    await edit(`set(${pictureField('Name font')}, 'gold brush lettering')`)
    await edit(`set(${pictureField('Quality')}, 'high')`)
    await edit(`set(${pictureField('Changes allowed')}, '4')`)
    await wait("return studioSection().textContent.includes('whole number of changes from 0 to 3')")
    await edit(`set(${pictureField('Changes allowed')}, '2')`)
    await wait("return document.querySelector('.experiences-editor__preview-text').textContent.includes('gold brush lettering') && !document.querySelector('.experiences-editor__status').textContent.includes('attention')")
    pass()

    step = 'journey_text_and_failure_lines'
    await edit("open('More settings')")
    await edit("open('Text on the mirror')")
    await edit("set(byLabel('Question counter in Traditional Chinese'), '第 {{index}} 張牌')")
    await edit("open('Spoken failure lines')")
    await edit("set(byLabel('Any other failure in Traditional Chinese'), '牌陣散了，我們先聊聊吧。')")
    await wait("return studioSection().textContent.includes('1 of 10 edited.') && studioSection().textContent.includes('1 of 5 edited.')")
    pass()

    step = 'journey_offer_prompt'
    await edit("open('What the avatar says at each step')")
    await edit("open('Comment on an answer')")
    await edit("set(byLabel('Comment on an answer prompt'), '用一句話簡短回應。訪客回答：{{answer}}')")
    const rules = await evaluate<string>(`return ${field('Studio rules')}.value`)
    await edit(`set(${field('Studio rules')}, ${JSON.stringify('Keep the Studio journey in character.\n')} + ${JSON.stringify(rules)})`)
    await edit("click('Reset these prompts to default')")
    await wait(`return byLabel('Comment on an answer prompt').value.includes('60 Chinese characters') && ${field('Studio rules')}.value.startsWith('Keep the Studio journey')`)
    await edit("click('Reset rules to default')")
    await wait(`return ${field('Studio rules')}.value === ${JSON.stringify(rules)}`)
    await edit("set(byLabel('Comment on an answer prompt'), '用一句話簡短回應。訪客回答：{{answer}}')")
    await edit("open('Conversation mode: what the studio offers')")
    await edit("set(byLabel('Conversation mode: what the studio offers prompt'), 'a tarot reading with one card painted on the mirror, for example when they say 幫我抽一張牌 or read my cards')")
    await wait("return studioSection().textContent.includes('steps edited.')")
    await audit()
    await shot('journey-07-stage-prompts.png', '[aria-label="What the avatar says at each step"]'); pass()

    step = 'journey_inspector'
    // One window per tab; every expected text is checked in it (no reopening a closing window).
    for (const [tab, expected] of [['Session', ['Create one tarot card illustration', '你是渡鴉使者：神秘、簡短', '用一句話簡短回應。訪客回答："I explored a new city without my phone."']], ['Tools & input', ['a tarot reading with one card painted on the mirror']]] as const) {
      const title = `Magic Mirror Prompts · ${tab}`
      await evaluate(`document.querySelectorAll('.prompt-launcher button').forEach(b => { if (b.textContent === ${JSON.stringify(`${tab} ↗`)}) b.click() })`)
      const deadline = Date.now() + 10000
      let win: BrowserWindow | undefined
      while (Date.now() < deadline && !win) { win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.getTitle() === title); if (!win) await pause(100) }
      if (!win) throw Error('studio_journey_qa_inspector_window')
      const text = () => Promise.race([win!.webContents.executeJavaScript('document.body.textContent') as Promise<string>,
        new Promise<string>(resolve => setTimeout(() => resolve(''), 2000))])
      const end = Date.now() + 10000
      let found = false
      while (Date.now() < end && !found) { const body = await text(); found = expected.every(item => body.includes(item)); if (!found) await pause(150) }
      win.close()
      if (!found) throw Error(`studio_journey_qa_inspector_${tab === 'Session' ? 'studio_prompts' : 'offer'}_missing`)
    }
    pass()

    step = 'journey_save_publish'
    await edit("click('Save all changes')")
    await wait("return status() === 'Saved and checked. Ready to publish.' && !button('Publish all changes').disabled", 30000)
    await edit("click('Publish all changes')")
    await wait("return !!document.querySelector('[aria-label=\"Confirm publication\"]')")
    await shot('journey-08-publish-review.png', '.profile-publish-confirmation')
    await edit("click('Confirm publish')")
    await wait(`const r = await window.magicMirror.getConfig(); if (!r.ok) return false;
      const avatar = r.value.active.avatarCatalog.avatars.find(a => a.experience?.studio?.questions?.[0]?.imageLine === 'Tarot card figure: {{answer}}.');
      const s = avatar?.experience?.studio;
      return !!s && avatar.experience.guests.match === 'prefer' && avatar.experience.guests.names.join('|') === '王曉明|林美玲|Amy Chen'
        && s.imagePrompt?.frame?.startsWith('Create one tarot card illustration') && s.screenText?.questionLabel?.zh === '第 {{index}} 張牌'
        && s.prompts?.comment === '用一句話簡短回應。訪客回答：{{answer}}'
        && s.nameFont === 'gold brush lettering' && s.nameLettering === 'painted' && s.quality === 'high' && s.revisionsAllowed === 2 && s.pictureType === 'sticker'
        && s.failureLines?.default?.zh === '牌陣散了，我們先聊聊吧。' && s.prompts?.offer?.startsWith('a tarot reading') && s.askName !== false
        && s.character === '你是渡鴉使者：神秘、簡短，帶著古老的口吻。' && s.farewell === '願你找到你所追尋[pause=1s]再會旅人' && !('wakePhrase' in s)
        && s.startScript === '歡迎來到測試工作室。[pause=1s]我們開始吧。' && s.nameQuestion.zh === '準備好了嗎？[pause=1s]告訴我你的名字。'
        && s.questions[0].zh === '你最想成為哪一張塔羅牌上的角色？'`, 30000)
    pass()

    step = 'journey_reload_and_restore_defaults'
    await new Promise<void>(resolve => { input.console.webContents.once('did-finish-load', () => resolve()); input.console.webContents.reload() })
    await wait("return !!button('Avatars')")
    await edit("click('Avatars')")
    await edit("section('Interactive Studio').click()")
    await wait(`return ${field('Studio start script')}?.value === '歡迎來到測試工作室。[pause=1s]我們開始吧。' && byLabel('Question 1 in Traditional Chinese').value.includes('塔羅牌')`)
    await wait("return byLabel('Name matching').value === 'prefer' && byLabel('Guest names, one per line').value === '王曉明\\n林美玲\\nAmy Chen'")
    await edit("click('Restore default script and questions')")
    await wait("return byLabel('Guest names, one per line').value.includes('Amy Chen')")
    await edit("set(byLabel('Guest names, one per line'), '')")
    await wait(`return ${field('Studio start script')}.value.includes('捨棄你的肉身') && ${field('Studio farewell')}.value === '願你的靈魂順利穿越'
      && byLabel('Name question in Traditional Chinese').value === '準備好的話就告訴我你的名字' && byLabel('Question 4 in Traditional Chinese').value.includes('生活裡多一點什麼')`)
    await shot('journey-default-soul-script.png', '.experiences-editor')
    await edit("click('Save all changes')")
    await wait("return status() === 'Saved and checked. Ready to publish.' && !button('Publish all changes').disabled")
    await edit("click('Publish all changes')")
    await wait("return !!document.querySelector('[aria-label=\"Confirm publication\"]')")
    await edit("click('Confirm publish')")
    await wait("return document.querySelector('.console__publish-bar').textContent.includes('Up to date')")
    pass()

    step = 'journey_studio_service_page'
    await edit("click('System')")
    await wait("return !!button('Studio service')")
    await edit("click('Studio service')")
    await wait("const t = document.querySelector('.studio-status')?.textContent ?? ''; return t.includes('Studio service · ChatGPT image service on this Mac') && !!button('Generate test picture') && /Signed in|Not signed in|refresh|unknown/i.test(t)")
    await shot('journey-09-studio-service.png'); pass()

    step = 'journey_narrow_layout'
    const [width, height] = input.console.getSize()
    input.console.setSize(1024, 768)
    await pause(400)
    await edit("click('Avatars')")
    await wait("return !!section('Interactive Studio')")
    await edit("section('Interactive Studio').click()")
    await wait("return !!studioSection()")
    await edit("open('Image prompt'); open('More settings'); open('Text on the mirror')")
    await audit()
    await shot('journey-10-narrow-studio.png', '.experiences-editor')
    await edit("click('Mirror')")
    await wait("return !!document.querySelector('.studio-live__switch') && document.documentElement.scrollWidth <= innerWidth + 2")
    await shot('journey-11-narrow-mirror.png')
    input.console.setSize(width!, height!)
    pass()
  } catch (error) {
    input.onEvidence({ step, status: 'failed', item: error instanceof Error ? error.message.replace(/[^\w:,-]/g, '_').slice(0, 160) : 'studio_journey_failed' })
    // The rendered state at the failure is the fastest reproduction aid (synthetic data only).
    await capture(input.console, input.outputDir, `journey-failure-${step}.png`).catch(() => undefined)
    throw error
  }
  return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: screenshots, musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: checks }
}
