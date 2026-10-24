import * as React from 'react'
import { isWebConsole } from '../shared/media-url'
import type { ConsoleBridge } from '../../shared/bridge'
import { folderMediaSkill, validMediaAliases, type MediaFolderCommand, type MediaFolderStatus, type MediaFoldersView } from '../../shared/media-folders'
import { rankMediaResources } from '../../shared/media-discovery'
import { mediaClueKey } from '../../shared/media-clue'
import { mediaPhoneticKey } from '../../shared/media-phonetics'

const explanations: Record<string, string> = {
  media_folder_overlap: 'Choose separate folders. A shared folder cannot contain an avatar’s folder, and avatars cannot link overlapping folders.',
  media_folder_save_avatar_first: 'Save this new avatar first, then choose its folder.',
  media_folder_config_unreadable: 'Saved folder links could not be read. Existing links were preserved; check the application storage.',
  media_folder_unavailable: 'This folder cannot be read. Check that it exists and Google Drive is connected, or choose another folder.',
  media_folder_aliases_unavailable: 'This file is no longer available. Refresh files and choose it again.',
  media_folder_aliases_invalid: 'Enter up to 16 aliases, one per line, with at most 120 characters each.',
}

export function MediaFoldersPanel({ bridge, avatarId, avatarName, legacyCount = 0, onSharedSettings }: {
  bridge: ConsoleBridge | null; avatarId?: string; avatarName?: string; legacyCount?: number; onSharedSettings?(): void
}): React.JSX.Element {
  const [view, setView] = React.useState<MediaFoldersView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [editing, setEditing] = React.useState<{ assetId: string; text: string } | null>(null)
  const [aliasSaved, setAliasSaved] = React.useState(false)
  const pending = React.useRef(false), generation = React.useRef(0)
  const run = async (action: MediaFolderCommand['action'], scope?: 'own' | 'shared', aliasEdit?: { assetId: string; aliases: string[] }) => {
    if (!bridge?.mediaFolders || pending.current) return
    const current = ++generation.current
    pending.current = true; setBusy(true)
    if (action !== 'get') setSaved(false)
    try {
      const result = await bridge.mediaFolders(action === 'aliases'
        ? { action, ...(avatarId ? { avatarId } : {}), ...aliasEdit! }
        : { action, ...(avatarId ? { avatarId } : {}), ...(scope ? { scope } : {}) })
      if (current !== generation.current) return
      if (result.ok) { setView(result.value); setError(result.value.reason ? explanations[result.value.reason] ?? result.value.reason : ''); if (action === 'save' && !result.value.reason) setSaved(true)
        if (action === 'aliases') { setEditing(null); setAliasSaved(true) } }
      else { const reason = result.fields?.[0]?.message ?? result.reason; setError(explanations[reason] ?? `Folder setup failed: ${reason}`) }
    } catch { if (current === generation.current) setError('Could not reach the folder library. Try Refresh files.') }
    finally { if (current === generation.current) { pending.current = false; setBusy(false) } }
  }
  React.useEffect(() => {
    setEditing(null); setAliasSaved(false)
    void run('get')
    const timer = setInterval(() => void run('get'), 30000)
    return () => { clearInterval(timer); generation.current++; pending.current = false }
  }, [bridge, avatarId])
  const folder = (scope: 'own' | 'shared', status: MediaFolderStatus | null | undefined, editable: boolean) => <section className="media-folder-card" aria-label={scope === 'own' ? 'Avatar media folder' : 'Shared media folder'}>
    <h4>{scope === 'own' ? `${avatarName || 'Avatar'}’s folder` : 'Common folder'}</h4>
    {status ? <><span title={status.path}>{status.label}</span>
      {status.status !== 'ready' && <p role="status">{status.status === 'unavailable' ? 'Folder unavailable — reconnect the drive or choose another folder.' : 'Some files could not be listed, or the folder limit was reached.'}</p>}</> : <p>No folder linked.</p>}
    <div className="console__action-row">{editable ? <>
      <button disabled={busy || !bridge?.mediaFolders || isWebConsole()} title={isWebConsole() ? 'Choose folders in Console on the Mac.' : undefined} type="button" aria-label={scope === 'own' ? 'Choose avatar folder' : 'Choose shared folder'} onClick={() => void run('choose', scope)}>{status ? 'Change folder…' : 'Choose folder…'}</button>
      {status && <button disabled={busy} type="button" aria-label={scope === 'own' ? 'Unlink avatar folder' : 'Unlink shared folder'} onClick={() => void run('unlink', scope)}>Unlink folder</button>}
    </> : <button type="button" onClick={onSharedSettings} disabled={!onSharedSettings}>Configure shared folder</button>}</div>
  </section>
  const entries = view?.entries ?? []
  const resources = folderMediaSkill(undefined, entries).resources
  const matches = query.trim() ? rankMediaResources(resources, { query, kind: 'all' }, mediaClueKey, mediaPhoneticKey) : null
  const visible = matches ? matches.resources : resources
  const aliases = editing?.text.split('\n').map(line => line.trim()).filter(Boolean) ?? []
  const aliasesValid = validMediaAliases(aliases)
  return <section aria-label={avatarId ? 'Avatar folder library' : 'Global media folders'}>
    {!avatarId && <h3>Common media</h3>}
    {!avatarId && <div className="console__device-save console__action-row"><button type="button" className="console__primary" disabled={busy || !bridge?.mediaFolders} onClick={() => void run('save')}>Save folder settings</button>{saved && <span role="status">Folder settings saved.</span>}</div>}
    <details className="media-folder-settings" open={!avatarId || undefined}><summary>Folders</summary><div className="media-folder-grid">
      {avatarId && folder('own', view?.own, true)}
      {folder('shared', view?.shared, !avatarId)}
    </div><p className="console__muted">Folder choices save automatically. Music, videos and pictures inside are available, including subfolders.</p></details>
    <div className="media-file-toolbar"><input type="search" aria-label="Find folder media" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Find a file…" />
      <button type="button" disabled={busy || !bridge?.mediaFolders} onClick={() => void run('refresh')}>Refresh files</button></div>
    {!bridge?.mediaFolders && <p role="alert">Folder linking is unavailable. Restart the updated application.</p>}
    {error && <p role="alert" className="console__fault">{error}</p>}
    {avatarId && [view?.own, view?.shared].some(status => status && status.status !== 'ready') && <p role="alert">Some media is unavailable. Open Folders to check the connection.</p>}
    {entries.length + legacyCount > 512 && <p role="alert">This avatar has more than 512 media entries. Folder files take priority; some previously imported files are omitted. Remove unused imported entries below.</p>}
    {busy && <p role="status">Reading folders…</p>}
    {!resources.length && !busy && <p>No music, videos or pictures found. Choose a folder above, then put media files in it.</p>}
    {aliasSaved && <p role="status">Search aliases saved. They are available to the next lookup; no file was renamed.</p>}
    <ul className="media-file-list" aria-label="Media files">{visible.map(entry => <li key={entry.assetId} data-folder-media-id={entry.assetId} data-folder-media-kind={entry.kind}>{entry.name}</li>)}</ul>
    <details className="media-folder-settings"><summary>Search aliases</summary>
      <label>File<select aria-label="File for search aliases" value={editing?.assetId ?? ''} disabled={busy || !bridge?.mediaFolders} onChange={event => {
        const entry = resources.find(resource => resource.assetId === event.currentTarget.value)
        setEditing(entry ? { assetId: entry.assetId, text: entry.aliases.join('\n') } : null); setAliasSaved(false)
      }}><option value="">Choose a file…</option>{resources.map(entry => <option key={entry.assetId} value={entry.assetId}>{entry.name}</option>)}</select></label>
    {editing && <section aria-label="Edit media search aliases">
      <label>Search aliases<textarea aria-label="Media search aliases" rows={3} value={editing.text} disabled={busy} onChange={event => setEditing({ ...editing, text: event.currentTarget.value })} /></label>
      <p className="console__muted">One alternate title, pronunciation or English name per line. Up to 16 aliases, 120 characters each. Leave empty to remove aliases. Shared-file aliases apply to every avatar.</p>
      {!aliasesValid && <p role="alert">Enter up to 16 aliases, each at most 120 characters, without control characters.</p>}
      <div className="console__action-row"><button type="button" disabled={busy || !aliasesValid} onClick={() => void run('aliases', undefined, { assetId: editing.assetId, aliases })}>Save search aliases</button>
        <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel alias edits</button></div>
    </section>}</details>
    {resources.length > 0 && !visible.length && <p role="status">No matching files.</p>}
    {matches && matches.total > matches.resources.length && <p role="status">Showing the first 20 matches. Add more of the title to narrow the search.</p>}
    <details className="console__technical"><summary>Help</summary>
      <p>Ask to play music, a video or a picture by name. Similar Mandarin sounds, title/version clues and saved aliases can also find a file; exact names come first. Use the search box to test alternate wording. Say “停止播放” to stop.</p>
      <p>Music leaves the avatar visible. Videos and pictures fade it out. Pictures show uncropped for 15 seconds; ask to loop one to keep it displayed until stopped.</p>
      <p>New files appear within 30 seconds. Start a new conversation to give the avatar the updated list. Unlinking never deletes files.</p>
      <p>MP4, WebM, MP3, WAV, OGG, M4A, PNG, JPG, JPEG and WebP; up to 200 files per folder. Keep Google Drive files available offline.</p>
    </details>
  </section>
}
