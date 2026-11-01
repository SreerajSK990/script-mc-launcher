import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const projectRoot = import.meta.dirname

export default defineConfig({
  root: resolve(projectRoot, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(projectRoot, 'src/renderer/src'),
      '@shared': resolve(projectRoot, 'src/shared')
    }
  },
  css: {
    postcss: projectRoot
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: resolve(projectRoot, 'out/renderer'),
    emptyOutDir: true
  }
})
