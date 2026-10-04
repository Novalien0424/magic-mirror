import * as React from 'react'
import type { ConsoleBridge } from '../../shared/bridge'
import { folderMediaSkill, type MediaFolderCommand, type MediaFolderStatus, type MediaFoldersView } from '../../shared/media-folders'
import { MediaPreview } from './MediaPreview'

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
  const pending = React.useRef(false), generation = React.useRef(0)
  const run = async (action: MediaFolderCommand['action'], scope?: 'own' | 'shared') => {
    if (!bridge?.mediaFolders || pending.current) return
    const current = ++generation.current
    pending.current = true; setBusy(true)
    try {
      const result = await bridge.mediaFolders({ action, ...(avatarId ? { avatarId } : {}), ...(scope ? { scope } : {}) })
      if (current !== generation.current) return
      if (result.ok) { setView(result.value); setError(result.value.reason ? explanations[result.value.reason] ?? result.value.reason : '') }
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
    <h4>{scope === 'own' ? `${avatarName || 'Avatar'}’s folder` : 'Shared media folder'}</h4>
    <p>{scope === 'own' ? 'Only this avatar can play these files.' : 'Every avatar can play these files.'}</p>
    {status ? <><strong>{status.label}</strong><p className="media-folder-path">{status.path}</p>
      <p role="status">{status.status === 'unavailable' ? 'Folder unavailable — reconnect the drive or choose another folder.' : `${status.count} music / video files · ${status.status === 'partial' ? 'Some files could not be listed, or the folder limit was reached.' : 'Ready'}`}</p>
      {status.skipped > 0 && <p className="console__muted">{status.skipped} unsupported, hidden or unreadable entries skipped.</p>}</> : <p>No folder linked.</p>}
    <div className="console__action-row">{editable ? <>
      <button disabled={busy || !bridge?.mediaFolders} type="button" aria-label={scope === 'own' ? 'Choose avatar folder' : 'Choose shared folder'} onClick={() => void run('choose', scope)}>{status ? 'Change folder…' : 'Choose folder…'}</button>
      {status && <button disabled={busy} type="button" aria-label={scope === 'own' ? 'Unlink avatar folder' : 'Unlink shared folder'} onClick={() => void run('unlink', scope)}>Unlink folder</button>}
    </> : <button type="button" onClick={onSharedSettings} disabled={!onSharedSettings}>Configure shared folder</button>}</div>
  </section>
  const entries = view?.entries ?? []
  const resources = folderMediaSkill(undefined, entries).resources
  return <section aria-label={avatarId ? 'Avatar folder library' : 'Global media folders'}>
    <h3>{avatarId ? 'Media folders' : 'Shared media for all avatars'}</h3>
    <p>Choose any folder on this Mac, including Google Drive. All supported music and videos inside it are available automatically.</p>
    <div className="media-folder-grid">
      {avatarId && folder('own', view?.own, true)}
      {folder('shared', view?.shared, !avatarId)}
    </div>
    <p className="console__muted">Folder links save immediately. New files appear within 30 seconds, or use Refresh files. The avatar receives the updated list at its next conversation. Unlinking never deletes your files.</p>
    <details><summary>Supported files and Google Drive</summary><p>Video: MP4, WebM. Music: MP3, WAV, OGG, M4A. Subfolders are included, up to 200 media files per linked folder. Shortcuts and hidden files are skipped. Keep Google Drive folders available offline for reliable playback.</p></details>
    <div className="console__action-row"><button type="button" disabled={busy || !bridge?.mediaFolders} onClick={() => void run('refresh')}>Refresh files</button>
      <label>Find media<input aria-label="Find folder media" value={query} onChange={event => setQuery(event.currentTarget.value)} placeholder="Search filenames…" /></label></div>
    {!bridge?.mediaFolders && <p role="alert">Folder linking is unavailable. Restart the updated application.</p>}
    {error && <p role="alert" className="console__fault">{error}</p>}
    {entries.length + legacyCount > 512 && <p role="alert">This avatar has more than 512 media entries. Folder files take priority; some previously imported files are omitted. Remove unused imported entries below.</p>}
    {busy && <p role="status">Reading folders…</p>}
    {!resources.length && !busy && <p>No music or videos found. Choose a folder above, then put media files in it.</p>}
    <div className="media-skill-choices">{resources.filter(entry => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(entry => <article key={entry.assetId} className="media-skill-choice" data-folder-media-id={entry.assetId} data-folder-media-kind={entry.kind}>
      <strong>{entry.name}</strong><p>{entries.find(item => item.assetId === entry.assetId)?.origin === 'own' ? 'Avatar folder' : 'Shared folder'} · {entry.kind === 'video' ? 'Video' : 'Music'}</p>
      <p>“Play {entry.name}” · “Loop {entry.name}”</p>
      <MediaPreview kind={entry.kind} id={entry.assetId} name={entry.name} gain={0.7} />
    </article>)}</div>
    <p>Video fades the avatar out; music leaves it visible. Say “Stop media” to stop. Rename a file in its folder to change its spoken name.</p>
  </section>
}
