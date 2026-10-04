import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path'
const writeFileAtomic = require('write-file-atomic') as (path: string, value: string, options: { mode: number }) => Promise<void>
import type { FolderMediaEntry, MediaFolderStatus, MediaFoldersView } from '../../shared/media-folders'

const formats: Record<string, { kind: 'video' | 'music'; mimeType: string }> = {
  '.mp4': { kind: 'video', mimeType: 'video/mp4' }, '.webm': { kind: 'video', mimeType: 'video/webm' },
  '.mp3': { kind: 'music', mimeType: 'audio/mpeg' }, '.wav': { kind: 'music', mimeType: 'audio/wav' },
  '.ogg': { kind: 'music', mimeType: 'audio/ogg' }, '.m4a': { kind: 'music', mimeType: 'audio/mp4' },
}
const inside = (root: string, path: string) => { const child = relative(root, path); return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child)) }
const validOwner = (owner: string) => owner === 'shared' || /^avatar:[a-z0-9][a-z0-9._-]{0,95}$/.test(owner)
type Indexed = { entry: Omit<FolderMediaEntry, 'origin'>; path: string; mimeType: string; size: number; mtime: number }
type Source = { status: MediaFolderStatus; files: Indexed[] }

/** Only explicit operator-selected roots are read. Paths stay in Main and Console. */
export class MediaFolders {
  private links: Record<string, string> = {}
  private sources = new Map<string, Source>()
  private queue: Promise<unknown> = Promise.resolve()
  private failure = ''
  constructor(private readonly configPath: string) {}
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation); this.queue = next.catch(() => undefined); return next
  }
  async load(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.configPath, 'utf8'))
      if (value.version !== 1 || !value.links || typeof value.links !== 'object' || Array.isArray(value.links)
        || Object.keys(value.links).length > 33 || !Object.entries(value.links).every(([owner, path]) => validOwner(owner) && typeof path === 'string' && isAbsolute(path))) throw Error()
      this.links = value.links
      const paths = Object.values(this.links)
      if (paths.some((path, i) => paths.some((other, j) => i !== j && inside(path, other)))) throw Error()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.links = {}; this.failure = 'media_folder_config_unreadable' }
    }
    await this.refresh()
  }
  private async save(links: Record<string, string>): Promise<void> {
    if (this.failure) throw Error(this.failure)
    await mkdir(dirname(this.configPath), { recursive: true })
    await writeFileAtomic(this.configPath, JSON.stringify({ version: 1, links }), { mode: 0o600 })
    this.links = links
  }
  link(owner: string, path: string): Promise<void> {
    return this.run(async () => {
      if (!validOwner(owner)) throw Error('media_folder_owner_invalid')
      if (!(owner in this.links) && Object.keys(this.links).length >= 33) throw Error('media_folder_link_limit')
      const root = await realpath(path)
      if (!(await lstat(root)).isDirectory()) throw Error('media_folder_not_directory')
      if (Object.entries(this.links).some(([key, other]) => key !== owner && (inside(root, other) || inside(other, root)))) throw Error('media_folder_overlap')
      await this.save({ ...this.links, [owner]: root })
      this.sources.set(owner, await this.scan(root, owner))
    })
  }
  unlink(owner: string): Promise<void> {
    return this.run(async () => {
      const next = { ...this.links }; delete next[owner]
      await this.save(next); this.sources.delete(owner)
    })
  }
  refresh(): Promise<void> {
    return this.run(async () => {
      for (const [owner, root] of Object.entries(this.links)) this.sources.set(owner, await this.scan(root, owner))
    })
  }
  saveCurrent(): Promise<void> {
    return this.run(async () => {
      await this.save({ ...this.links })
      for (const [owner, root] of Object.entries(this.links)) this.sources.set(owner, await this.scan(root, owner))
    })
  }
  private async scan(root: string, owner: string): Promise<Source> {
    const files: Indexed[] = []
    let skipped = 0, visited = 0, partial = false
    const status = (state: MediaFolderStatus['status'], reason: string): Source => ({ files, status: {
      label: basename(root), path: root, status: state, count: files.length, skipped, reason, scannedAt: new Date().toISOString(),
    } })
    try {
      if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw Error()
      const walk = async (directory: string, depth: number): Promise<void> => {
        const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
        for (const item of entries) {
          if (++visited > 5000 || files.length >= 200) { partial = true; return }
          if (item.name.startsWith('.') || item.isSymbolicLink()) { skipped++; continue }
          const path = join(directory, item.name)
          if (item.isDirectory()) {
            if (depth >= 8) { partial = true; skipped++; continue }
            try { if (await realpath(path) !== path) throw Error(); await walk(path, depth + 1) }
            catch { partial = true; skipped++ }
            continue
          }
          const format = formats[extname(item.name).toLowerCase()]
          if (!item.isFile() || !format) { skipped++; continue }
          try {
            const info = await lstat(path)
            if (!info.isFile() || info.size === 0) { partial = true; skipped++; continue }
            const assetId = 'folder-' + createHash('sha256').update(`${owner}\0${root}\0${relative(root, path)}`).digest('hex').slice(0, 40)
            const name = basename(item.name, extname(item.name)).replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, 100) || 'Media'
            files.push({ path, ...format, size: info.size, mtime: info.mtimeMs, entry: { kind: format.kind, assetId, name, aliases: [] } })
          } catch { partial = true; skipped++ }
        }
      }
      await walk(root, 0)
      return status(partial ? 'partial' : 'ready', partial ? 'media_folder_partial_or_limit' : 'media_folder_ready')
    } catch { files.length = 0; return status('unavailable', 'media_folder_unavailable') }
  }
  resources(avatarId?: string): FolderMediaEntry[] {
    return [
      ...(avatarId ? this.sources.get(`avatar:${avatarId}`)?.files ?? [] : []).map(f => ({ ...f.entry, origin: 'own' as const })),
      ...(this.sources.get('shared')?.files ?? []).map(f => ({ ...f.entry, origin: 'shared' as const })),
    ]
  }
  view(avatarId?: string): MediaFoldersView {
    return structuredClone({ own: this.sources.get(`avatar:${avatarId}`)?.status ?? null,
      shared: this.sources.get('shared')?.status ?? null, entries: this.resources(avatarId), ...(this.failure ? { reason: this.failure } : {}) })
  }
  health(): MediaFolderStatus['status'] {
    if (this.failure || [...this.sources.values()].some(source => source.status.status === 'unavailable')) return 'unavailable'
    return [...this.sources.values()].some(source => source.status.status === 'partial') ? 'partial' : 'ready'
  }
  async resolve(id: string, avatarId?: string, preview = false): Promise<{ path: string; mimeType: string } | null> {
    for (const [owner, source] of this.sources) {
      if (!preview && owner !== 'shared' && owner !== `avatar:${avatarId}`) continue
      const file = source.files.find(f => f.entry.assetId === id)
      if (!file) continue
      try {
        const root = this.links[owner]!
        if (await realpath(root) !== root || await realpath(file.path) !== file.path || !inside(root, file.path)) return null
        const info = await lstat(file.path)
        if (!info.isFile() || info.size !== file.size || info.mtimeMs !== file.mtime) return null
        return { path: file.path, mimeType: file.mimeType }
      } catch { return null }
    }
    return null
  }
}
