import { useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { MemoryEntry, MemoryConsoleRequest, MemoryMode, MemoryImportStatus } from '../../shared/memory'

export function MemoryPanel({ bridge, avatarId, onEditingChange }: { bridge: ConsoleBridge | null; avatarId: string; onEditingChange?(editing: boolean): void }): React.JSX.Element {
  const [name, setName] = useState(''), [names, setNames] = useState<string[]>([])
  const [topic, setTopic] = useState(''), [text, setText] = useState(''), [query, setQuery] = useState('')
  const [entries, setEntries] = useState<MemoryEntry[]>([]), [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [deleting, setDeleting] = useState('')
  const [mode, setMode] = useState<MemoryMode>('automatic')
  const [importStatus, setImportStatus] = useState<MemoryImportStatus | null>(null)
  const generation = useRef(0)
  const listTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clear = () => { setTopic(''); setText(''); setEditing(false); setDeleting('') }
  async function run(action: MemoryConsoleRequest['action'], deleteTopic = '', policy?: MemoryMode): Promise<void> {
    if (!bridge?.memory) { setMessage('Memory service unavailable.'); return }
    clearTimeout(listTimer.current)
    const current = ++generation.current
    setBusy(true); setMessage('')
    try {
      const result = await bridge.memory({ action, avatarId, name: name.trim(), topic: deleteTopic || topic.trim(), text: policy ?? text.trim(), query })
      if (current !== generation.current) return
      if (result.status !== 'accepted') {
        setMessage(result.code === 'memory_end_conversation_first' ? 'End the Mirror conversation before editing memories.'
          : result.code === 'memory_avatar_unavailable' ? 'Publish this avatar before adding memories.' : 'Could not update memories. Check the name, topic and text, then try again.')
        return
      }
      setNames(result.names ?? []); setEntries(result.entries ?? []); if (result.mode) setMode(result.mode)
      if (action !== 'list') { if (action !== 'policy') clear(); setMessage(action === 'save' ? 'Saved.' : action === 'policy' ? 'Memory mode updated.' : 'Deleted.') }
    } catch { if (current === generation.current) setMessage('Memory service unavailable.') }
    finally { if (current === generation.current) setBusy(false) }
  }
  async function importAction(action: 'pick' | 'start' | 'status' | 'cancel'): Promise<void> {
    if (!bridge?.memoryImport) return
    try {
      const result = await bridge.memoryImport({ action, avatarId, name: name.trim() })
      setImportStatus(result)
      if (result.state === 'complete' || result.state === 'cancelled' || result.state === 'failed') void run('list')
    } catch { setMessage('Import service unavailable.') }
  }
  useEffect(() => {
    if (importStatus?.state !== 'running') return
    const timer = setInterval(() => { void importAction('status') }, 1000)
    return () => clearInterval(timer)
  }, [importStatus?.state, bridge, avatarId, name])
  useEffect(() => {
    setEntries([])
    const timer = setTimeout(() => { void run('list') }, 180); listTimer.current = timer
    return () => { clearTimeout(timer); generation.current++ }
  }, [avatarId, name, query, bridge])
  useEffect(() => { clear(); setImportStatus(null) }, [avatarId, name])
  const importing = importStatus?.state === 'running'
  const dirty = !!topic || !!text
  useEffect(() => { onEditingChange?.(dirty || !!importing || importStatus?.state === 'staged'); return () => onEditingChange?.(false) }, [dirty, importing, importStatus?.state, onEditingChange])
  useEffect(() => {
    if (!dirty && !importing) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty, importing])
  return <section className="memory-panel" aria-label="Lasting memories">
    <p className="console__muted">Private to this avatar and confirmed person. Automatic mode keeps useful summaries, never recordings or whole conversations. People sharing a name need distinct labels.</p>
    <label>Person<input value={name} list={`memory-people-${avatarId}`} maxLength={80} placeholder="Name" disabled={busy || importing || dirty} onChange={e => setName(e.target.value)} /></label>
    <datalist id={`memory-people-${avatarId}`}>{names.map(value => <option key={value} value={value} />)}</datalist>
    {name.trim() && <>
      <label>Memory mode<select value={mode} disabled={busy || importing} onChange={e => void run('policy', '', e.target.value as MemoryMode)}>
        <option value="automatic">Automatic summaries</option><option value="explicit">Only when asked</option><option value="off">Memory off</option>
      </select></label>
      <label>Search<input value={query} maxLength={200} onChange={e => setQuery(e.target.value)} placeholder="Search memories" /></label>
      <form onSubmit={e => { e.preventDefault(); void run('save') }}>
        <label>Topic<input value={topic} maxLength={120} required disabled={busy || editing} onChange={e => setTopic(e.target.value)} placeholder="A short label" /></label>
        <label>Memory<textarea value={text} maxLength={1000} required disabled={busy} onChange={e => setText(e.target.value.replace(/[\r\n]+/g, ' '))} rows={3} /></label>
        <div className="console__action-row"><button disabled={busy || importing || !topic.trim() || !text.trim()}>{editing ? 'Save changes' : 'Add memory'}</button>{dirty && <button type="button" onClick={clear}>Cancel edit</button>}</div>
      </form>
      <ul className="memory-list">{entries.map(entry => <li key={entry.id}>
        <strong>{entry.topic}</strong><p>{entry.text}</p><small>{entry.kind === 'episode' ? 'Conversation summary' : entry.kind === 'commitment' ? 'Commitment' : 'Fact'}{entry.state === 'resolved' ? ' · Resolved' : ''}</small>
        <div className="console__action-row"><button disabled={busy} onClick={() => { setTopic(entry.topic); setText(entry.text); setEditing(true) }}>Edit</button>
          {deleting === entry.topic ? <><button disabled={busy} onClick={() => void run('delete', entry.topic)}>Confirm delete</button><button onClick={() => setDeleting('')}>Cancel</button></>
            : <button disabled={busy} onClick={() => setDeleting(entry.topic)}>Delete</button>}</div>
      </li>)}</ul>
      {!busy && !entries.length && <p>No memories found.</p>}
      {entries.length === 100 && <p>Showing 100 memories. Search to narrow the list.</p>}
      <div className="memory-import">
        <button disabled={busy || importing || dirty} onClick={() => void importAction('pick')}>Import Markdown</button>
        {importStatus?.state === 'staged' && <>
          <p>{importStatus.chunks} history sections will be distilled with the configured cloud model. Use history for this person only; split mixed-person files first. Only summaries are saved; the source file stays where it is. Cancellation keeps already saved summaries.</p>
          {importStatus.persona && <label>Persona draft — review separately<textarea readOnly value={importStatus.persona} rows={6} /><small>Copy into this avatar’s Personality editor if desired. Import does not change the persona.</small></label>}
          <button onClick={() => void importAction('start')}>Import summaries</button><button onClick={() => void importAction('cancel')}>Cancel import</button>
        </>}
        {importing && <><p role="status">Summarizing {importStatus.processed} / {importStatus.chunks}; {importStatus.saved} summaries saved.</p><button onClick={() => void importAction('cancel')}>Cancel import</button></>}
        {importStatus?.state === 'complete' && <p>Import complete. {importStatus.saved} summaries saved.</p>}
        {importStatus?.state === 'failed' && <p role="alert">Import stopped ({importStatus.code.replaceAll('_', ' ')}). {importStatus.saved} summaries were saved; the original file is unchanged.</p>}
        {importStatus?.state === 'cancelled' && <p>Import cancelled. Previously saved summaries remain.</p>}
      </div>
    </>}
    <p role="status">{busy ? 'Loading…' : message}</p>
  </section>
}
