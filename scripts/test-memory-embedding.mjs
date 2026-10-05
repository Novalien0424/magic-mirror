#!/usr/bin/env node
/** Synthetic-only Mac smoke through the production Main launcher; logs aggregates only. */
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const args = process.argv.slice(2)
let embedder
let failed = false
try {
  if (args.length && (args.length !== 2 || args[0] !== '--runtime-directory')) throw Error('invalid_options')
  const runtimeDirectory = args.length ? resolve(args[1]) : fileURLToPath(new URL('../.local/memory-embedding', import.meta.url))
  // Use the existing build tool to load this single TS module + its pinned JSON.
  // Nothing is installed or written, and Electron is never imported or launched.
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/main/memory/embedding.ts', import.meta.url))],
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  const { createMemoryEmbedder } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
  const started = performance.now()
  let startupMs = 0
  embedder = createMemoryEmbedder({ runtimeDirectory, startupTimeoutMs: 120_000,
    report: (event) => { if (event.reason === 'runtime_ready') startupMs = performance.now() - started } })
  const fixtures = [
    { query: '先前談到畫廊擺設，怎樣才能看清作品又不傷眼？',
      relevant: '上次籌備美術展時，我們決定用柔和的暖色照明來照亮畫作，避免刺眼的強光。',
      unrelated: '週末在家烘焙巧克力蛋糕，需要先把烤箱預熱。' },
    { query: "What was the plan to make the displayed paintings easy on visitors' eyes?",
      relevant: 'For the museum exhibition, we chose soft warm lighting for the paintings and avoided harsh glare.',
      unrelated: 'Chocolate cake batter should be baked in a preheated oven for forty minutes.' },
  ]
  const durations = []
  const matched = []
  const unrelated = []
  let dimensions = 0
  let firstEmbeddingMs = 0
  async function embed(text, purpose) {
    const before = performance.now()
    const result = await embedder.embed(text, purpose)
    const elapsed = performance.now() - before
    if (!dimensions) firstEmbeddingMs = elapsed
    else durations.push(elapsed)
    dimensions = result.values.length
    if (dimensions !== 1024 || Math.abs(Math.hypot(...result.values) - 1) > 1e-6) throw Error('invalid_vector')
    return result.values
  }
  const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0)
  for (const fixture of fixtures) {
    const relevant = await embed(fixture.relevant, 'document')
    const other = await embed(fixture.unrelated, 'document')
    const query = await embed(fixture.query, 'query')
    matched.push(dot(query, relevant))
    unrelated.push(dot(query, other))
  }
  // Exercise production query priority while documents are queued; worker IDs must remain monotonic.
  await Promise.all([embedder.embed('Synthetic queued document one.', 'document'),
    embedder.embed('Synthetic queued document two.', 'document'), embedder.embed('Synthetic queued query.', 'query')])
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length
  const rounded = (value) => Math.round(value * 1000) / 1000
  const margin = Math.min(...matched.map((score, index) => score - unrelated[index]))
  failed = margin <= 0.05
  process.stdout.write(JSON.stringify({ type: 'memory_embedding_smoke', dimensions,
    timing: { startupMs: rounded(startupMs), firstEmbeddingMs: rounded(firstEmbeddingMs),
      warmMeanMs: rounded(mean(durations)), warmMinMs: rounded(Math.min(...durations)), warmMaxMs: rounded(Math.max(...durations)) },
    similarity: { comparisons: matched.length, matchedMean: rounded(mean(matched)),
      unrelatedMean: rounded(mean(unrelated)), minimumMargin: rounded(margin) }, exit: failed ? 1 : 0 }) + '\n')
} catch (error) {
  failed = true
  const reasons = new Set(['invalid_options', 'runtime_missing', 'runtime_invalid', 'runtime_unsupported', 'model_invalid',
    'startup_failed', 'startup_timeout', 'request_timeout', 'worker_failed', 'malformed_output', 'output_too_large',
    'version_mismatch', 'invalid_input', 'input_too_long', 'inference_failed', 'shutdown_timeout'])
  const reason = reasons.has(error?.code ?? error?.message) ? error.code ?? error.message : 'smoke_failed'
  process.stdout.write(JSON.stringify({ type: 'memory_embedding_smoke', reason, exit: 1 }) + '\n')
} finally {
  try { await embedder?.close() } catch {
    failed = true
    process.stdout.write(JSON.stringify({ type: 'memory_embedding_smoke', reason: 'shutdown_timeout', exit: 1 }) + '\n')
  }
  process.exitCode = failed ? 1 : 0
}
