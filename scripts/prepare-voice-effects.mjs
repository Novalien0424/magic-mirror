import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(resolve(root, 'node_modules/signalsmith-stretch/package.json'), 'utf8'))
if (pkg.version !== '1.3.2' || pkg.license !== 'MIT') throw new Error('voice_effects_package_mismatch')
const target = resolve(root, 'resources/generated/voice-effects')
await mkdir(target, { recursive: true })
await copyFile(resolve(root, 'node_modules/signalsmith-stretch/SignalsmithStretch.mjs'), resolve(target, 'SignalsmithStretch.mjs'))
await copyFile(resolve(root, 'resources/licenses/signalsmith-stretch.txt'), resolve(target, 'LICENSE.txt'))
console.log('Signalsmith Stretch 1.3.2 local worklet prepared')
