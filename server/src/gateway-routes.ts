import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { GatewayAudit } from '../../shared/gateway.js'
import { GatewayError, GatewayStore, record } from './gateway-store.js'
import { localAdmin, type SocketBindings } from './admin-boundary.js'

const REQUEST_LIMIT = 1024 * 1024
const RESPONSE_LIMIT = 16 * 1024 * 1024
const EVENT_LIMIT = 1024 * 1024
const CHAT_FIELDS = new Set(('model messages stream stream_options temperature top_p n stop max_tokens max_completion_tokens presence_penalty frequency_penalty logit_bias logprobs top_logprobs seed tools tool_choice parallel_tool_calls functions function_call response_format reasoning_effort verbosity user').split(' '))
async function readBounded(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal): Promise<string> {
  if (!body) throw new GatewayError(400, 'EMPTY_BODY')
  const reader = body.getReader()
  const abort = () => { void reader.cancel().catch(() => undefined) }
  signal.addEventListener('abort', abort, { once: true })
  let size = 0
  let result = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      if (signal.aborted) throw new GatewayError(504, 'REQUEST_TIMEOUT')
      const { done, value } = await reader.read()
      if (signal.aborted) throw new GatewayError(504, 'REQUEST_TIMEOUT')
      if (done) break
      size += value.byteLength
      if (size > limit) throw new GatewayError(413, 'BODY_TOO_LARGE')
      result += decoder.decode(value, { stream: true })
    }
    return result + decoder.decode()
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
function json(text: string): Record<string, unknown> {
  try { return record(JSON.parse(text)) } catch { throw new GatewayError(400, 'INVALID_JSON') }
}
function originAllowed(request: Request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin || ['http://127.0.0.1:5174', 'http://localhost:5174'].includes(origin)
}
function usage(value: Record<string, unknown>, audit: GatewayAudit) {
  if (value.usage && typeof value.usage === 'object') {
    const u = value.usage as Record<string, unknown>
    if (Number.isSafeInteger(u.prompt_tokens) && Number(u.prompt_tokens) >= 0) audit.inputTokens = Number(u.prompt_tokens)
    if (Number.isSafeInteger(u.completion_tokens) && Number(u.completion_tokens) >= 0) audit.outputTokens = Number(u.completion_tokens)
  }
}

export function gatewayRoutes(store: GatewayStore, timeoutMs = 120_000, admin: typeof localAdmin = localAdmin) {
  const app = new Hono<{ Bindings: SocketBindings; Variables: { requestId: string } }>()
  app.onError((error, c) => {
    const safe = error instanceof GatewayError ? error : new GatewayError(500, 'GATEWAY_FAILURE')
    return c.json({ error: { code: safe.code, message: safe.message }, requestId: c.get('requestId') ?? randomUUID() }, safe.status)
  })
  app.use('*', async (c, next) => {
    const inference = (c.req.method === 'POST' && c.req.path === '/api/v1/gateway/v1/chat/completions') || (c.req.method === 'GET' && c.req.path === '/api/v1/gateway/v1/models')
    if (inference) await next()
    else return admin(c, next)
  })
  const body = async (request: Request) => {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new GatewayError(415, 'JSON_REQUIRED')
    return json(await readBounded(request.body, REQUEST_LIMIT, AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])))
  }
  app.get('/config', async c => c.json(await store.snapshot()))
  app.post('/upstreams', async c => c.json(await store.upstream(await body(c.req.raw))))
  app.put('/upstreams/:id', async c => c.json(await store.upstream(await body(c.req.raw), c.req.param('id'))))
  app.post('/models', async c => c.json(await store.model(await body(c.req.raw))))
  app.put('/models/:id', async c => c.json(await store.model(await body(c.req.raw), c.req.param('id'))))
  app.get('/access-keys', async c => c.json(await store.accessKeys()))
  app.post('/access-keys', async c => c.json(await store.createAccessKey(await body(c.req.raw))))
  app.post('/access-keys/:id/revoke', async c => c.json(await store.revokeAccessKey(c.req.param('id'))))
  app.post('/upstreams/:id/discover', async c => {
    const upstream = (await store.snapshot()).upstreams.find(u => u.id === c.req.param('id'))
    if (!upstream) throw new GatewayError(404, 'UPSTREAM_NOT_FOUND')
    if (!upstream.enabled) throw new GatewayError(403, 'UPSTREAM_DISABLED')
    const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(timeoutMs)])
    const headers = await store.headers(upstream.id)
    try {
      const response = await fetch(`${upstream.baseUrl}/models`, { headers, redirect: 'error', signal })
      if (!response.ok) { await response.body?.cancel(); throw new GatewayError(502, 'UPSTREAM_HTTP_ERROR', `Upstream returned HTTP ${response.status}.`) }
      const data = json(await readBounded(response.body, RESPONSE_LIMIT, signal)).data
      if (!Array.isArray(data) || data.some(m => !m || typeof m.id !== 'string' || m.id.length > 200)) throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE')
      return c.json({ models: [...new Set(data.map(m => m.id as string))] })
    } catch (error) {
      if (error instanceof GatewayError && error.code === 'UPSTREAM_HTTP_ERROR') throw error
      throw new GatewayError(signal.aborted ? 504 : 502, signal.aborted ? 'REQUEST_TIMEOUT' : 'UPSTREAM_FAILURE')
    }
  })
  app.get('/v1/models', async c => {
    const key = await store.authenticate(c.req.header('authorization'))
    const snapshot = await store.snapshot()
    const available = []
    for (const model of snapshot.models) {
      if (!key.modelIds.includes(model.id) || !model.enabled || !snapshot.upstreams.some(u => u.id === model.upstreamId && u.enabled)) continue
      try { await store.headers(model.upstreamId) }
      catch (error) { if (error instanceof GatewayError && ['CREDENTIAL_UNAVAILABLE', 'CREDENTIAL_NOT_CONFIGURED', 'UPSTREAM_DISABLED'].includes(error.code)) continue; throw error }
      available.push({ id: model.alias, object: 'model', created: 0, owned_by: 'local-gateway' })
    }
    return c.json({ object: 'list', data: available })
  })
  app.on('POST', ['/v1/chat/completions', '/test'], async c => {
    const started = Date.now()
    const audit: GatewayAudit = { id: randomUUID(), time: new Date().toISOString(), model: '', upstreamId: null, accessKeyId: null, stream: false, status: 'failed', httpStatus: 500, durationMs: 0, inputTokens: null, outputTokens: null, errorCode: null }
    c.set('requestId', audit.id)
    const controller = new AbortController()
    let timedOut = false
    let cancelled = false
    let finished = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    const cancel = () => { cancelled = true; controller.abort() }
    c.req.raw.signal.addEventListener('abort', cancel, { once: true })
    if (c.req.raw.signal.aborted) cancel()
    const finish = async (status: GatewayAudit['status'], httpStatus: number, code: string | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      c.req.raw.signal.removeEventListener('abort', cancel)
      Object.assign(audit, { status, httpStatus, errorCode: code, durationMs: Date.now() - started })
      await store.audit(audit)
    }
    const failure = (error: unknown) => cancelled ? new GatewayError(400, 'CLIENT_CANCELLED') : timedOut ? new GatewayError(504, 'REQUEST_TIMEOUT') : error instanceof GatewayError ? error : new GatewayError(502, 'UPSTREAM_FAILURE')
    try {
      const key = c.req.path === '/api/v1/gateway/test' ? null : await store.authenticate(c.req.header('authorization'))
      audit.accessKeyId = key?.id ?? null
      if (!originAllowed(c.req.raw)) throw new GatewayError(403, 'ORIGIN_DENIED')
      if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json')) throw new GatewayError(415, 'JSON_REQUIRED')
      const input = json(await readBounded(c.req.raw.body, REQUEST_LIMIT, controller.signal))
      audit.stream = input.stream === true
      if (c.req.path === '/api/v1/gateway/test' && input.stream === true) throw new GatewayError(400, 'TEST_NON_STREAMING_ONLY')
      if (Object.keys(input).some(key => !CHAT_FIELDS.has(key))) throw new GatewayError(400, 'UNSUPPORTED_FIELD', 'Unsupported chat field or routing override.')
      if (typeof input.model !== 'string' || input.model.length > 200 || !Array.isArray(input.messages) || !input.messages.length ||
        input.messages.some(m => !m || typeof m !== 'object' || !['system', 'developer', 'user', 'assistant', 'tool', 'function'].includes(m.role)) ||
        (input.stream !== undefined && typeof input.stream !== 'boolean')) throw new GatewayError(400, 'INVALID_CHAT_REQUEST')
      const snapshot = await store.snapshot()
      const model = snapshot.models.find(m => m.alias === input.model)
      // Only configured aliases are persisted, never arbitrary user text.
      if (key && (!model || !key.modelIds.includes(model.id))) throw new GatewayError(403, 'MODEL_NOT_AUTHORIZED')
      if (!model) throw new GatewayError(404, 'MODEL_NOT_FOUND')
      audit.model = model.alias
      audit.upstreamId = model.upstreamId
      const upstream = snapshot.upstreams.find(u => u.id === model.upstreamId)!
      if (!model.enabled || !upstream.enabled) throw new GatewayError(403, 'MODEL_DISABLED')
      const response = await fetch(`${upstream.baseUrl}/chat/completions`, {
        method: 'POST', headers: await store.headers(upstream.id), body: JSON.stringify({ ...input, model: model.remoteModel }), redirect: 'error', signal: controller.signal
      })
      if (!response.ok) { await response.body?.cancel(); throw new GatewayError(502, 'UPSTREAM_HTTP_ERROR', `Upstream returned HTTP ${response.status}.`) }
      if (!input.stream) {
        let output: Record<string, unknown>
        try { output = json(await readBounded(response.body, RESPONSE_LIMIT, controller.signal)) }
        catch { throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE') }
        if (output.error || !Array.isArray(output.choices)) throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE')
        usage(output, audit)
        output.model = model.alias
        await finish('success', 200, null)
        return c.json(output)
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
        await response.body?.cancel()
        throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE')
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ''
      let bytes = 0
      const stream = new ReadableStream<Uint8Array>({
        start(output) {
          const abortStream = () => {
            if (finished) return
            void reader.cancel().catch(() => undefined)
            void finish(cancelled ? 'cancelled' : 'failed', cancelled ? 499 : 504, cancelled ? 'CLIENT_CANCELLED' : 'REQUEST_TIMEOUT')
              .then(() => output.error(new Error(cancelled ? 'Client cancelled.' : 'Gateway request timed out.')))
              .catch(() => output.error(new Error('Gateway storage failed.')))
          }
          controller.signal.addEventListener('abort', abortStream, { once: true })
          if (controller.signal.aborted) abortStream()
        },
        async pull(output) {
          if (finished) return
          try {
            while (true) {
              const boundary = /\r?\n\r?\n/.exec(buffer)
              if (boundary) {
                const event = buffer.slice(0, boundary.index)
                buffer = buffer.slice(boundary.index + boundary[0].length)
                if (event.length > EVENT_LIMIT) throw new GatewayError(502, 'STREAM_TOO_LARGE')
                const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
                if (!data) continue
                if (data === '[DONE]') {
                  await finish('success', 200, null)
                  output.enqueue(encoder.encode('data: [DONE]\n\n'))
                  output.close()
                  controller.abort()
                  await reader.cancel().catch(() => undefined)
                  return
                }
                let chunk: Record<string, unknown>
                try { chunk = json(data) } catch { throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE') }
                if (chunk.error || !Array.isArray(chunk.choices)) throw new GatewayError(502, 'INVALID_UPSTREAM_RESPONSE')
                usage(chunk, audit)
                chunk.model = model.alias
                output.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
                return
              }
              if (buffer.length > EVENT_LIMIT) throw new GatewayError(502, 'STREAM_TOO_LARGE')
              const next = await reader.read()
              if (finished) return
              if (next.done) throw new GatewayError(502, 'INCOMPLETE_STREAM')
              bytes += next.value.byteLength
              if (bytes > RESPONSE_LIMIT) throw new GatewayError(502, 'STREAM_TOO_LARGE')
              buffer += decoder.decode(next.value, { stream: true })
            }
          } catch (error) {
            if (finished) {
              output.error(new Error('Gateway stream failed.'))
              controller.abort()
              await reader.cancel().catch(() => undefined)
              return
            }
            const safe = failure(error)
            await reader.cancel().catch(() => undefined)
            try {
              await finish(cancelled ? 'cancelled' : 'failed', cancelled ? 499 : safe.status, safe.code)
              if (!cancelled) { output.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { code: safe.code, message: 'Gateway stream failed.' }, requestId: audit.id })}\n\n`)); output.close() }
            } catch { output.error(new Error('Gateway stream failed.')) }
            controller.abort()
          }
        },
        async cancel() {
          try { await finish('cancelled', 499, 'CLIENT_CANCELLED') }
          finally {
            cancel()
            await reader.cancel().catch(() => undefined)
          }
        }
      })
      return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' } })
    } catch (error) {
      const safe = failure(error)
      controller.abort()
      await finish(cancelled ? 'cancelled' : 'failed', cancelled ? 499 : safe.status, safe.code)
      throw safe
    }
  })
  app.all('*', c => c.json({ error: { code: 'NOT_FOUND', message: 'API route not found.' }, requestId: randomUUID() }, 404))
  return app
}
