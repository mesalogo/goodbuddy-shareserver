// @vitest-environment node
import { once } from 'node:events'
import { createServer as createHttpServer, request, type OutgoingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import config from '../vite.config'

describe('Vite API socket boundary over real HTTP', () => {
  const forwarded: string[] = []
  const peers: string[] = []
  const backend = createHttpServer((req, res) => {
    forwarded.push(req.url!)
    res.end('backend reached')
  })
  const lanAddress = Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address
  let vite: ViteDevServer | undefined
  let port: number

  beforeAll(async () => {
    backend.listen(0, '127.0.0.1')
    await once(backend, 'listening')
    vite = await createServer({
      ...config,
      configFile: false,
      plugins: [{
        name: 'observe-real-peer',
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            peers.push(req.socket.remoteAddress!)
            next()
          })
        }
      }, ...config.plugins!],
      server: {
        ...config.server,
        host: '::',
        port: 0,
        hmr: false,
        watch: null,
        proxy: { '/api': `http://127.0.0.1:${(backend.address() as AddressInfo).port}` }
      }
    })
    await vite.listen()
    port = (vite.httpServer!.address() as AddressInfo).port
  })

  afterAll(async () => {
    await vite?.close()
    if (backend.listening) await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()))
  })

  function get(host: string, path: string, headers: OutgoingHttpHeaders = {}, method = 'GET') {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host, port, path, headers, method, agent: false }, res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode!, body }))
      })
      req.on('error', reject)
      req.setTimeout(5000, () => req.destroy(new Error('HTTP request timed out')))
      req.end()
    })
  }

  it('defaults to an explicit IPv4 loopback listener', () => {
    expect(config.server?.host).toBe('127.0.0.1')
  })

  it.each(['127.0.0.1', '::1'])('proxies loopback %s regardless of forwarded headers', async host => {
    const path = '/api/v1/gateway/config'
    const count = forwarded.length
    expect(await get(host, path, { 'X-Forwarded-For': '203.0.113.10' })).toEqual({ status: 200, body: 'backend reached' })
    expect(forwarded.slice(count)).toEqual([path])
    expect(peers.at(-1)).toBe(host === '127.0.0.1' ? '::ffff:127.0.0.1' : '::1')
  })

  it.skipIf(!lanAddress)('rejects LAN reads and mutations before proxying, even with spoofed loopback headers', async () => {
    const count = forwarded.length
    for (const [method, path] of [['GET', '/api/v1/gateway/config'], ['POST', '/api/v1/gateway/access-keys'], ['PUT', '/api/v1/gateway/upstreams/test'], ['GET', '/api'], ['GET', '/api/v1/models']]) {
      for (const headers of [{}, { Forwarded: 'for=127.0.0.1', 'X-Forwarded-For': '::1', 'X-Real-IP': '127.0.0.1', Host: 'localhost' }]) {
        const response = await get(lanAddress!, path, headers, method)
        expect(response.status).toBe(403)
        expect(JSON.parse(response.body).error.code).toBe('ADMIN_ACCESS_DENIED')
      }
    }
    expect(peers.at(-1)).toBe(`::ffff:${lanAddress}`)
    expect(forwarded).toHaveLength(count)
    expect((await get(lanAddress!, '/@vite/client')).status).toBe(200)
  })
})
