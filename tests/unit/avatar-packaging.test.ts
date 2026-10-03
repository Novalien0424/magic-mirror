import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..', '..')

function read(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8')
}

describe('Phase 3 official Cubism asset packaging', () => {
  it('vendors Cubism 5 R5 Core and Framework with their license notices', () => {
    expect(read('src/vendor/live2d/Core/live2dcubismcore.min.js')).toContain(
      'Live2DCubismCore',
    )
    expect(read('src/vendor/live2d/Framework/LICENSE.md')).toContain('Live2D')
    expect(read('src/vendor/live2d/Framework/Shaders/WebGL/vertshadersrc.vert')).toContain(
      'gl_Position',
    )
    expect(read('src/vendor/live2d/NOTICE.md')).toContain('Live2D')
    expect(read('src/vendor/live2d/SDK_VERSION').trim()).toBe('CubismSdkForWeb-5-r.5')
  })

  it('packages Ren with the Magic Mirror lifecycle contract outside app.asar', () => {
    const builder = read('electron-builder.yml')
    expect(builder).toContain('out/renderer/avatar/**/*')
    expect(builder).toContain('out/renderer/audio/**/*')

    const model = JSON.parse(
      read('resources/avatar/Ren/Ren.model3.json'),
    ) as {
      Groups: Array<{ Name: string; Ids: string[] }>
      FileReferences: { Motions: Record<string, unknown[]> }
    }

    expect(model.Groups.find(({ Name }) => Name === 'EyeBlink')?.Ids).toEqual([
      'ParamEyeLOpen',
      'ParamEyeROpen',
    ])
    expect(model.Groups.find(({ Name }) => Name === 'LipSync')?.Ids).toEqual([
      'ParamMouthOpenY',
    ])
    expect(Object.keys(model.FileReferences.Motions)).toEqual([
      'Dormant',
      'Waking',
      'Listening',
      'Thinking',
      'Speaking',
      'Scene',
      'Suspending',
    ])
  })

  it('loads proprietary Core as a global script before the renderer module', () => {
    const html = read('src/renderer/mirror/index.html')
    const coreIndex = html.indexOf('/live2d/Core/live2dcubismcore.min.js')
    const rendererIndex = html.indexOf('./main.tsx')

    expect(coreIndex).toBeGreaterThan(-1)
    expect(rendererIndex).toBeGreaterThan(coreIndex)
  })

  it('prepares tracked avatar sources for the renderer public directory', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>
    }
    const preparer = read('scripts/prepare-avatar-assets.mjs')

    expect(packageJson.scripts['predev']).toContain('npm run prepare:avatar')
    expect(packageJson.scripts['prebuild']).toContain('npm run prepare:avatar')
    expect(preparer).toContain("'resources', 'avatar', 'Ren'")
    expect(preparer).toContain("'resources', 'generated'")
    expect(preparer).toContain("'Framework', 'Shaders'")
    expect(packageJson.scripts['predev']).toContain('npm run generate:avatar-audio')
  })
})
