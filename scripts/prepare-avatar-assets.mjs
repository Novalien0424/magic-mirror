import { cp, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const generatedRoot = resolve(projectRoot, 'resources', 'generated')

async function shouldCopy(source, destination) {
  try {
    const [sourceStat, destinationStat] = await Promise.all([
      stat(source),
      stat(destination),
    ])
    if (sourceStat.isDirectory()) return true
    if (sourceStat.size !== destinationStat.size) return true
    const [sourceBytes, destinationBytes] = await Promise.all([
      readFile(source),
      readFile(destination),
    ])
    return !sourceBytes.equals(destinationBytes)
  } catch {
    return true
  }
}

await mkdir(resolve(generatedRoot, 'avatar'), { recursive: true })
await mkdir(resolve(generatedRoot, 'live2d', 'Core'), { recursive: true })
await mkdir(resolve(generatedRoot, 'live2d', 'Framework'), { recursive: true })
await cp(
  resolve(projectRoot, 'resources', 'avatar', 'Ren'),
  resolve(generatedRoot, 'avatar', 'Ren'),
  { recursive: true, force: true, filter: shouldCopy },
)
await cp(
  resolve(projectRoot, 'src', 'vendor', 'live2d', 'Framework', 'Shaders'),
  resolve(generatedRoot, 'live2d', 'Framework', 'Shaders'),
  { recursive: true, force: true, filter: shouldCopy },
)
await cp(
  resolve(projectRoot, 'src', 'vendor', 'live2d', 'Core', 'live2dcubismcore.min.js'),
  resolve(generatedRoot, 'live2d', 'Core', 'live2dcubismcore.min.js'),
  { force: true, filter: shouldCopy },
)

process.stdout.write(`${JSON.stringify({
  status: 'ready',
  event: 'avatar_assets_prepared',
  reason: 'cubism_5_r5_development_bundle',
})}\n`)
