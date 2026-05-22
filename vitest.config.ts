// vitest.config.ts — 独立配置，不继承 vite.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

const root = resolve(__dirname)

export default defineConfig({
  root,
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    testTimeout: 10000,
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: resolve(root, 'coverage'),
      include: ['src/core/**', 'src/adapters/**'],
      exclude: ['src/core/types/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@core': resolve(root, 'src/core'),
      '@adapters': resolve(root, 'src/adapters'),
      '@renderer': resolve(root, 'src/renderer'),
    },
  },
})
