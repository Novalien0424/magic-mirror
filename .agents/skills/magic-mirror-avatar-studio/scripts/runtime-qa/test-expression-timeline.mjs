import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { test } from 'node:test'

// Execute the real runner's expression section with a deterministic clock.
// Uneven timestamps reproduce the production bug; filename checks would not.
test('expression capture labels equal the elapsed SDK clock and include full fade-in', async () => {
  const source = await fs.readFile(new URL('./run-v08-qa.mjs', import.meta.url), 'utf8')
  const section = source.slice(source.indexOf('const expressionNames ='), source.indexOf('const sourceAngleChecklist ='))
  assert.ok(section.length > 100)
  let elapsed = 0
  const records = []
  const captureApi = {
    tick(dt) { elapsed += dt },
    setExpression() { elapsed = 0 },
    model: {
      update(dt) { elapsed += dt },
      expressionByName: new Map([['exp_01', { getFadeInTime: () => 1 }]]),
      _expressionManager: { get _userTimeSeconds() { return elapsed } },
    },
  }
  const page = vm.createContext({ window: { __capture: captureApi } })
  const context = vm.createContext({
    initialReport: { model3: { expressions: ['exp_01'] } },
    only: 'expressions',
    reset: async () => { elapsed = 0 },
    evaluate: async code => vm.runInContext(code, page),
    capture: async (name, kind, extra) => {
      const record = { name, kind, ...extra, observed: elapsed }
      records.push(record)
      return record
    },
  })
  await vm.runInContext(`(async()=>{${section}})()`, context)
  const timed = records.filter(record => record.time !== undefined)
  for (const record of timed) {
    assert.ok(Math.abs(record.time - record.observed) < 1e-8,
      `${record.name}: label=${record.time}, elapsed=${record.observed}`)
  }
  assert.ok(timed.some(record => record.time > 1), 'must capture after the one-second fade-in')
})
