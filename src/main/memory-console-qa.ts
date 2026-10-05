import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'
import { dialog } from 'electron'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { runMemoryRealtimeQa } from './memory-realtime-qa'

/** Isolated synthetic fixtures through rendered controls, production preload and SQLite. */
export async function runMemoryConsoleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let step = 'memory_console_ready', checks = 0, screenshots = 0
  const delay = () => new Promise(resolve => setTimeout(resolve, 60))
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{
    const button=name=>[...document.querySelectorAll('button')].find(e=>e.checkVisibility()&&e.textContent.trim()===name);
    const click=name=>{const e=button(name);if(!e||e.disabled)throw Error('memory_qa_control_unavailable');e.click()};
    const field=name=>[...document.querySelectorAll('.memory-panel label')].find(e=>e.firstChild.textContent===name)?.querySelector('input,textarea,select');
    const set=(name,value)=>{const e=field(name);if(!e||e.disabled)throw Error('memory_qa_field_unavailable');
      const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}))};
    ${source}})()`, true) as Promise<T>
  const edit = async (source: string) => { await evaluate(source); await delay() }
  const wait = async (source: string) => {
    const deadline = Date.now() + (step === 'memory_console_live_import' ? 60000 : 15000)
    while (Date.now() < deadline) { if (await evaluate<boolean>(source)) return; await delay() }
    throw Error('memory_qa_timeout_' + step)
  }
  const pass = () => { checks++; input.onEvidence({ step, status: 'passed' }) }
  const shot = async (file: string) => {
    const result = await capture(input.console, input.outputDir, file)
    screenshots++; input.onEvidence({ step, status: 'captured', file, sha256: result.sha256 })
  }
  const open = async () => {
    await wait("return !!button('Avatars')"); await edit("click('Avatars')"); await edit("click('Memories')")
    await wait("return !!field('Person')&&!field('Person').disabled")
  }
  try {
    await open()
    if (await evaluate("return !!button('Save & apply all changes')")) throw Error('memory_qa_redundant_publish')
    pass()
    step = 'memory_console_create'
    await edit("set('Person','Synthetic QA Person')")
    await wait("return !!field('Topic')&&!field('Person').disabled")
    await edit("set('Topic','Synthetic preference');set('Memory','Synthetic jasmine fixture')")
    await edit("click('Add memory')")
    await wait("return document.querySelectorAll('.memory-list li').length===1&&!field('Person').disabled")
    pass()
    step = 'memory_console_edit'
    await edit("click('Edit')"); await edit("set('Memory','Synthetic mint fixture')"); await edit("click('Save changes')")
    await wait("return document.querySelector('.memory-list li p')?.textContent==='Synthetic mint fixture'&&!field('Person').disabled")
    pass()
    step = 'memory_console_reload'
    input.console.webContents.reload(); await open()
    await edit("set('Person','Synthetic QA Person')")
    await wait("return document.querySelector('.memory-list li p')?.textContent==='Synthetic mint fixture'&&!field('Person').disabled")
    pass()
    step = 'memory_console_search'
    await edit("set('Search','interstellar engine invoices')")
    await wait("return !document.querySelector('.memory-list li')&&!field('Person').disabled")
    await edit("set('Search','mint')")
    await wait("return document.querySelectorAll('.memory-list li').length===1&&!field('Person').disabled")
    pass()
    step = 'memory_console_person_isolation'
    await edit("set('Search','');set('Person','Other Synthetic Person')")
    await wait("return !document.querySelector('.memory-list li')&&!field('Person').disabled")
    pass()
    step = 'memory_console_delete'
    await edit("set('Person','Synthetic QA Person')")
    await wait("return document.querySelectorAll('.memory-list li').length===1&&!field('Person').disabled")
    await edit("click('Delete')"); await edit("click('Confirm delete')")
    await wait("return !document.querySelector('.memory-list li')&&!field('Person').disabled")
    pass()
    step = 'memory_console_policy'
    await edit("set('Memory mode','explicit')")
    await wait("return field('Memory mode').value==='explicit'&&!field('Person').disabled")
    input.console.webContents.reload(); await open()
    await edit("set('Person','Synthetic QA Person')")
    await wait("return field('Memory mode')?.value==='explicit'&&!field('Person').disabled")
    pass()
    step = 'memory_console_unsaved_search'
    await edit("set('Topic','Unsaved synthetic draft');set('Memory','Synthetic draft stays while searching')")
    await edit("set('Search','missing')")
    await wait("return !button('Add memory').disabled")
    if (!await evaluate("return field('Topic').value==='Unsaved synthetic draft'&&field('Person').disabled")) throw Error('memory_qa_draft_lost')
    await edit("click('Cancel edit');set('Search','')")
    pass()
    step = 'memory_console_markdown_preview'
    const sourcePath = join(input.outputDir, '..', 'synthetic-memory-import.md')
    const live = process.env['MIRROR_MEMORY_LIVE_QA'] === '1'
    await writeFile(sourcePath, '# Persona\nSynthetic patient companion.\n# History\n' +
      (live ? 'The visitor chose the botanical garden for a quiet Sunday walk. They prefer shaded routes because the midday sun is tiring.'
        : 'Synthetic old conversation for bounded import preview.\n'.repeat(21000)))
    const picker = dialog.showOpenDialog
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [sourcePath] })) as typeof dialog.showOpenDialog
    try {
      await edit("click('Import Markdown')")
      await wait("return !!button('Import summaries')")
      if (!await evaluate("return document.querySelector('.memory-import textarea')?.value.includes('Synthetic patient companion')")) throw Error('memory_qa_persona_missing')
      pass()
      if (live) {
        step = 'memory_console_live_import'
        await edit("click('Import summaries')")
        await wait("return document.querySelector('.memory-import')?.textContent.includes('Import complete.')")
        await wait("return document.querySelectorAll('.memory-list li').length>0&&!field('Person').disabled")
        pass()
        await runMemoryRealtimeQa(input, name => { step = name; pass() })
        while (await evaluate("return !!document.querySelector('.memory-list li')")) {
          await edit("click('Delete')"); await edit("click('Confirm delete')")
          await wait("return !field('Person').disabled")
        }
      } else { await edit("click('Cancel import')") }
    } finally { dialog.showOpenDialog = picker; await unlink(sourcePath) }
    if (input.memoryPipeline) await input.memoryPipeline(name => { step = name; pass() })
    // Capture only the empty panel; saved values never enter evidence images.
    await edit("set('Person','');document.querySelector('.memory-panel').scrollIntoView({block:'center'})")
    await wait("return !field('Person').disabled")
    await shot('memory-console-empty.png')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: screenshots,
      musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: checks }
  } catch (error) {
    const reason = error instanceof Error && /^memory_qa_[a-z_]+$/.test(error.message) ? error.message : 'memory_qa_unknown'
    input.onEvidence({ step, status: 'failed', item: reason })
    const flags = await evaluate<string>("return JSON.stringify({rows:document.querySelectorAll('.memory-list li').length,edit:!!button('Edit'),save:!!button('Save changes'),saveDisabled:button('Save changes')?.disabled,loading:document.querySelector('.memory-panel [role=status]')?.textContent==='Loading…',storageError:document.querySelector('.memory-panel [role=status]')?.textContent.includes('Could not update')})").catch(() => '{}')
    input.onEvidence({ step: 'memory_console_failure_flags', status: 'info', item: flags })
    throw error
  }
}
