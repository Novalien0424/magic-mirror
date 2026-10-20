import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url))
const configuredModelRoot = process.env.RAVEN_MODEL_ROOT
if (!configuredModelRoot) throw new Error('RAVEN_MODEL_ROOT is required; choose the exported runtime explicitly')
const runtimeRoot = path.resolve(configuredModelRoot)
const projectRoot = process.env.RAVEN_PROJECT_ROOT ? path.resolve(process.env.RAVEN_PROJECT_ROOT) : null
const coreFile = projectRoot ? path.join(projectRoot, 'src/vendor/live2d/Core/live2dcubismcore.min.js') : null
const shaderRoot = projectRoot ? path.join(projectRoot, 'src/vendor/live2d/Framework/Shaders/WebGL') : null
const model3Candidates = fs.readdirSync(runtimeRoot).filter((name) => name.endsWith('.model3.json')).sort()
const configuredModel3 = process.env.RAVEN_MODEL3 ? path.resolve(process.env.RAVEN_MODEL3) : null
const model3File = configuredModel3 || (model3Candidates.length === 1 ? path.join(runtimeRoot, model3Candidates[0]) : null)
const contentTypes = { '.css': 'text/css; charset=utf-8', '.frag': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.moc3': 'application/octet-stream', '.png': 'image/png', '.vert': 'text/plain; charset=utf-8' }

function safePath(root, relative) {
  const decoded = decodeURIComponent(relative)
  if (decoded.includes('..')) return null
  const absolute = path.resolve(root, decoded.replace(/^[/\\]+/u, ''))
  return absolute === root || absolute.startsWith(`${root}${path.sep}`) ? absolute : null
}

function localAssetRoutes() {
  return { name: 'cubism-runtime-qa-local-assets', configureServer(server) { server.middlewares.use((req, res, next) => {
    const requestUrl = req.url?.split('?')[0] ?? ''
    let file = null
    if (requestUrl === '/live2d/Core/live2dcubismcore.min.js') file = coreFile
    else if (requestUrl === '/runtime/model3.json' && model3File) file = model3File
    else if (requestUrl.startsWith('/runtime/')) file = safePath(runtimeRoot, requestUrl.slice('/runtime/'.length))
    else if (requestUrl.startsWith('/live2d/Framework/Shaders/WebGL/') && shaderRoot) file = safePath(shaderRoot, requestUrl.slice('/live2d/Framework/Shaders/WebGL/'.length))
    if (file === null || !file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
    res.statusCode = 200
    res.setHeader('Content-Type', contentTypes[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Cache-Control', 'no-store')
    fs.createReadStream(file).pipe(res)
  }) } }
}

export default {
  root: workspaceRoot,
  publicDir: false,
  resolve: { alias: projectRoot ? { '@cubism': path.join(projectRoot, 'src/vendor/live2d/Framework/dist') } : {} },
  plugins: [localAssetRoutes()],
  server: { host: '127.0.0.1', port: Number(process.env.RAVEN_QA_PORT || 4177), strictPort: true, fs: { allow: [workspaceRoot, runtimeRoot, ...(projectRoot ? [projectRoot] : [])] } },
}
