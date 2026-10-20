import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Match the production React plugin when Node checks render Console components.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Smoke tests spawn a real Electron dev run; never let two of them race.
    fileParallelism: false,
    testTimeout: 10_000
  }
})
