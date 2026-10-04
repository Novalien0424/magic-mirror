import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

/** Isolated synthetic fixtures through rendered controls, production preload and SQLite. */
export async function runMemoryConsoleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  let step = 'memory_console_ready', checks = 0, screenshots = 0
  const delay = () => new Promise(resolve => setTimeout(resolve, 60))
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{
    const button=name=>[...document.querySelectorAll('button')].find(e=>e.checkVisibility()&&e.textContent.trim()===name);
    const click=name=>{const e=button(name);if(!e||e.disabled)throw Error('memory_qa_control_unavailable');e.click()};
    const field=name=>[...document.querySelectorAll('.memory-panel label')].find(e=>e.firstChild.textContent===name)?.querySelector('input,textarea');
    const set=(name,value)=>{const e=field(name);if(!e||e.disabled)throw Error('memory_qa_field_unavailable');
      const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(p,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))};
    ${source}})()`, true) as Promise<T>
  const edit = async (source: string) => { await evaluate(source); await delay() }
  const wait = async (source: string) => {
    const deadline = Date.now() + 15000
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
    await edit("set('Search','jasmine')")
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
    // Capture only the empty panel; saved values never enter evidence images.
    await edit("set('Person','');document.querySelector('.memory-panel').scrollIntoView({block:'center'})")
    await wait("return !field('Person').disabled")
    await shot('memory-console-empty.png')
    return { motionCount: 0, expressionCount: 0, sceneCount: 0, screenshotCount: screenshots,
      musicAnalyser: 'not_executed', visualCount: 0, consoleCheckCount: checks }
  } catch (error) {
    input.onEvidence({ step, status: 'failed' })
    throw error
  }
}
