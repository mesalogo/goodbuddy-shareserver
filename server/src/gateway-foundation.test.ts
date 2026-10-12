// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { GatewayStore } from './gateway-store.js'
import { SharingStore } from './sharing-store.js'
import { socketBinding } from './test-socket.js'

const prefix = '/api/v1/gateway'
const upstreamInput = { name: 'Provider', baseUrl: 'http://10.0.0.2:8000/service/v1/', protocol: 'openai-chat-completions', authentication: 'api-key', enabled: true, credentialAction: 'replace', apiKey: 'provider-secret' }
const post = (value: unknown, key?: string): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(value) })
const exec = promisify(execFile)

describe('B1 gateway security and persistence contracts', () => {
  let directory: string
  let store: GatewayStore
  let app: ReturnType<typeof createApp>
  const chat = { model: 'public-model', messages: [{ role: 'user', content: 'hello' }] }
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'b1-gateway-'))
    store = new GatewayStore(join(directory, 'data'))
    app = createApp(new SharingStore(join(directory, 'data')), store)
    vi.stubEnv('SHARESERVER_MASTER_KEY', '12'.repeat(32))
    vi.stubEnv('SHARESERVER_MASTER_KEY_FILE', '')
    vi.stubEnv('SHARESERVER_GATEWAY_BASE_URL', '')
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    await rm(directory, { recursive: true, force: true })
  })
  async function configured() {
    const upstream = await store.upstream(upstreamInput)
    const model = await store.model({ alias: 'public-model', upstreamId: upstream.id, remoteModel: 'remote-model', enabled: true, displayName: 'Friendly model' })
    const created = await store.createAccessKey({ name: 'Desktop', modelIds: [model.id] })
    return { upstream, model, ...created }
  }
  function mockCompletion() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'answer' } }] }))
  }
  it('encrypts with fresh nonces, projects no secrets, and keeps/replaces/clears credentials atomically', async () => {
    const { upstream } = await configured()
    const filename = join(directory, 'data', 'gateway.json')
    const original = JSON.parse(await readFile(filename, 'utf8'))
    expect(original.upstreams[0].credential).toMatchObject({ nonce: expect.stringMatching(/^[a-f0-9]{24}$/), tag: expect.stringMatching(/^[a-f0-9]{32}$/) })
    expect(JSON.stringify(original)).not.toContain('provider-secret')
    expect(upstream).toEqual({ id: upstream.id, name: 'Provider', baseUrl: 'http://10.0.0.2:8000/service/v1', protocol: 'openai-chat-completions', authentication: 'api-key', enabled: true, credentialConfigured: true })
    const { apiKey, ...input } = upstreamInput
    expect(apiKey).toBe('provider-secret')
    await store.upstream({ ...input, credentialAction: 'keep' }, upstream.id)
    expect(JSON.parse(await readFile(filename, 'utf8')).upstreams[0].credential).toEqual(original.upstreams[0].credential)
    expect(() => store.upstream({ ...input, credentialAction: 'replace', apiKey: '' }, upstream.id)).toThrow()
    await store.upstream(upstreamInput, upstream.id)
    expect(JSON.parse(await readFile(filename, 'utf8')).upstreams[0].credential.nonce).not.toBe(original.upstreams[0].credential.nonce)
    expect(await new GatewayStore(join(directory, 'data')).headers(upstream.id)).toMatchObject({ authorization: 'Bearer provider-secret' })
    await store.upstream({ ...input, credentialAction: 'clear' }, upstream.id)
    expect((await store.snapshot()).upstreams[0].credentialConfigured).toBe(false)
    await expect(store.headers(upstream.id)).rejects.toMatchObject({ code: 'CREDENTIAL_NOT_CONFIGURED' })
    await store.upstream({ ...input, authentication: 'none', credentialAction: 'keep' }, upstream.id)
    expect(await store.headers(upstream.id)).toEqual({ 'content-type': 'application/json' })
  })
  it('fails on missing/wrong master keys and tampered ciphertext without replacing existing secrets', async () => {
    const { upstream, key } = await configured()
    const filename = join(directory, 'data', 'gateway.json')
    const saved = await readFile(filename, 'utf8')
    const fetch = mockCompletion()
    for (const master of ['', '34'.repeat(32), 'invalid']) {
      vi.stubEnv('SHARESERVER_MASTER_KEY', master)
      const response = await app.request(`${prefix}/v1/chat/completions`, post(chat, key))
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ error: { code: 'CREDENTIAL_UNAVAILABLE' } })
      expect((await store.snapshot()).upstreams[0].credentialConfigured).toBe(true)
      await expect(store.upstream(upstreamInput, upstream.id)).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' })
      expect(JSON.parse(await readFile(filename, 'utf8')).upstreams).toEqual(JSON.parse(saved).upstreams)
    }
    expect(fetch).not.toHaveBeenCalled()
    vi.stubEnv('SHARESERVER_MASTER_KEY', '12'.repeat(32))
    const corrupted = JSON.parse(saved)
    corrupted.upstreams[0].credential.tag = '00'.repeat(16)
    await writeFile(filename, JSON.stringify(corrupted))
    await expect(new GatewayStore(join(directory, 'data')).headers(upstream.id)).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' })
    vi.stubEnv('SHARESERVER_MASTER_KEY', '')
    await expect(store.upstream(upstreamInput, upstream.id)).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' })
    expect(await readFile(filename, 'utf8')).toBe(JSON.stringify(corrupted))
  })
  it('reads legacy environment records and long aliases, then migrates explicitly without changing IDs', async () => {
    const upstreamId = randomUUID(), modelId = randomUUID()
    const alias = 'a'.repeat(180)
    await mkdir(join(directory, 'data'))
    await writeFile(join(directory, 'data', 'gateway.json'), JSON.stringify({ version: 1,
      upstreams: [{ id: upstreamId, name: 'Old', baseUrl: upstreamInput.baseUrl, apiKeyEnv: 'B1_LEGACY_KEY', enabled: true }],
      models: [{ id: modelId, alias, upstreamId, remoteModel: 'remote', enabled: true }], audits: [] }))
    vi.stubEnv('B1_LEGACY_KEY', 'legacy-secret')
    const snapshot = await store.snapshot()
    expect(JSON.stringify(snapshot)).not.toContain('B1_LEGACY_KEY')
    const { key } = await store.createAccessKey({ name: 'Migrated', modelIds: [modelId] })
    const fetch = mockCompletion()
    expect((await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, model: alias }, key))).status).toBe(200)
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer legacy-secret' })
    await store.model({ alias, upstreamId, remoteModel: 'remote', enabled: false }, modelId)
    await expect(store.model({ alias: 'b'.repeat(129), upstreamId, remoteModel: 'remote', enabled: true })).rejects.toMatchObject({ status: 400 })
    await store.upstream(upstreamInput, upstreamId)
    expect((await new GatewayStore(join(directory, 'data')).snapshot()).models[0].id).toBe(modelId)
    expect(await store.headers(upstreamId)).toMatchObject({ authorization: 'Bearer provider-secret' })
    const saved = await readFile(join(directory, 'data', 'gateway.json'), 'utf8')
    expect(saved).not.toContain('apiKeyEnv')
    expect(saved).not.toContain('legacy-secret')
  })
  it('returns keys only at creation, enforces stable model scopes, and preserves revocation across restarts', async () => {
    const { upstream, model, key, accessKey } = await configured()
    const fetch = mockCompletion()
    const second = await store.model({ alias: 'other-model', upstreamId: upstream.id, remoteModel: 'other', enabled: true })
    for (const invalid of [undefined, 'bad-key']) {
      expect((await app.request(`${prefix}/v1/models`, { headers: invalid ? { authorization: `Bearer ${invalid}` } : {} })).status).toBe(401)
      expect((await app.request(`${prefix}/v1/chat/completions`, post(chat, invalid))).status).toBe(401)
    }
    expect((await app.request(`${prefix}/v1/chat/completions`, post({ ...chat, model: second.alias }, key))).status).toBe(403)
    const list = await app.request(`${prefix}/v1/models`, { headers: { authorization: `Bearer ${key}` } })
    expect(await list.json()).toMatchObject({ data: [{ id: 'public-model' }] })
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat, key))).status).toBe(200)
    expect((await store.snapshot()).audits[0]).toMatchObject({ accessKeyId: accessKey.id, inputTokens: null, outputTokens: null })
    const response = await app.request(`${prefix}/access-keys`, post({ name: 'Web-created', modelIds: [model.id] }), socketBinding())
    const created = await response.json()
    expect(Object.keys(created).sort()).toEqual(['accessKey', 'key'])
    expect(Object.keys(created.accessKey).sort()).toEqual(['createdAt', 'id', 'modelIds', 'name', 'revokedAt'])
    const publicList = await (await app.request(`${prefix}/access-keys`, undefined, socketBinding())).json()
    expect(publicList.accessKeys).toHaveLength(2)
    expect(JSON.stringify(publicList)).not.toContain(created.key)
    expect(await readFile(join(directory, 'data', 'gateway.json'), 'utf8')).not.toContain(key)
    const revoked = await (await app.request(`${prefix}/access-keys/${accessKey.id}/revoke`, { method: 'POST' }, socketBinding())).json()
    expect(revoked.revokedAt).toEqual(expect.any(String))
    const restarted = new GatewayStore(join(directory, 'data'))
    expect(await restarted.revokeAccessKey(accessKey.id)).toEqual(revoked)
    await expect(restarted.authenticate(`Bearer ${key}`)).rejects.toMatchObject({ status: 401 })
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat, key))).status).toBe(401)
    expect(fetch).toHaveBeenCalledTimes(1)
    for (const modelIds of [[], ['public-model'], [model.id, model.id], [randomUUID()]]) {
      expect((await app.request(`${prefix}/access-keys`, post({ name: 'Invalid', modelIds }), socketBinding())).status).toBe(400)
    }
  })
  it('denies admin requests without an actual loopback binding, including legacy and prototype APIs', async () => {
    const { key } = await configured()
    for (const path of [`${prefix}/config`, `${prefix}/access-keys`, `${prefix}/test`, '/api/v1/sharing/devices', '/api/v1/web/prototype/snapshot', '/api/v1/web/prototype/actions']) {
      const init = path.endsWith('/test') || path.endsWith('/actions') ? post(chat, key) : { headers: { authorization: `Bearer ${key}` } }
      for (const binding of [undefined, socketBinding('192.168.1.8'), socketBinding('::ffff:192.168.1.8')]) {
        expect((await app.request(path, init, binding)).status).toBe(403)
      }
      for (const headers of [{ 'x-forwarded-for': '127.0.0.1' }, { forwarded: 'for=127.0.0.1' }, { 'x-real-ip': '127.0.0.1' }]) {
        expect((await app.request(path, { ...init, headers: { ...init.headers, ...headers } }, socketBinding())).status).toBe(403)
      }
    }
    for (const address of ['127.0.0.1', '127.0.0.2', '::1', '::ffff:127.0.0.1']) {
      expect((await app.request(`${prefix}/config`, undefined, socketBinding(address))).status).toBe(200)
    }
    mockCompletion()
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat, key), socketBinding('192.168.1.8'))).status).toBe(200)
  })
  it('uses the same forwarding and auditing for local nonstream tests without bypassing inference authentication', async () => {
    const { upstream } = await configured()
    const fetch = mockCompletion()
    const toolMessages = [{ role: 'assistant', tool_calls: [{ id: 'call', type: 'function', function: { name: 'lookup', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'call', content: 'result' }]
    const response = await app.request(`${prefix}/test`, post({ ...chat, messages: toolMessages }), socketBinding())
    expect(response.status).toBe(200)
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toMatchObject({ model: 'remote-model', messages: toolMessages })
    expect((await store.snapshot()).audits[0]).toMatchObject({ status: 'success', accessKeyId: null, upstreamId: upstream.id })
    expect((await app.request(`${prefix}/test`, post({ ...chat, stream: true }), socketBinding())).status).toBe(400)
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat), socketBinding())).status).toBe(401)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('uses only the configured gateway URL and omits unavailable models from client discovery', async () => {
    const { upstream, key } = await configured()
    expect((await store.snapshot()).gatewayBaseUrl).toBeNull()
    vi.stubEnv('SHARESERVER_GATEWAY_BASE_URL', 'https://gateway.example/service/api/v1/gateway/v1/')
    const response = await app.request(`${prefix}/config`, { headers: { host: 'attacker.example' } }, socketBinding())
    expect((await response.json()).gatewayBaseUrl).toBe('https://gateway.example/service/api/v1/gateway/v1')
    vi.stubEnv('SHARESERVER_MASTER_KEY', '')
    expect(await (await app.request(`${prefix}/v1/models`, { headers: { authorization: `Bearer ${key}` } })).json()).toMatchObject({ data: [] })
    vi.stubEnv('SHARESERVER_MASTER_KEY', '12'.repeat(32))
    await store.upstream({ ...upstreamInput, enabled: false }, upstream.id)
    expect((await app.request(`${prefix}/v1/chat/completions`, post(chat, key))).status).toBe(403)
  })
  it('preserves mapping and credentials after failed discovery and sends no auth to unauthenticated upstreams', async () => {
    const { upstream, model } = await configured()
    const before = await store.snapshot()
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('provider-secret sensitive failure', { status: 401 }))
    const response = await app.request(`${prefix}/upstreams/${upstream.id}/discover`, { method: 'POST' }, socketBinding())
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_HTTP_ERROR', message: 'Upstream returned HTTP 401.' } })
    expect(await store.snapshot()).toEqual(before)
    await store.upstream({ name: upstream.name, baseUrl: upstream.baseUrl, protocol: upstream.protocol, authentication: 'none', enabled: true, credentialAction: 'keep' }, upstream.id)
    fetch.mockResolvedValueOnce(Response.json({ choices: [] }))
    expect((await app.request(`${prefix}/test`, post(chat), socketBinding())).status).toBe(200)
    expect(fetch.mock.calls[1][1]?.headers).toEqual({ 'content-type': 'application/json' })
    const renamed = await store.model({ alias: 'renamed', upstreamId: upstream.id, remoteModel: model.remoteModel, enabled: true }, model.id)
    expect(renamed.id).toBe(model.id)
    const { key } = await store.createAccessKey({ name: 'Renamed client', modelIds: [model.id] })
    expect(await (await app.request(`${prefix}/v1/models`, { headers: { authorization: `Bearer ${key}` } })).json()).toMatchObject({ data: [{ id: 'renamed' }] })
  })
  it('initializes an external master key explicitly, refuses overwrite/data paths, and supports file-backed credentials', async () => {
    const file = join(directory, 'master.key')
    const data = join(directory, 'data')
    await mkdir(data)
    const command = resolve('scripts/init-master-key.mjs')
    const env = { ...process.env, SHARESERVER_DATA_DIR: data }
    const result = await exec(process.execPath, [command, file], { env })
    const key = (await readFile(file, 'utf8')).trim()
    expect(key).toMatch(/^[a-f0-9]{64}$/)
    expect(result.stdout).not.toContain(key)
    await expect(exec(process.execPath, [command, file], { env })).rejects.toMatchObject({ code: 1 })
    await expect(exec(process.execPath, [command, join(data, 'bad.key')], { env })).rejects.toMatchObject({ code: 1 })
    expect((await readFile(file, 'utf8')).trim()).toBe(key)
    vi.stubEnv('SHARESERVER_MASTER_KEY', '')
    vi.stubEnv('SHARESERVER_MASTER_KEY_FILE', file)
    const upstream = await store.upstream(upstreamInput)
    expect(await new GatewayStore(data).headers(upstream.id)).toMatchObject({ authorization: 'Bearer provider-secret' })
    await writeFile(join(data, 'bad.key'), `${key}\n`)
    vi.stubEnv('SHARESERVER_MASTER_KEY_FILE', join(data, 'bad.key'))
    await expect(store.headers(upstream.id)).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' })
  })
})
