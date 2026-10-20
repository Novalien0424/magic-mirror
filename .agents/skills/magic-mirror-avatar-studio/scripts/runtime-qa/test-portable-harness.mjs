#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = import.meta.dirname
const captureHtml = await fs.readFile(path.join(root, 'capture.html'), 'utf8')
const captureJs = await fs.readFile(path.join(root, 'capture.js'), 'utf8')
const qaSource = await fs.readFile(path.join(root, 'src', 'cubism-qa.js'), 'utf8')
const viteConfig = await fs.readFile(path.join(root, 'vite.config.mjs'), 'utf8')
const runner = await fs.readFile(path.join(root, 'run-v08-qa.mjs'), 'utf8')

assert.match(captureHtml, /canvasWidth/)
assert.match(captureHtml, /canvasHeight/)
assert.match(captureJs, /modelUrl/)
assert.doesNotMatch(qaSource, /C:\/Project\/magic-mirror/)
assert.doesNotMatch(viteConfig, /C:\/Project\/magic-mirror/)
assert.match(runner, /canvas-width/)
assert.match(runner, /canvas-height/)
assert.match(runner, /actualCanvas/)
console.log(JSON.stringify({ status: 'pass', checks: ['query_canvas_dimensions', 'query_model_url', 'no_project_path_defaults', 'actual_canvas_assertion'] }, null, 2))
