import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PROMPT_TABS, inspectAvatarPrompts, type PromptInspection, type PromptTab } from '../../shared/prompt-inspection'
import { promptWindowName } from '../../shared/prompt-window'
import { REALTIME_PROMPTS } from '../../shared/realtime-prompts'
import type { ConsoleConfigDraftInput, ConsoleConfigSafeView } from '../../shared/console-types'

type Snapshot = { draft: PromptInspection; published: PromptInspection | null; version: number; at: string }
type OpenInspector = { win: Window; tab: PromptTab; snapshot: Snapshot }

function Inspector({ opened }: { opened: OpenInspector }): React.JSX.Element {
  const [tab, setTab] = useState(opened.tab)
  const [mode, setMode] = useState<'draft' | 'published'>('draft')
  const view = opened.snapshot[mode]
  return <main className="prompt-inspector">
    <header><p className="console__eyebrow">Effective realtime prompt & tool · {REALTIME_PROMPTS.version}</p>
      <h1>{opened.snapshot.draft.name}</h1>
      <label>Configuration <select aria-label="Prompt configuration" value={mode} onChange={e => setMode(e.currentTarget.value as typeof mode)}>
        <option value="draft">Editor draft snapshot</option><option value="published">Published v{opened.snapshot.version}</option>
      </select></label>
      <p>Captured {opened.snapshot.at}. Reopen from Console to refresh. Published settings apply to the next conversation; an existing session keeps its earlier snapshot.</p>
    </header>
    <nav aria-label="Prompt sections">{PROMPT_TABS.map(label => <button type="button" aria-pressed={tab === label} key={label} onClick={() => setTab(label)}>{label}</button>)}</nav>
    <article aria-label={tab}>
      {!view ? <p>This avatar has not been published.</p> : view.pages[tab].map((section, index) => <section key={index}>
        <h2>{section.title}</h2><p className="prompt-source">Source: {section.source}</p>
        <pre aria-label={section.title}>{section.content}</pre>
      </section>)}
      {tab === 'Speech' && <p>Each request uses its own instructions and empty input. Scene and sleep requests also carry runtime correlation IDs. Dialogue entries list configured actions, including unused library actions; a scene must reference an action to run it.</p>}
    </article>
    <footer>Read-only application prompts. Provider-internal instructions are unavailable. No visitor history, private memory or credentials are included. Model settings remain in Models.</footer>
  </main>
}

/** Native child windows render only text from public configuration, through React. */
export function PromptInspector({ draft, published, avatarId }: {
  draft: ConsoleConfigDraftInput; published: ConsoleConfigSafeView; avatarId: string
}): React.JSX.Element {
  const [opened, setOpened] = useState<OpenInspector[]>([])
  const [error, setError] = useState('')
  const owned = useRef(new Set<Window>())
  useEffect(() => () => { for (const win of owned.current) win.close(); owned.current.clear() }, [])
  const open = (tab: PromptTab): void => {
    const avatar = draft.avatarCatalog?.avatars.find(a => a.id === avatarId)
    if (!avatar) return
    const active = published.avatarCatalog?.avatars.find(a => a.id === avatarId)
    const existing = opened.find(item => item.tab === tab && !item.win.closed)
    const win = existing?.win ?? window.open('about:blank', promptWindowName(PROMPT_TABS.indexOf(tab)), 'width=1000,height=800')
    if (!win) { setError('Prompt window could not open. Reopen the Console and try again.'); return }
    try {
      win.document.title = `Magic Mirror Prompts · ${tab}`
      if (!owned.current.has(win)) {
        for (const style of Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))) win.document.head.appendChild(style.cloneNode(true))
        win.addEventListener('beforeunload', () => { owned.current.delete(win); setOpened(items => items.filter(item => item.win !== win)) })
        owned.current.add(win)
      }
      const snapshot: Snapshot = { draft: inspectAvatarPrompts(avatar, draft.sceneActions, draft.wake.phrase),
        published: active ? inspectAvatarPrompts(active, published.sceneActions, published.wake.phrase) : null,
        version: published.configVersion, at: new Date().toLocaleTimeString() }
      setOpened(items => [...items.filter(item => item.win !== win), { win, tab, snapshot }])
      setError(''); win.focus()
    } catch { win.close(); setError('Prompt window could not render. Close and reopen it from Console.') }
  }
  return <section className="prompt-launcher" aria-label="Effective realtime prompt & tool">
    <h3>Effective realtime prompt & tool</h3>
    <p>Inspect the exact instructions, requests and their source files. Each category opens a separate window with draft and published views.</p>
    <nav aria-label="Open prompt windows">{PROMPT_TABS.map(tab => <button type="button" key={tab} onClick={() => open(tab)}>{tab} ↗</button>)}</nav>
    {error && <p role="alert">{error}</p>}
    {opened.filter(item => !item.win.closed).map(item => createPortal(<Inspector key={item.snapshot.at} opened={item} />, item.win.document.body, item.tab))}
  </section>
}
