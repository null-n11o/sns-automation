import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'app',
          environment: 'happy-dom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'skills',
          environment: 'node',
          include: ['.claude/**/*.test.ts'],
          env: {
            TZ: 'UTC',
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
