#!/usr/bin/env node

import { createRequire } from 'node:module'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const MAX_MANIFEST_BYTES = 1 * 1024 * 1024
const MAX_FILE_BYTES = 128 * 1024 * 1024
const MAX_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_REFERENCED_FILES = 255
const REQUIRED_MOTION_GROUPS = [
  'Dormant',
  'Waking',
  'Listening',
  'Thinking',
  'Speaking',
  'Scene',
  'Suspending',
]
const REQUIRED_PROFILE_EXPRESSIONS = ['exp_01', 'exp_02', 'exp_03', 'exp_04', 'exp_05']

function failure(reason, details = {}) {
  return { ok: false, scope: 'static', reason, ...details }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    return {
      ok: true,
      help: true,
      scope: 'static',
      usage: 'node validate-bundle.mjs --project <root> --model <absolute model3.json>',
    }
  }
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--project' && flag !== '--model') return failure('cli_invalid')
    const value = argv[index + 1]
    if (!value || value.startsWith('--') || args[flag.slice(2)] !== undefined) {
      return failure('cli_invalid')
    }
    args[flag.slice(2)] = value
    index += 1
  }
  if (!args.project || !args.model) return failure('cli_invalid')
  return { ok: true, ...args }
}

function pathInside(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function looksSecretSegment(segment) {
  const lower = segment.toLowerCase()
  return lower === '.env'
    || lower.startsWith('.env.')
    || lower === '.git'
    || lower === 'secrets'
    || lower === 'secret'
    || lower === 'credentials'
    || lower === 'id_rsa'
    || lower === 'id_dsa'
    || lower === 'credentials.json'
    || lower === 'secrets.json'
    || lower.endsWith('.pem')
    || lower.endsWith('.key')
    || lower.endsWith('.p12')
    || lower.endsWith('.pfx')
}

function safeReference(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/') || /^[a-z]:/iu.test(value)) return false
  const segments = value.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  if (segments.some((segment) => !/^[a-zA-Z0-9_][a-zA-Z0-9_. -]*$/u.test(segment))) return false
  if (segments.some((segment) => segment.endsWith('.') || segment.endsWith(' '))) return false
  if (segments.some(looksSecretSegment)) return false
  return true
}

function collectFileReferences(fileReferences) {
  const references = new Set()
  function visit(value, key) {
    if (typeof value === 'string') {
      if (key !== 'Name') references.add(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, undefined)
      return
    }
    if (isRecord(value)) {
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey)
    }
  }
  visit(fileReferences, undefined)
  return [...references]
}

async function lstatNoSymlink(root, relativePath) {
  const rootInfo = await fs.lstat(root)
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) return { ok: false, reason: 'avatar_asset_path_invalid' }
  const segments = relativePath.split('/')
  let current = root
  for (const segment of segments) {
    current = path.join(current, segment)
    let info
    try {
      info = await fs.lstat(current)
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { ok: false, reason: 'avatar_asset_missing' }
      return { ok: false, reason: 'avatar_asset_path_invalid' }
    }
    if (info.isSymbolicLink()) return { ok: false, reason: 'avatar_asset_path_invalid' }
    if (current !== path.join(root, ...segments) && !info.isDirectory()) {
      return { ok: false, reason: 'avatar_asset_path_invalid' }
    }
  }
  return { ok: true, info: await fs.lstat(path.join(root, ...segments)) }
}

async function checkReferencedFiles(modelDirectory, files, nonEmptyFiles) {
  let totalBytes = 0
  const checked = []
  for (const reference of files) {
    if (!safeReference(reference)) return failure('avatar_asset_path_invalid')
    const candidate = path.resolve(modelDirectory, ...reference.split('/'))
    if (!pathInside(modelDirectory, candidate)) return failure('avatar_asset_path_invalid')
    const checkedFile = await lstatNoSymlink(modelDirectory, reference)
    if (!checkedFile.ok) return failure(checkedFile.reason)
    if (!checkedFile.info.isFile()) return failure('avatar_asset_path_invalid')
    if (checkedFile.info.size > MAX_FILE_BYTES) return failure('avatar_bundle_file_too_large')
    if (nonEmptyFiles.has(reference) && checkedFile.info.size === 0) return failure('avatar_asset_empty')
    totalBytes += checkedFile.info.size
    if (totalBytes > MAX_TOTAL_BYTES) return failure('avatar_bundle_too_large')
    checked.push({ path: reference, bytes: checkedFile.info.size })
  }
  for (const file of checked) {
    if (!file.path.toLowerCase().endsWith('.json')) continue
    try {
      JSON.parse(await fs.readFile(path.join(modelDirectory, ...file.path.split('/')), 'utf8'))
    } catch {
      return failure('avatar_asset_json_invalid')
    }
  }
  return { ok: true, totalBytes, checked }
}

async function loadPureValidator(projectRoot) {
  const sourcePath = path.join(projectRoot, 'src', 'main', 'avatar', 'model-bundle.ts')
  const source = await fs.readFile(sourcePath, 'utf8')
  if (/^\s*import\s/mu.test(source) || /\brequire\s*\(/u.test(source) || /\bimport\s*\(/u.test(source)) {
    return failure('validator_module_not_pure')
  }
  const requireFromProject = createRequire(pathToFileURL(path.join(projectRoot, 'package.json')).href)
  const typescript = requireFromProject('typescript')
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2020,
    },
  }).outputText
  const module = { exports: {} }
  const exports = module.exports
  vm.runInNewContext(transpiled, { module, exports, Object, Array, Set }, { filename: sourcePath })
  const validator = module.exports.validateCubismModelBundle
  if (typeof validator !== 'function') return failure('validator_module_invalid')
  return { ok: true, validate: validator }
}

function modelMetadata(model) {
  const fileReferences = isRecord(model) && isRecord(model.FileReferences) ? model.FileReferences : {}
  const motions = isRecord(fileReferences.Motions) ? fileReferences.Motions : {}
  const motionFirstFiles = Object.fromEntries(REQUIRED_MOTION_GROUPS.map((group) => {
    const entries = Array.isArray(motions[group]) ? motions[group] : []
    const first = isRecord(entries[0]) ? entries[0].File : undefined
    return [group, typeof first === 'string' ? first : null]
  }))
  const expressions = Array.isArray(fileReferences.Expressions)
    ? fileReferences.Expressions
      .filter(isRecord)
      .map((entry) => entry.Name)
      .filter((name) => typeof name === 'string')
    : []
  const groups = Array.isArray(model?.Groups) ? model.Groups : []
  const parameters = { EyeBlink: [], LipSync: [] }
  for (const group of groups) {
    if (!isRecord(group) || group.Target !== 'Parameter' || (group.Name !== 'EyeBlink' && group.Name !== 'LipSync')) continue
    parameters[group.Name] = Array.isArray(group.Ids) ? group.Ids.filter((id) => typeof id === 'string') : []
  }
  return {
    motionGroups: Object.keys(motions),
    motionFirstFiles,
    parameters,
    expressionNames: expressions,
  }
}

async function validate(args) {
  const projectRoot = path.resolve(args.project)
  const modelPath = path.resolve(args.model)
  const modelDirectory = path.dirname(modelPath)
  const manifestName = path.basename(modelPath)
  if (!path.isAbsolute(args.model)) return failure('model_path_invalid')
  try {
    const projectInfo = await fs.lstat(projectRoot)
    if (!projectInfo.isDirectory() || projectInfo.isSymbolicLink()) return failure('project_path_invalid')
    if (!modelPath.toLowerCase().endsWith('.model3.json')) {
      return failure('model_path_invalid')
    }
    const modelDirectoryInfo = await fs.lstat(modelDirectory)
    if (!modelDirectoryInfo.isDirectory() || modelDirectoryInfo.isSymbolicLink()) {
      return failure('model_path_invalid')
    }
    if (!safeReference(manifestName)) return failure('avatar_model_manifest_invalid')
    const modelInfo = await fs.lstat(modelPath)
    if (modelInfo.isSymbolicLink() || !modelInfo.isFile()) return failure('model_path_invalid')
    if (modelInfo.size > MAX_MANIFEST_BYTES) return failure('avatar_model_manifest_invalid')
  } catch {
    return failure('model_path_invalid')
  }

  let model
  try {
    model = JSON.parse(await fs.readFile(modelPath, 'utf8'))
  } catch {
    return failure('avatar_model_manifest_invalid')
  }
  if (!isRecord(model) || !isRecord(model.FileReferences)) return failure('avatar_model_manifest_invalid')

  const references = collectFileReferences(model.FileReferences)
  const allFiles = [...new Set([manifestName, ...references])]
  if (references.length > MAX_REFERENCED_FILES) return failure('avatar_bundle_too_large')
  const nonEmptyFiles = new Set()
  if (typeof model.FileReferences.Moc === 'string') nonEmptyFiles.add(model.FileReferences.Moc)
  if (Array.isArray(model.FileReferences.Textures)) {
    for (const texture of model.FileReferences.Textures) {
      if (typeof texture === 'string') nonEmptyFiles.add(texture)
    }
  }
  const fileCheck = await checkReferencedFiles(modelDirectory, allFiles, nonEmptyFiles)
  if (!fileCheck.ok) return fileCheck

  let validator
  try {
    validator = await loadPureValidator(projectRoot)
  } catch {
    return failure('validator_module_invalid')
  }
  if (!validator.ok) return validator
  const basicResult = validator.validate({ model3: model, files: new Set(references) })
  const metadata = modelMetadata(model)
  const basic = {
    ok: basicResult.ok,
    ...(basicResult.ok ? {} : { reason: basicResult.reason }),
    motionGroups: metadata.motionGroups,
    motionFirstFiles: metadata.motionFirstFiles,
    parameters: metadata.parameters,
    referenceCount: references.length,
    fileCount: allFiles.length,
    totalBytes: fileCheck.totalBytes,
  }
  const profileMissingExpressions = REQUIRED_PROFILE_EXPRESSIONS.filter(
    (name) => !metadata.expressionNames.includes(name),
  )
  const profile = {
    ok: basic.ok && profileMissingExpressions.length === 0,
    ...(basic.ok
      ? profileMissingExpressions.length === 0
        ? {}
        : { reason: 'magic_mirror_profile_expressions_missing', missingExpressions: profileMissingExpressions }
      : { reason: 'magic_mirror_profile_base_invalid' }),
    requiredExpressions: REQUIRED_PROFILE_EXPRESSIONS,
    expressionNames: metadata.expressionNames,
  }
  if (!basic.ok) return { ok: false, scope: 'static', reason: basic.reason, basic, profile }
  if (!profile.ok) return { ok: false, scope: 'static', reason: profile.reason, basic, profile }
  return { ok: true, scope: 'static', basic, profile }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) return parsed
  if (parsed.help) return parsed
  try {
    return await validate(parsed)
  } catch {
    return failure('validator_runtime_failed')
  }
}

const result = await main()
process.stdout.write(`${JSON.stringify(result)}\n`)
process.exitCode = result.ok ? 0 : 1
