// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { AuthService } from './auth.js'
import { consoleAssetRoutes, MAX_CONSOLE_ASSET_SIZE } from './console-assets.js'

const base = '/api/v1/console-assets'
const origin = 'http://192.168.0.23:8088'
let directory: string
let app: Hono
let cookie: string
let auth: AuthService
function mount() {
  const host = new Hono()
  host.route('/api/v1/auth', auth.routes())
  host.use(`${base}/*`, auth.requireAdmin)
  host.route(base, consoleAssetRoutes(directory))
  return host
}
function upload(bytes = new Uint8Array([0, 255, 12, 128]), name = '发布.zip', session = cookie) {
  const body = new FormData()
  body.append('file', new File([bytes], name))
  return app.request(base, { method: 'POST', headers: { Cookie: session, Origin: origin }, body })
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'console-assets-'))
  auth = new AuthService({ enabled: true, directory, publicUrl: origin })
  await auth.initialize()
  app = mount()
  const response = await app.request('/api/v1/auth/setup', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'asset-test-password-123', setupToken: await readFile(join(directory, 'admin-setup-token'), 'utf8') }) })
  expect(response.status).toBe(200)
  cookie = response.headers.get('set-cookie')!.split(';')[0]
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

it('persists exact binary bytes by digest across route recreation and deduplicates concurrent uploads', async () => {
  const bytes = new Uint8Array([0, 255, 12, 128])
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const responses = await Promise.all([upload(bytes), upload(bytes, 'other.zip')])
  expect(responses.map(r => r.status)).toEqual([201, 201])
  const asset = await responses[0].json()
  expect(asset).toEqual({ name: '发布.zip', size: 4, sha256, url: `${base}/${sha256}?name=${encodeURIComponent('发布.zip')}` })
  expect(await readdir(join(directory, 'console-assets'))).toEqual([sha256])
  expect(await readFile(join(directory, 'console-assets', sha256))).toEqual(Buffer.from(bytes))
  app = mount()
  const download = await app.request(asset.url, { headers: { Cookie: cookie } })
  expect(download.status).toBe(200)
  expect(Buffer.from(await download.arrayBuffer())).toEqual(Buffer.from(bytes))
  expect(download.headers.get('content-type')).toBe('application/octet-stream')
  expect(download.headers.get('content-disposition')).toContain(`filename*=UTF-8''${encodeURIComponent('发布.zip')}`)
  expect(download.headers.get('x-content-type-options')).toBe('nosniff')
  expect(download.headers.get('cache-control')).toBe('no-store')
})

it('protects both upload and download with real admin sessions and rejects cross-origin upload', async () => {
  expect((await upload(undefined, undefined, '')).status).toBe(401)
  const asset = await (await upload()).json()
  expect((await app.request(asset.url)).status).toBe(401)
  expect((await app.request(asset.url, { headers: { Cookie: 'shareserver_session=forged' } })).status).toBe(401)
  expect((await app.request(base, { method: 'POST', headers: { Cookie: cookie, Origin: 'http://evil.example' } })).status).toBe(403)
})

it('accepts the exact 20 MiB boundary and rejects larger files and chunked request bodies', async () => {
  expect((await upload(new Uint8Array(MAX_CONSOLE_ASSET_SIZE))).status).toBe(201)
  expect((await upload(new Uint8Array(MAX_CONSOLE_ASSET_SIZE + 1))).status).toBe(413)
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < 22; i++) controller.enqueue(new Uint8Array(1024 * 1024)); controller.close() } })
  const response = await app.request(new Request(`${origin}${base}`, { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'multipart/form-data; boundary=test' }, body: stream, duplex: 'half' } as RequestInit))
  expect(response.status).toBe(413)
  expect(await readdir(join(directory, 'console-assets'))).toHaveLength(1)
})

it('rejects malformed, missing, text, duplicate and extra fields without writing files', async () => {
  const headers = { Cookie: cookie, Origin: origin }
  expect((await app.request(base, { method: 'POST', headers, body: '{}' })).status).toBe(415)
  expect((await app.request(base, { method: 'POST', headers: { ...headers, 'Content-Type': 'multipart/form-data; boundary=x' }, body: 'broken' })).status).toBe(400)
  for (const kind of ['missing', 'text', 'duplicate', 'extra']) {
    const form = new FormData()
    if (kind !== 'missing') form.append('file', kind === 'text' ? 'https://example.com' : new File(['a'], 'a'))
    if (kind === 'duplicate') form.append('file', new File(['b'], 'b'))
    if (kind === 'extra') form.append('url', 'https://example.com')
    expect((await app.request(base, { method: 'POST', headers, body: form })).status).toBe(400)
  }
  await expect(readdir(join(directory, 'console-assets'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('validates digest paths and sanitizes attachment names, including query metadata', async () => {
  const asset = await (await upload(undefined, '../bad"name.zip')).json()
  expect(asset.name).toBe('bad_name.zip')
  for (const digest of ['nope', 'A'.repeat(64), 'a'.repeat(63), '%2e%2e%2fsecret', `${'a'.repeat(64)}%2fsecret`]) {
    expect((await app.request(`${base}/${digest}`, { headers: { Cookie: cookie } })).status).toBe(400)
  }
  expect((await app.request(`${base}/${'0'.repeat(64)}`, { headers: { Cookie: cookie } })).status).toBe(404)
  const response = await app.request(`${base}/${asset.sha256}?name=${encodeURIComponent('../../a\r\n".html')}`, { headers: { Cookie: cookie } })
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="asset.bin"; filename*=UTF-8\'\'a___.html')
})
