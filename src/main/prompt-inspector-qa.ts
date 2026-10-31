import { BrowserWindow } from 'electron'
import { capture, type Phase4QaInput } from './phase4-qa'
import { PROMPT_TABS } from '../shared/prompt-inspection'

/** Public synthetic fixtures only; exercise native windows through rendered controls. */
export async function runPromptInspectorQa(input: Phase4QaInput, expectedSession: string, prefix: string) {
  let checks = 0, screenshots = 0
  const wait = async (condition: () => Promise<boolean> | boolean) => {
    const end = Date.now() + 10000
    while (Date.now() < end) { if (await condition()) return; await new Promise(r => setTimeout(r, 80)) }
    throw new Error('prompt_inspector_qa_timeout')
  }
  const windows: BrowserWindow[] = []
  let stage = 'open'
  try {
    for (const tab of PROMPT_TABS) {
      stage = `${PROMPT_TABS.indexOf(tab)}_open`
      await input.console.webContents.executeJavaScript(`document.querySelectorAll('.prompt-launcher button').forEach(b=>{if(b.textContent===${JSON.stringify(`${tab} ↗`)})b.click()})`, true)
      await wait(() => BrowserWindow.getAllWindows().some(w => w.getTitle() === `Magic Mirror Prompts · ${tab}`))
      const win = BrowserWindow.getAllWindows().find(w => w.getTitle() === `Magic Mirror Prompts · ${tab}`)!
      windows.push(win)
      stage = `${PROMPT_TABS.indexOf(tab)}_content`
      await wait(() => win.webContents.executeJavaScript(`!!document.querySelector('.prompt-inspector article pre')`))
      // One reason per failed condition; '' means the rendered page is valid.
      const problem = await win.webContents.executeJavaScript(`(() => {
        const page=document.querySelector('.prompt-inspector article');
        if (!page) return 'prompt_inspector_article_missing';
        if (page.getAttribute('aria-label')!==${JSON.stringify(tab)}) return 'prompt_inspector_wrong_tab';
        const pres=[...page.querySelectorAll('pre')];
        if (!pres.length) return 'prompt_inspector_sections_missing';
        const empty=pres.findIndex(p=>!p.textContent);
        if (empty>=0) return 'prompt_inspector_empty_section_'+empty;
        if (!document.body.textContent.includes('Editor draft snapshot')) return 'prompt_inspector_draft_selector_missing';
        if (document.querySelector('textarea')) return 'prompt_inspector_editable_textarea';
        return '';
      })()`) as string
      if (problem) throw new Error(problem)
      if (tab === 'Session') {
        stage = `${PROMPT_TABS.indexOf(tab)}_avatar`
        // Session opens with "Assigned skills" (96f48e3); the avatar text lives in the session instructions.
        const avatar = await win.webContents.executeJavaScript(`(() => {
          const pre=[...document.querySelectorAll('.prompt-inspector article pre')].find(p=>p.getAttribute('aria-label')==='Session instructions · system');
          return !pre ? 'prompt_inspector_session_instructions_missing' : pre.textContent.includes(${JSON.stringify(expectedSession)}) ? '' : 'prompt_inspector_wrong_avatar';
        })()`) as string
        if (avatar) throw new Error(avatar)
      }
      stage = `${PROMPT_TABS.indexOf(tab)}_isolation`
      const isolated = await win.webContents.executeJavaScript(`(async()=>!window.magicMirror || !(await window.magicMirror.getConfig()).ok)()`)
      if (!isolated) throw new Error('prompt_inspector_privileged_ipc_allowed')
      const noPopup = await win.webContents.executeJavaScript(`window.open('about:blank','nested-prompt')===null`)
      if (!noPopup) throw new Error('prompt_inspector_nested_window_allowed')
      stage = `${PROMPT_TABS.indexOf(tab)}_definition`
      if (tab === 'Speech') {
        const exact = await win.webContents.executeJavaScript(`(() => {const p=JSON.parse(document.querySelector('pre').textContent);return p.tool_choice==='none'&&p.input.length===0&&typeof p.instructions==='string'})()`)
        if (!exact) throw new Error('prompt_inspector_request_mismatch')
      }
      if (tab === 'Tools & input') {
        const validTools = await win.webContents.executeJavaScript(`(() => {
          const values=[...document.querySelectorAll('article pre')].slice(0,3).map(p=>JSON.parse(p.textContent));
          const [tool,results,policy]=values;
          return tool.type==='function' && tool.name==='return_to_dormant' && tool.parameters.additionalProperties===false
            && results.accepted.status==='accepted' && results.rejected.code==='tool_arguments_rejected'
            && policy.completion==='background' && policy.routing==='model_intent'
            && document.body.textContent.includes('realtime-tools.v1.json');
        })()`)
        if (!validTools) throw new Error('prompt_inspector_tool_catalog_mismatch')
      }
      await new Promise(r => setTimeout(r, 180))
      stage = `${PROMPT_TABS.indexOf(tab)}_capture`
      const file = `${prefix}-prompt-${PROMPT_TABS.indexOf(tab)}.png`
      const shot = await capture(win, input.outputDir, file)
      input.onEvidence({ step: 'prompt_inspector_window', item: tab, status: 'passed', file, sha256: shot.sha256 })
      checks++; screenshots++
    }
    const win = windows[0]!
    await win.webContents.executeJavaScript(`const s=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'published');s.dispatchEvent(new Event('change',{bubbles:true}))`, true)
    await wait(() => win.webContents.executeJavaScript(`document.querySelector('select').value==='published'`))
    await win.webContents.executeJavaScript(`[...document.querySelectorAll('nav button')].find(b=>b.textContent==='Sources').click()`, true)
    await wait(() => win.webContents.executeJavaScript(`document.querySelector('article').getAttribute('aria-label')==='Sources'`))
    checks++
    input.onEvidence({ step: 'prompt_inspector_tabs_and_published', status: 'passed' })
    return { checks, screenshots }
  } catch (error) {
    // Metadata-only: the QA's own reason code, never page text.
    const message = error instanceof Error ? error.message : ''
    const reason = /^prompt_inspector_[a-z0-9_]+$/.test(message) ? message : 'script_error'
    input.onEvidence({step:'prompt_inspector_failure_stage',item:`${stage}:${reason}`,status:'failed'})
    throw error
  } finally { for (const win of windows) if (!win.isDestroyed()) win.close() }
}
