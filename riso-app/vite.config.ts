import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// Standalone build of just the Riso tab: `npm run build:riso` → riso-app/dist (a static site).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
})
