import { randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { AvatarModel } from '../../shared/avatar-profiles'
import { validateCubismModelBundle } from './model-bundle'
import { avatarLibraryName, parseAvatarLibraryLabel, parseAvatarLibraryLabelRequest, type AvatarLibrary, type AvatarLibraryLabel } from '../../shared/avatar-library'

const writeFileAtomic = require('write-file-atomic') as (path: string, value: string) => Promise<void>
const LABEL_FILE = 'avatar-label.json'

async function readLabel(root: string): Promise<AvatarLibraryLabel | null> {
  try { await lstat(join(root, LABEL_FILE)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  const path = await safeAvatarFile(root, LABEL_FILE)
  if ((await lstat(path)).size > 4096) throw new Error('avatar_label_invalid')
  const label = parseAvatarLibraryLabel(JSON.parse(await readFile(path, 'utf8')))
  if (!label) throw new Error('avatar_label_invalid')
  return label
}

export async function saveAvatarModelLabel(storageRoot: string, value: unknown): Promise<AvatarModel> {
  const request = parseAvatarLibraryLabelRequest(value)
  if (!request) throw new Error('avatar_label_invalid')
  const storageStat = await lstat(storageRoot)
  if (!storageStat.isDirectory() || storageStat.isSymbolicLink()) throw new Error('avatar_asset_path_invalid')
  const root = join(storageRoot, request.id)
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('avatar_asset_path_invalid')
  const manifests = (await readdir(root)).filter(file => file.endsWith('.model3.json'))
  if (manifests.length !== 1) throw new Error('avatar_model_manifest_invalid')
  const manifestFileName = manifests[0]
  const files = await inspect(root, manifestFileName)
  if (files.some(file => file.toLowerCase() === LABEL_FILE)) throw new Error('avatar_label_reserved_path')
  try { await safeAvatarFile(root, LABEL_FILE) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const label = { name: request.name, version: request.version }
  await writeFileAtomic(join(root, LABEL_FILE), JSON.stringify(label, null, 2) + '\n')
  return { id: request.id, name: avatarLibraryName(label), manifestFileName, files }
}

const safeFile = (file: string): boolean => file.length <= 256 && file.split('/').every(
  part => /^[a-zA-Z0-9_][a-zA-Z0-9_. -]*$/.test(part) && !part.endsWith('.') && !part.endsWith(' '))

function references(model: unknown): string[] {
  if (!model || typeof model !== 'object') throw new Error('avatar_model_manifest_invalid')
  const refs = (model as { FileReferences?: unknown }).FileReferences
  const files = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (!safeFile(value)) throw new Error('avatar_asset_path_invalid')
      files.add(value)
    } else if (Array.isArray(value)) value.forEach(walk)
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        // Expression names are labels; all other string references are files.
        if (key !== 'Name') walk(child)
      }
    }
  }
  walk(refs)
  if (files.size > 255) throw new Error('avatar_bundle_too_large')
  return [...files].sort()
}

/** Walk every path component; a symlink/junction can never escape the managed root. */
export async function safeAvatarFile(root: string, file: string): Promise<string> {
  if (!safeFile(file)) throw new Error('avatar_asset_path_invalid')
  let path = resolve(root)
  const rootStat = await lstat(path)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('avatar_asset_path_invalid')
  const parts = file.split('/')
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i])
    const stat = await lstat(path)
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('avatar_asset_path_invalid')
    if (stat.isFile() && stat.size > 128 * 1024 * 1024) throw new Error('avatar_bundle_too_large')
  }
  return path
}

async function inspect(root: string, manifest: string): Promise<string[]> {
  const path = await safeAvatarFile(root, manifest)
  if ((await lstat(path)).size > 1024 * 1024) throw new Error('avatar_bundle_too_large')
  const model = JSON.parse(await readFile(path, 'utf8'))
  const files = [...new Set([manifest, ...references(model)])]
  const validation = validateCubismModelBundle({ model3: model, files: new Set(files) })
  if (!validation.ok) throw new Error(validation.reason)
  let total = 0
  for (const file of files) {
    total += (await lstat(await safeAvatarFile(root, file))).size
    if (total > 512 * 1024 * 1024) throw new Error('avatar_bundle_too_large')
  }
  return files
}

export async function importAvatarModel(manifestPath: string, storageRoot: string): Promise<AvatarModel> {
  const name = basename(manifestPath)
  if (!name.endsWith('.model3.json') || !safeFile(name)) throw new Error('avatar_model_manifest_invalid')
  const sourceRoot = dirname(resolve(manifestPath))
  const files = await inspect(sourceRoot, name)
  if (files.some(file => file.toLowerCase() === LABEL_FILE)) throw new Error('avatar_label_reserved_path')
  const label = await readLabel(sourceRoot)
  await mkdir(storageRoot, { recursive: true })
  const staging = await mkdtemp(join(resolve(storageRoot), '.import-'))
  try {
    for (const file of files) {
      const target = join(staging, file)
      await mkdir(dirname(target), { recursive: true })
      await copyFile(await safeAvatarFile(sourceRoot, file), target)
    }
    await inspect(staging, name)
    if (label) await writeFileAtomic(join(staging, LABEL_FILE), JSON.stringify(label, null, 2) + '\n')
    const id = 'model-' + randomUUID()
    await rename(staging, join(storageRoot, id))
    return { id, name: label ? avatarLibraryName(label) : name.replace(/\.model3\.json$/, '').slice(0, 80), manifestFileName: name, files }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

export async function verifyAvatarModel(model: AvatarModel, storageRoot: string): Promise<boolean> {
  try {
    if (!/^model-[a-z0-9-]{1,80}$/.test(model.id)) return false
    const files = await inspect(join(storageRoot, model.id), model.manifestFileName)
    return files.length === model.files.length && files.every(file => model.files.includes(file))
  } catch { return false }
}

/** Rediscover completed imports without saving or publishing an operator draft. */
export async function listAvatarModels(storageRoot: string): Promise<AvatarLibrary> {
  let entries: string[]
  try {
    const stat = await lstat(storageRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('avatar_asset_path_invalid')
    entries = await readdir(storageRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { models: [], rejectedCount: 0 }
    throw error
  }
  const models: AvatarModel[] = []
  const labels: Record<string, AvatarLibraryLabel> = {}
  let labelWarningCount = 0
  let rejectedCount = 0
  for (const id of entries.sort()) {
    if (!/^model-[a-z0-9-]{1,80}$/.test(id)) continue
    try {
      const root = join(storageRoot, id)
      const stat = await lstat(root)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('avatar_asset_path_invalid')
      const manifests = (await readdir(root)).filter(file => file.endsWith('.model3.json'))
      if (manifests.length !== 1) throw new Error('avatar_model_manifest_invalid')
      const manifestFileName = manifests[0]
      const files = await inspect(root, manifestFileName)
      let label: AvatarLibraryLabel | null = null
      try { label = await readLabel(root) } catch { labelWarningCount += 1 }
      if (label) labels[id] = label
      models.push({ id, name: label ? avatarLibraryName(label) : manifestFileName.replace(/\.model3\.json$/, '').slice(0, 80), manifestFileName, files })
    } catch { rejectedCount += 1 }
  }
  return { models, rejectedCount, ...(Object.keys(labels).length ? { labels } : {}), ...(labelWarningCount ? { labelWarningCount } : {}) }
}
