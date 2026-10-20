#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function usage(message) {
  if (message) console.error(`ERROR: ${message}`)
  console.error('Usage: node preflight-v08-runtime.mjs --model-root <new-runtime> --baseline <old-runtime> [--output <report.json>] [--model3 <file>]')
  process.exit(2)
}

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) usage(`unknown argument: ${arg}`)
    const key = arg.slice(2)
    if (key === 'help') { console.log('Usage: node preflight-v08-runtime.mjs --model-root <new-runtime> --baseline <old-runtime> [--output <report.json>] [--model3 <file>]'); process.exit(0) }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) usage(`missing value for --${key}`)
    values[key] = value
    index += 1
  }
  return values
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase()
}

function asList(value) { return Array.isArray(value) ? value : value ? [value] : [] }

function referencedFiles(fileReferences) {
  const files = []
  for (const key of ['Moc', 'Physics', 'DisplayInfo', 'Pose', 'UserData']) for (const file of asList(fileReferences[key])) if (typeof file === 'string') files.push({ kind: key, file })
  for (const texture of asList(fileReferences.Textures)) if (typeof texture === 'string') files.push({ kind: 'Texture', file: texture })
  for (const expression of asList(fileReferences.Expressions)) if (expression?.File) files.push({ kind: 'Expression', file: expression.File })
  for (const group of Object.values(fileReferences.Motions ?? {})) for (const motion of asList(group)) if (motion?.File) files.push({ kind: 'Motion', file: motion.File })
  return files
}

function chooseModel3(root, explicit) {
  if (explicit) return path.resolve(explicit)
  const candidates = fs.readdirSync(root).filter((name) => name.endsWith('.model3.json')).sort()
  if (candidates.length !== 1) throw new Error(`expected_one_model3_json:found_${candidates.length}`)
  return path.join(root, candidates[0])
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args['model-root']) usage('--model-root is required')
  if (!args.baseline) usage('--baseline is required so the old v07 MOC cannot be mistaken for v08')
  const root = path.resolve(args['model-root'])
  const baseline = path.resolve(args.baseline)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) usage(`model root is not a directory: ${root}`)
  if (!fs.existsSync(baseline) || !fs.statSync(baseline).isDirectory()) usage(`baseline is not a directory: ${baseline}`)
  const model3Path = chooseModel3(root, args.model3)
  if (!fs.existsSync(model3Path)) throw new Error(`model3_missing:${model3Path}`)
  const model3 = JSON.parse(fs.readFileSync(model3Path, 'utf8'))
  const model3Root = path.dirname(model3Path)
  const refs = referencedFiles(model3.FileReferences ?? {})
  const missing = []
  const files = []
  for (const reference of refs) {
    const file = path.resolve(model3Root, reference.file)
    if (!file.startsWith(`${root}${path.sep}`) && file !== root) throw new Error(`reference_escapes_model_root:${reference.file}`)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) missing.push({ ...reference, resolved: file })
    else files.push({ ...reference, resolved: path.relative(root, file).replaceAll(path.sep, '/'), bytes: fs.statSync(file).size, sha256: sha256(file) })
  }
  const mocReference = refs.find((reference) => reference.kind === 'Moc')
  if (!mocReference) throw new Error('model3_has_no_moc_reference')
  const newMoc = path.resolve(model3Root, mocReference.file)
  const baselineMoc = path.resolve(baseline, mocReference.file)
  const baselineMocExists = fs.existsSync(baselineMoc) && fs.statSync(baselineMoc).isFile()
  const newMocSha = fs.existsSync(newMoc) ? sha256(newMoc) : null
  const baselineMocSha = baselineMocExists ? sha256(baselineMoc) : null
  const sameAsBaseline = Boolean(newMocSha && baselineMocSha && newMocSha === baselineMocSha)
  const report = {
    generatedAt: new Date().toISOString(),
    status: missing.length === 0 && !sameAsBaseline ? 'ready_for_core_qa' : 'blocked',
    modelRoot: root,
    baselineRoot: baseline,
    model3: path.relative(root, model3Path).replaceAll(path.sep, '/'),
    model3Sha256: sha256(model3Path),
    moc: { reference: mocReference.file, exists: Boolean(newMocSha), sha256: newMocSha, baselineExists: baselineMocExists, baselineSha256: baselineMocSha, sameAsBaseline },
    references: files,
    missing,
    next: missing.length === 0 && !sameAsBaseline ? 'Start the isolated capture page, then run run-v08-qa.mjs with this model root.' : 'Export a fresh Cubism model/atlas into a new runtime directory and rerun this preflight.',
  }
  const output = args.output ? path.resolve(args.output) : null
  if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`) }
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'ready_for_core_qa') process.exitCode = 1
}

try { main() } catch (error) { console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 }
