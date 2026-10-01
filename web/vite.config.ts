import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:8787'
    }
  }
})
