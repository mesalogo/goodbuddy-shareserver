// @vitest-environment node
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { gatewayRoutes } from './gateway-routes.js'
import { GatewayStore } from './gateway-store.js'
import { SharingStore } from './sharing-store.js'
import { withLocalSocket } from './test-socket.js'

let accessKey: string
const post = (body: unknown, extra: RequestInit = {}): RequestInit => ({ method: 'POST', body: JSON.stringify(body), ...extra, headers: { 'content-type': 'application/json', authorization: `Bearer ${accessKey}`, ...extra.headers } })
const prefix = '/api/v1/gateway'
const chat = { model: 'local', messages: [{ role: 'user', content: 'private prompt' }] }
describe('local model gateway', () => {
  let directory: string
  let store: GatewayStore
  let app: ReturnType<typeof createApp>
  let server: Server
  let baseUrl: string
  let calls: { path: string; authorization?: string; body: Record<string, unknown> }[]
  let handler: (req: IncomingMessage, res: ServerResponse) => void
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gateway-test-'))
    vi.stubEnv('SHARESERVER_MASTER_KEY', 'ab'.repeat(32))
    vi.stubEnv('SHARESERVER_MASTER_KEY_FILE', '')
    vi.stubEnv('SHARESERVER_GATEWAY_BASE_URL', '')
    accessKey = ''
    store = new GatewayStore(directory)
    app = withLocalSocket(createApp(new SharingStore(directory), store))
    calls = []
    handler = (req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url === '/v1/models' ? { data: [{ id: 'remote' }] } : {
        id: 'completion', model: 'remote', choices: [{ message: { role: 'assistant', content: 'private output', tool_calls: [{ id: 'tool', type: 'function', function: { name: 'lookup', arguments: '{}' } }] } }], usage: { prompt_tokens: 7, completion_tokens: 4 }
      }))
    }
    server = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      calls.push({ path: req.url!, authorization: req.headers.authorization, body: body ? JSON.parse(body) : {} })
      handler(req, res)
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as { port: number }
    baseUrl = `http://127.0.0.1:${address.port}/v1`
    process.env.GATEWAY_TEST_API_KEY = 'test-only-secret'
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    delete process.env.GATEWAY_TEST_API_KEY
    delete process.env.GATEWAY_TEST_BASE_URL
    delete process.env.GATEWAY_TEST_MODEL
    await rm(directory, { recursive: true, force: true })
  })
  async function configure() {
    const input = { name: 'Test', baseUrl, protocol: 'openai-chat-completions', authentication: 'api-key', credentialAction: 'replace', apiKey: 'test-only-secret', enabled: true }
    const upstream = await (await app.request(`${prefix}/upstreams`, post(input))).json()
    const model = await (await app.request(`${prefix}/models`, post({ alias: 'local', upstreamId: upstream.id, remoteModel: 'remote', enabled: true }))).json()
    accessKey = (await store.createAccessKey({ name: 'Test client', modelIds: [model.id] })).key
    return { upstream, model, input }
  }
  it('starts empty; persists managed credentials and full updates across restart', async () => {
    expect(await (await app.request(`${prefix}/config`)).json()).toEqual({ upstreams: [], models: [], audits: [], gatewayBaseUrl: null })
    const { input } = await configure()
    const snapshot = await new GatewayStore(directory).snapshot()
    expect(snapshot.upstreams).toHaveLength(1)
    expect(snapshot.models).toHaveLength(1)
    const u = snapshot.upstreams[0]
    expect(u.id).toMatch(/^[a-f0-9-]{36}$/)
    const updated = await app.request(`${prefix}/upstreams/${u.id}`, post({ ...input, name: 'Updated', enabled: false }, { method: 'PUT' }))
    expect(updated.status).toBe(200)
    expect((await new GatewayStore(directory).snapshot()).upstreams[0].enabled).toBe(false)
    expect(await readFile(join(directory, 'gateway.json'), 'utf8')).not.toContain('test-only-secret')
    expect((await app.request(`${prefix}/import-env`, post({ prefix: 'GATEWAY_TEST' }))).status).toBe(404)
  })
  it('fails closed on malformed persisted data without overwriting it', async () => {
    for (const data of ['{broken', JSON.stringify({ version: 1, upstreams: [], models: [], audits: [{ prompt: 'bad' }] })]) {
      await writeFile(join(directory, 'gateway.json'), data)
      const broken = withLocalSocket(new Hono().route(prefix, gatewayRoutes(new GatewayStore(directory))))
      expect((await broken.request(`${prefix}/config`)).status).toBe(503)
      expect((await broken.request(`${prefix}/upstreams`, post({ name: 'Test', baseUrl, protocol: 'openai-chat-completions', authentication: 'none', credentialAction: 'clear', enabled: true }))).status).toBe(503)
      expect(await readFile(join(directory, 'gateway.json'), 'utf8')).toBe(data)
    }
  })
  it('discovers real models, maps aliases, preserves tools and records only metadata', async () => {
    const { upstream } = await configure()
    expect(await (await app.request(`${prefix}/upstreams/${upstream.id}/discover`, { method: 'POST' })).json()).toEqual({ models: ['remote'] })
    expect(await (await app.request(`${prefix}/v1/models`, { headers: { authorization: `Bearer ${accessKey}` } })).json()).toMatchObject({ data: [{ id: 'local' }] })
    const response = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } }] }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ model: 'local', choices: [{ message: { tool_calls: [{ id: 'tool' }] } }] })
    expect(calls[1]).toMatchObject({ authorization: 'Bearer test-only-secret', body: { model: 'remote', tools: [{ type: 'function' }] } })
    const snapshot = await new GatewayStore(directory).snapshot()
    expect(snapshot.audits[0]).toMatchObject({ status: 'success', inputTokens: 7, outputTokens: 4 })
    const persisted = await readFile(join(directory, 'gateway.json'), 'utf8')
    for (const secret of ['private prompt', 'private output', 'caller-secret', 'test-only-secret']) expect(persisted).not.toContain(secret)
    expect(JSON.stringify(snapshot)).not.toContain('test-only-secret')
  })
  it('rejects disabled routes, unknown fields, hostile origins and missing runtime credentials', async () => {
    const { model, upstream, input } = await configure()
    expect((await app.request(`${prefix}/models`, post({ alias: 'local', upstreamId: upstream.id, remoteModel: 'other', enabled: true }))).status).toBe(409)
    expect((await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, base_url: 'https://evil.example' }))).status).toBe(400)
    const denied = await app.request(`${prefix}/v1/chat/completions`, post(chat, { headers: { 'content-type': 'application/json', origin: 'https://evil.example' } }))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({ error: { code: 'ORIGIN_DENIED' }, requestId: (await store.snapshot()).audits[0].id })
    expect((await store.snapshot()).audits[0]).toMatchObject({ status: 'failed', httpStatus: 403, errorCode: 'ORIGIN_DENIED' })
    expect((await app.request(`${prefix}/upstreams`, post(input, { headers: { 'content-type': 'application/json', origin: 'null' } }))).status).toBe(403)
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat, { headers: { 'content-type': 'application/json', origin: 'http://localhost:5174' } }))).status).toBe(200)
    const { id, ...modelInput } = model
    expect((await app.request(`${prefix}/models/${id}`, post({ ...modelInput, enabled: false }, { method: 'PUT' }))).status).toBe(200)
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat))).status).toBe(403)
    expect(await (await app.request(`${prefix}/v1/models`, { headers: { authorization: `Bearer ${accessKey}` } })).json()).toMatchObject({ data: [] })
    await app.request(`${prefix}/models/${id}`, post(modelInput, { method: 'PUT' }))
    delete process.env.SHARESERVER_MASTER_KEY
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat))).status).toBe(503)
    expect(calls).toHaveLength(1)
    expect((await store.snapshot()).audits[0]).toMatchObject({ status: 'failed', inputTokens: null, outputTokens: null })
  })
  it('validates URLs and sanitizes upstream HTTP errors and redirects', async () => {
    const { input } = await configure()
    for (const url of ['https://user:secret@example.com', `${baseUrl}?key=secret`, `${baseUrl}#fragment`, 'file:///tmp/test']) {
      expect((await app.request(`${prefix}/upstreams`, post({ ...input, baseUrl: url }))).status).toBe(400)
    }
    for (const status of [401, 302]) {
      handler = (_req, res) => { res.writeHead(status, { location: `${baseUrl}/leak` }); res.end('test-only-secret upstream-sensitive-error') }
      const response = await app.request(`${prefix}/v1/chat/completions`, post(chat))
      expect(response.status).toBe(502)
      const error = await response.text()
      expect(error).not.toContain('test-only-secret')
      expect(error).not.toContain(baseUrl)
      expect(error).not.toContain('upstream-sensitive-error')
    }
    expect(calls).toHaveLength(2)
  })
  it('streams fragmented SSE tool calls and usage through completion', async () => {
    await configure()
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call","function":{"name":"lookup","arguments":"{}"}}]}}]}\r')
      setTimeout(() => res.end('\n\r\ndata: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n'), 10)
    }
    const response = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true, stream_options: { include_usage: true } }))
    const text = await response.text()
    expect(text).toContain('tool_calls')
    expect(text).toContain('lookup')
    expect(text).toContain('data: [DONE]')
    expect((await new GatewayStore(directory).snapshot()).audits[0]).toMatchObject({ status: 'success', stream: true, inputTokens: 3, outputTokens: 2 })
  })
  it('cancels upstream on downstream cancellation and persists cancellation', async () => {
    await configure()
    let closed!: () => void
    const closure = new Promise<void>(resolve => { closed = resolve })
    handler = (_req, res) => {
      res.on('close', closed)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n')
    }
    const response = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }))
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    await closure
    expect((await new GatewayStore(directory).snapshot()).audits[0]).toMatchObject({ status: 'cancelled', httpStatus: 499, inputTokens: null, outputTokens: null })
  })
  it('allows an already started stream to finish after key revocation but rejects subsequent calls', async () => {
    await configure()
    let complete!: () => void
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"first"}}]}\n\n')
      complete = () => res.end('data: [DONE]\n\n')
    }
    const response = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }))
    const reader = response.body!.getReader()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('first')
    const issued = await store.authenticate(`Bearer ${accessKey}`)
    await store.revokeAccessKey(issued.id)
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat))).status).toBe(401)
    complete()
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('[DONE]')
    expect((await reader.read()).done).toBe(true)
    expect((await store.snapshot()).audits[0]).toMatchObject({ status: 'success', accessKeyId: issued.id })
  })
  it('bounds requests and detects truncated streams and timeouts', async () => {
    await configure()
    expect((await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, messages: [{ role: 'user', content: 'x'.repeat(1024 * 1024) }] }))).status).toBe(413)
    handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"choices":[]}\n\n') }
    const truncated = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }))
    expect(await truncated.text()).toContain('INCOMPLETE_STREAM')
    expect((await store.snapshot()).audits[0].status).toBe('failed')
    handler = () => undefined
    const short = new Hono().route(prefix, gatewayRoutes(store, 50))
    expect((await short.request(`${prefix}/v1/chat/completions`, post(chat))).status).toBe(504)
    expect((await store.snapshot()).audits[0].errorCode).toBe('REQUEST_TIMEOUT')
  })
  it('bounds upstream responses and streams, without persisting response data', async () => {
    await configure()
    handler = (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [], extra: 'x'.repeat(16 * 1024 * 1024) })) }
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat))).status).toBe(502)
    handler = (_req, res) => { res.setHeader('content-type', 'text/event-stream'); res.end(`data: ${'x'.repeat(1024 * 1024 + 1)}`) }
    const stream = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }))
    expect(await stream.text()).toContain('STREAM_TOO_LARGE')
    expect((await store.snapshot()).audits.every(a => a.status === 'failed')).toBe(true)
  })
  it('persists only the newest 200 audits under concurrent writes', async () => {
    await Promise.all(Array.from({ length: 205 }, (_, i) => store.audit({
      id: randomUUID(), time: new Date().toISOString(), model: '', upstreamId: null, accessKeyId: null, stream: false,
      status: 'failed', httpStatus: 404, durationMs: i, inputTokens: null, outputTokens: null, errorCode: 'MODEL_NOT_FOUND'
    })))
    const snapshot = await new GatewayStore(directory).snapshot()
    expect(snapshot.audits).toHaveLength(200)
    expect(snapshot.audits[0].durationMs).toBe(204)
    expect(snapshot.audits[199].durationMs).toBe(5)
  })
  it('propagates a real HTTP client disconnect to the upstream', async () => {
    await configure()
    let closed!: () => void
    const closure = new Promise<void>(resolve => { closed = resolve })
    handler = (_req, res) => {
      res.on('close', closed)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n')
    }
    const gateway = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
    await once(gateway, 'listening')
    try {
      const address = gateway.address() as { port: number }
      const controller = new AbortController()
      const response = await fetch(`http://127.0.0.1:${address.port}${prefix}/v1/chat/completions`, post({ ...chat, stream: true }, { signal: controller.signal }))
      await response.body!.getReader().read()
      controller.abort()
      await closure
      await expect.poll(async () => (await store.snapshot()).audits[0]?.status).toBe('cancelled')
    } finally {
      (gateway as Server).closeAllConnections()
      await new Promise<void>(resolve => gateway.close(() => resolve()))
    }
  })
  it('times out a stalled SSE stream even without downstream reads', async () => {
    await configure()
    handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"choices":[]}\n\n') }
    const short = new Hono().route(prefix, gatewayRoutes(store, 100))
    const response = await short.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }))
    await expect.poll(async () => (await store.snapshot()).audits[0]?.errorCode).toBe('REQUEST_TIMEOUT')
    await expect(response.text()).rejects.toThrow('timed out')
  })
  it('errors the stream and closes upstream when persisting a successful stream audit fails', async () => {
    await configure()
    // A directory at the destination makes the real atomic rename fail on all platforms.
    await rm(join(directory, 'gateway.json'))
    await mkdir(join(directory, 'gateway.json'))
    let closed!: () => void
    const closure = new Promise<void>(resolve => { closed = resolve })
    handler = (_req, res) => {
      res.on('close', closed)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n')
    }
    const response = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }))
    expect(response.status).toBe(200)
    await expect(response.text()).rejects.toThrow('Gateway stream failed.')
    await closure
    expect((await store.snapshot()).audits).toEqual([])
  })
  it('still closes upstream when persisting cancellation fails', async () => {
    await configure()
    await rm(join(directory, 'gateway.json'))
    await mkdir(join(directory, 'gateway.json'))
    let closed!: () => void
    const closure = new Promise<void>(resolve => { closed = resolve })
    handler = (_req, res) => {
      res.on('close', closed)
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('data: {"choices":[]}\n\n')
    }
    const response = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }))
    const reader = response.body!.getReader()
    await reader.read()
    await expect(reader.cancel()).rejects.toMatchObject({ code: 'GATEWAY_STORAGE_UNAVAILABLE' })
    await closure
  })
  it('handles abort after upstream headers but before stream startup, including EOF', async () => {
    await configure()
    const controller = new AbortController()
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end('data: [DONE]\n\n')
    }
    const originalFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (...args) => {
      const response = await originalFetch(...args)
      controller.abort()
      return response
    })
    const response = await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, stream: true }, { signal: controller.signal }))
    await expect(response.text()).rejects.toThrow('Client cancelled.')
    expect((await new GatewayStore(directory).snapshot()).audits).toMatchObject([
      { status: 'cancelled', httpStatus: 499, errorCode: 'CLIENT_CANCELLED', inputTokens: null, outputTokens: null }
    ])
  })
})
