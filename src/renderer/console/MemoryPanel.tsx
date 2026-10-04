import { useEffect, useRef, useState } from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import type { MemoryEntry, MemoryConsoleRequest } from '../../shared/memory'

export function MemoryPanel({ bridge, avatarId }: { bridge: ConsoleBridge | null; avatarId: string }): React.JSX.Element {
  const [name, setName] = useState(''), [names, setNames] = useState<string[]>([])
  const [topic, setTopic] = useState(''), [text, setText] = useState(''), [query, setQuery] = useState('')
  const [entries, setEntries] = useState<MemoryEntry[]>([]), [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [deleting, setDeleting] = useState('')
  const generation = useRef(0)
  const clear = () => { setTopic(''); setText(''); setEditing(false); setDeleting('') }
  async function run(action: MemoryConsoleRequest['action'], deleteTopic = ''): Promise<void> {
    if (!bridge?.memory) { setMessage('Memory service unavailable.'); return }
    const current = ++generation.current
    setBusy(true); setMessage('')
    try {
      const result = await bridge.memory({ action, avatarId, name: name.trim(), topic: deleteTopic || topic.trim(), text: text.trim(), query })
      if (current !== generation.current) return
      if (result.status !== 'accepted') {
        setMessage(result.code === 'memory_end_conversation_first' ? 'End the Mirror conversation before editing memories.'
          : result.code === 'memory_avatar_unavailable' ? 'Publish this avatar before adding memories.' : 'Could not update memories. Check the name, topic and text, then try again.')
        return
      }
      setNames(result.names ?? []); setEntries(result.entries ?? [])
      if (action !== 'list') { clear(); setMessage(action === 'save' ? 'Saved.' : 'Deleted.') }
    } catch { if (current === generation.current) setMessage('Memory service unavailable.') }
    finally { if (current === generation.current) setBusy(false) }
  }
  useEffect(() => {
    setEntries([]); clear()
    const timer = setTimeout(() => { void run('list') }, 180)
    return () => { clearTimeout(timer); generation.current++ }
  }, [avatarId, name, query, bridge])
  return <section className="memory-panel" aria-label="Lasting memories">
    <p className="console__muted">Saved on this Mac for this avatar and person. Your avatar asks for spoken identity confirmation before recall. Say “Remember this” to save a fact.</p>
    <label>Person<input value={name} list={`memory-people-${avatarId}`} maxLength={80} placeholder="Name" disabled={busy} onChange={e => setName(e.target.value)} /></label>
    <datalist id={`memory-people-${avatarId}`}>{names.map(value => <option key={value} value={value} />)}</datalist>
    {name.trim() && <>
      <label>Search<input value={query} maxLength={200} onChange={e => setQuery(e.target.value)} placeholder="Search memories" /></label>
      <form onSubmit={e => { e.preventDefault(); void run('save') }}>
        <label>Topic<input value={topic} maxLength={120} required disabled={busy || editing} onChange={e => setTopic(e.target.value)} placeholder="A short label" /></label>
        <label>Memory<textarea value={text} maxLength={1000} required disabled={busy} onChange={e => setText(e.target.value.replace(/[\r\n]+/g, ' '))} rows={3} /></label>
        <div className="console__action-row"><button disabled={busy || !topic.trim() || !text.trim()}>{editing ? 'Save changes' : 'Add memory'}</button>{editing && <button type="button" onClick={clear}>Cancel edit</button>}</div>
      </form>
      <ul className="memory-list">{entries.map(entry => <li key={entry.id}>
        <strong>{entry.topic}</strong><p>{entry.text}</p>
        <div className="console__action-row"><button disabled={busy} onClick={() => { setTopic(entry.topic); setText(entry.text); setEditing(true) }}>Edit</button>
          {deleting === entry.topic ? <><button disabled={busy} onClick={() => void run('delete', entry.topic)}>Confirm delete</button><button onClick={() => setDeleting('')}>Cancel</button></>
            : <button disabled={busy} onClick={() => setDeleting(entry.topic)}>Delete</button>}</div>
      </li>)}</ul>
      {!busy && !entries.length && <p>No memories found.</p>}
      {entries.length === 100 && <p>Showing 100 memories. Search to narrow the list.</p>}
    </>}
    <p role="status">{busy ? 'Loading…' : message}</p>
  </section>
}
