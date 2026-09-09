import { dialog } from 'electron'
import { join, resolve } from 'node:path'
import { cp, readFile, writeFile } from 'node:fs/promises'
import { capture, type Phase4QaInput, type Phase4QaResult } from './phase4-qa'

// Isolated QA only. DOM interactions exercise production controls and IPC;
// only the native picker return is substituted (native picker tested separately).
export async function runCubismConsoleQa(input: Phase4QaInput): Promise<Phase4QaResult> {
  const dom = `const p = document.querySelector('.cubism-studio');
    const b = name => [...p.querySelectorAll('button')].find(e => (e.getAttribute('aria-label') || e.textContent.trim()) === name);
    const click = name => { const e = b(name); if (!e || e.disabled) throw Error('cubism_control_unavailable'); e.scrollIntoView({block:'center'}); e.click(); };
    const select = value => { const e = p.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,value); e.dispatchEvent(new Event('change',{bubbles:true})); };
    const status = () => p.querySelector('.cubism-studio__status').textContent;`
  const evaluate = <T>(source: string): Promise<T> => input.console.webContents.executeJavaScript(`(async()=>{${dom}${source}})()`, true)
  const delay = (ms: number) => new Promise(resolveWait => setTimeout(resolveWait, ms))
  const wait = async (source: string) => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) { if (await evaluate<boolean>(source)) return; await delay(80) }
    throw new Error('cubism_qa_condition_timeout')
  }
  const click = async (name: string) => { await evaluate(`click(${JSON.stringify(name)});`); await delay(40) }
  let count = 0, screenshots = 0, motions = 0, expressions = 0
  let step = 'cubism_ready'
  const pass = (item?: string) => { count++; input.onEvidence({ step, item, status: 'passed' }) }
  const snap = async (name: string) => {
    await evaluate("p.scrollIntoView({block:'start'});")
    await delay(100)
    const result = await capture(input.console, input.outputDir, name)
    screenshots++; input.onEvidence({ step, status: 'captured', file: name, sha256: result.sha256, nonblack_pixels: result.nonblackPixels })
  }
  const picker = dialog.showOpenDialog
  let selection: string | null = null
  dialog.showOpenDialog = (async () => ({ canceled: !selection, filePaths: selection ? [selection] : [] })) as typeof dialog.showOpenDialog
  try {
    const before = await evaluate<string>('return JSON.stringify(await window.magicMirror.getConfig());')
    await input.console.webContents.executeJavaScript("[...document.querySelectorAll('nav button')].find(e=>e.textContent==='Live2D Cubism').click()", true)
    await wait("return !!p && !b('Refresh library').disabled")
    await click('Browse & import Cubism…')
    await wait("return status() === 'Import cancelled.' && !b('Refresh library').disabled")
    step = 'cubism_import_cancel'; pass()
    // Additional clip in a group proves the former index-zero limitation is gone.
    const multi = resolve(input.outputDir, '..', 'multi-ren')
    await cp(resolve('resources/avatar/Ren'), multi, { recursive: true })
    const manifestPath = join(multi, 'Ren.model3.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.FileReferences.Motions.Scene.push({ ...manifest.FileReferences.Motions.Scene[0] })
    await writeFile(manifestPath, JSON.stringify(manifest))
    const sources = [null, manifestPath, process.env['MIRROR_CUBISM_QA_MODEL']].filter(source => source !== undefined)
    for (const [modelIndex, source] of sources.entries()) {
      if (source) {
        selection = source
        await click('Browse & import Cubism…')
        await wait("return status().includes('imported.') && !b('Load preview').disabled")
        const labelName = modelIndex === 1 ? 'QA Ren' : 'QA external rig'
        await evaluate(`for (const [name,value] of [['Avatar library name',${JSON.stringify(labelName)}],['Avatar library version','v10']]) {
          const e=p.querySelector('input[aria-label="'+name+'"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);
          e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));
        }`)
        await delay(100)
        await click('Save library label')
        await wait("return status().startsWith('Library label saved:') && !b('Refresh library').disabled")
        await click('Refresh library')
        await wait(`return !b('Refresh library').disabled && p.querySelector('select').selectedOptions[0].textContent.includes(${JSON.stringify(labelName + ' · v10')})`)
        step = `cubism_model_${modelIndex}_label_persisted`; pass()
      }
      await click('Load preview')
      await wait("return !b('Stop / reset').disabled && status().includes('Ready')")
      const inventory = await evaluate<{ motionButtons: string[]; expressionButtons: string[]; parameters: { id: string; min: number; max: number; value: number }[] }>(`return {
        motionButtons: [...p.querySelectorAll('button[aria-label^="Play motion"]')].map(e=>e.getAttribute('aria-label')),
        expressionButtons: [...p.querySelectorAll('button[aria-label^="Test expression"]')].map(e=>e.getAttribute('aria-label')),
        parameters: [...p.querySelectorAll('input[type="range"]')].map(e=>({id:e.getAttribute('aria-label'),min:Number(e.min),max:Number(e.max),value:Number(e.value)})) };`)
      if (!inventory.motionButtons.length || !inventory.expressionButtons.length || !inventory.parameters.length) throw new Error('cubism_inventory_empty')
      if (modelIndex === 1 && !inventory.motionButtons.includes('Play motion Scene 2')) throw new Error('cubism_second_clip_missing')
      step = `cubism_model_${modelIndex}_loaded`; pass(); await snap(`cubism-${modelIndex}-neutral.png`)
      for (const name of inventory.motionButtons) {
        step = `cubism_model_${modelIndex}_motion`
        await click(name); await wait("return status().startsWith('Motion started:') || status().startsWith('Motion finished:')")
        await delay(120); pass(name); motions++
      }
      for (const name of inventory.expressionButtons) {
        step = `cubism_model_${modelIndex}_expression`
        await click(name); await wait("return status().startsWith('Expression:')")
        await delay(120); pass(name); expressions++
      }
      await click('Stop / reset')
      for (const parameter of inventory.parameters) {
        step = `cubism_model_${modelIndex}_parameter`
        for (const [label, expected] of [['Min', parameter.min], ['Max', parameter.max], ['Default', parameter.value]] as const) {
          await click(`${parameter.id} ${label}`)
          await wait(`return Math.abs(Number([...p.querySelectorAll('output')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(parameter.id + ' observed')}).textContent)-(${expected}))<0.002`)
        }
        pass(parameter.id)
      }
      const parameter = inventory.parameters[0]
      step = `cubism_model_${modelIndex}_cancel`
      await click(`Test parameter ${parameter.id}`); await click('Stop / reset')
      await delay(3100)
      await wait("return status() === 'Stopped · neutral pose'"); pass()
      if (modelIndex === 2) {
        await click('ParamMouthOpenY Max'); await delay(700); await snap('cubism-raven-beak-open.png')
        await click('ParamEyeLOpen Min'); await delay(700); await snap('cubism-raven-blink.png')
      }
    }
    step = 'cubism_switch_back'
    await evaluate("select('builtin-ren');"); await delay(80); await click('Load preview')
    await wait("return !b('Stop / reset').disabled && status().includes('Ready')")
    pass(); await snap('cubism-ren-return.png')
    step = 'cubism_leave_cleanup'
    await click('Test parameter ParamAngleX')
    await input.console.webContents.executeJavaScript("[...document.querySelectorAll('nav button')].find(e=>e.textContent==='Overview').click()", true)
    await delay(3100)
    await wait("return !p.querySelector('canvas')")
    const after = await evaluate<string>('return JSON.stringify(await window.magicMirror.getConfig());')
    if (before !== after) throw new Error('cubism_preview_changed_config')
    pass()
    return { motionCount: motions, expressionCount: expressions, sceneCount: 0, visualCount: 0, screenshotCount: screenshots, musicAnalyser: 'not_executed', consoleCheckCount: count }
  } catch (error) {
    input.onEvidence({ step, status: 'failed' }); await snap('cubism-failed.png'); throw error
  } finally { dialog.showOpenDialog = picker }
}
