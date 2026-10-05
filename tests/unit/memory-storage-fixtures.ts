import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

/** Compile only storage-owned sources for real node:worker_threads tests. */
export function compileStorageWorker(directory: string): string {
  for (const relative of ['main/memory/store', 'main/memory/storage-worker', 'shared/memory']) {
    const source = join(process.cwd(), 'src', `${relative}.ts`)
    const output = join(directory, 'src', `${relative === 'main/memory/storage-worker' ? 'main/memory/memory-storage-worker' : relative}.js`)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, transpileModule(readFileSync(source, 'utf8'), {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2023 }
    }).outputText)
  }
  return join(directory, 'src', 'main', 'memory', 'memory-storage-worker.js')
}
