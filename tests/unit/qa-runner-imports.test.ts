import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The QA runners load these source files with plain Node, which resolves only
// imports written with their `.ts` ending. Vitest and the build accept both, so a
// missing ending passes every other check and stops the runner at launch (11-16).
describe('source files the QA runners load under plain Node', () => {
  for (const script of ['scripts/run-raven-conversation-qa.mjs', 'scripts/run-phase4-qa.mjs']) {
    it(`${script} can load its source imports`, () => {
      const files = [...readFileSync(script, 'utf8').matchAll(/^import .* from '(\.\.\/src\/[^']+\.ts)'/gm)].map(match => match[1]!.slice(3))
      expect(files.length).toBeGreaterThan(0)
      const code = files.map(file => `await import(${JSON.stringify(`${process.cwd()}/${file}`)})`).join('\n')
      expect(() => execFileSync(process.execPath, ['--input-type=module', '--no-warnings', '-e', code], { stdio: 'pipe', timeout: 30_000 })).not.toThrow()
    })
  }
})
