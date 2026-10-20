import * as React from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import { folderMediaSkill, type MediaFolderCommand, type MediaFolderStatus, type MediaFoldersView } from '../../shared/media-folders'

const explanations: Record<string, string> = {
  media_folder_overlap: 'Choose separate folders. A shared folder cannot contain an avatar’s folder, and avatars cannot link overlapping folders.',
  media_folder_save_avatar_first: 'Save this new avatar first, then choose its folder.',
  media_folder_config_unreadable: 'Saved folder links could not be read. Existing links were preserved; check the application storage.',
  media_folder_unavailable: 'This folder cannot be read. Check that it exists and Google Drive is connected, or choose another folder.',
}

export function MediaFoldersPanel({ bridge, avatarId, avatarName, legacyCount = 0, onSharedSettings }: {
  bridge: ConsoleBridge | null; avatarId?: string; avatarName?: string; legacyCount?: number; onSharedSettings?(): void
}): React.JSX.Element {
  const [view, setView] = React.useState<MediaFoldersView | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const pending = React.useRef(false), generation = React.useRef(0)
  const run = async (action: MediaFolderCommand['action'], scope?: 'own' | 'shared') => {
    if (!bridge?.mediaFolders || pending.current) return
    const current = ++generation.current
    pending.current = true; setBusy(true)
    if (action !== 'get') setSaved(false)
    try {
      const result = await bridge.mediaFolders({ action, ...(avatarId ? { avatarId } : {}), ...(scope ? { scope } : {}) })
      if (current !== generation.current) return
      if (result.ok) { setView(result.value); setError(result.value.reason ? explanations[result.value.reason] ?? result.value.reason : ''); if (action === 'save' && !result.value.reason) setSaved(true) }
      else { const reason = result.fields?.[0]?.message ?? result.reason; setError(explanations[reason] ?? `Folder setup failed: ${reason}`) }
    } catch { if (current === generation.current) setError('Could not reach the folder library. Try Refresh files.') }
    finally { if (current === generation.current) { pending.current = false; setBusy(false) } }
  }
  React.useEffect(() => {
    void run('get')
    const timer = setInterval(() => void run('get'), 30000)
    return () => { clearInterval(timer); generation.current++; pending.current = false }
  }, [bridge, avatarId])
  const folder = (scope: 'own' | 'shared', status: MediaFolderStatus | null | undefined, editable: boolean) => <section className="media-folder-card" aria-label={scope === 'own' ? 'Avatar media folder' : 'Shared media folder'}>
    <h4>{scope === 'own' ? `${avatarName || 'Avatar'}’s folder` : 'Common folder'}</h4>
    {status ? <><span title={status.path}>{status.label}</span>
      {status.status !== 'ready' && <p role="status">{status.status === 'unavailable' ? 'Folder unavailable — reconnect the drive or choose another folder.' : 'Some files could not be listed, or the folder limit was reached.'}</p>}</> : <p>No folder linked.</p>}
    <div className="console__action-row">{editable ? <>
      <button disabled={busy || !bridge?.mediaFolders} type="button" aria-label={scope === 'own' ? 'Choose avatar folder' : 'Choose shared folder'} onClick={() => void run('choose', scope)}>{status ? 'Change folder…' : 'Choose folder…'}</button>
      {status && <button disabled={busy} type="button" aria-label={scope === 'own' ? 'Unlink avatar folder' : 'Unlink shared folder'} onClick={() => void run('unlink', scope)}>Unlink folder</button>}
    </> : <button type="button" onClick={onSharedSettings} disabled={!onSharedSettings}>Configure shared folder</button>}</div>
  </section>
  const entries = view?.entries ?? []
  const resources = folderMediaSkill(undefined, entries).resources
  return <section aria-label={avatarId ? 'Avatar folder library' : 'Global media folders'}>
    {!avatarId && <h3>Common media</h3>}
    {!avatarId && <div className="console__device-save console__action-row"><button type="button" className="console__primary" disabled={busy || !bridge?.mediaFolders} onClick={() => void run('save')}>Save folder settings</button>{saved && <span role="status">Folder settings saved.</span>}</div>}
    <details className="media-folder-settings" open={!avatarId || undefined}><summary>Folders</summary><div className="media-folder-grid">
      {avatarId && folder('own', view?.own, true)}
      {folder('shared', view?.shared, !avatarId)}
    </div><p className="console__muted">Folder choices save automatically. All music and videos inside are available, including subfolders.</p></details>
    <div className="media-file-toolbar"><input type="search" aria-label="Find folder media" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Find a file…" />
      <button type="button" disabled={busy || !bridge?.mediaFolders} onClick={() => void run('refresh')}>Refresh files</button></div>
    {!bridge?.mediaFolders && <p role="alert">Folder linking is unavailable. Restart the updated application.</p>}
    {error && <p role="alert" className="console__fault">{error}</p>}
    {avatarId && [view?.own, view?.shared].some(status => status && status.status !== 'ready') && <p role="alert">Some media is unavailable. Open Folders to check the connection.</p>}
    {entries.length + legacyCount > 512 && <p role="alert">This avatar has more than 512 media entries. Folder files take priority; some previously imported files are omitted. Remove unused imported entries below.</p>}
    {busy && <p role="status">Reading folders…</p>}
    {!resources.length && !busy && <p>No music or videos found. Choose a folder above, then put media files in it.</p>}
    <ul className="media-file-list" aria-label="Media files">{resources.filter(entry => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(entry => <li key={entry.assetId} data-folder-media-id={entry.assetId} data-folder-media-kind={entry.kind}>{entry.name}</li>)}</ul>
    {resources.length > 0 && !resources.some(entry => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <p role="status">No matching files.</p>}
    <details className="console__technical"><summary>Help</summary>
      <p>Say “Play [filename]”, “Loop [filename]” or “Stop media”. Video fades the avatar out; music leaves it visible.</p>
      <p>New files appear within 30 seconds. Start a new conversation to give the avatar the updated list. Unlinking never deletes files.</p>
      <p>MP4, WebM, MP3, WAV, OGG and M4A; up to 200 files per folder. Keep Google Drive files available offline.</p>
    </details>
  </section>
}
