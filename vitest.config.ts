import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Smoke tests spawn a real Electron dev run; never let two of them race.
    fileParallelism: false,
    testTimeout: 10_000
  }
})
