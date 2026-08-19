import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // `node:sqlite` ships with Electron's Node runtime (Task 5 uses it). Rollup
        // cannot resolve it, so it must stay external or the main build breaks.
        external: ['node:sqlite'],
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // Preloads stay CommonJS (package.json has no "type": "module") because
        // sandboxed preloads cannot be ES modules.
        input: {
          mirror: resolve(__dirname, 'src/preload/mirror.ts'),
          console: resolve(__dirname, 'src/preload/console.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    publicDir: resolve(__dirname, 'resources/generated'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          mirror: resolve(__dirname, 'src/renderer/mirror/index.html'),
          console: resolve(__dirname, 'src/renderer/console/index.html')
        }
      }
    }
  }
})
