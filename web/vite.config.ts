import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { isIP } from 'node:net'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss(), {
    name: 'loopback-api-only',
    configureServer(server) {
      // Check the original socket before the proxy replaces it with a local connection.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api')) return next()
        const address = req.socket.remoteAddress?.toLowerCase()
        const ipv4 = address?.startsWith('::ffff:') ? address.slice(7) : address
        if (address === '::1' || (ipv4 !== undefined && isIP(ipv4) === 4 && ipv4.startsWith('127.'))) return next()
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'ADMIN_ACCESS_DENIED', message: 'Direct loopback administration required.' } }))
      })
    }
  }],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.SHARESERVER_API_PORT ?? process.env.SHARESERVER_PORT ?? '8787'}`
    }
  }
})
