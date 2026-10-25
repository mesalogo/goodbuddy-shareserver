// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { SignJWT, jwtVerify } from 'jose'
import { createOfficeService, officeSettings } from './service.js'

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>() }))

function docx(text = 'original') {
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships/>'),
    'word/document.xml': strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`)
  }, { mtime: new Date('2026-01-01') }))
}
describe('unified Office API', () => {
  let cfg: ReturnType<typeof officeSettings>
  let service: ReturnType<typeof createOfficeService>
  let content: Buffer, status: number, commandError: number, timeout: boolean
  let commands: Record<string, unknown>[]
  const sign = (payload: Record<string, unknown>) => new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(cfg.secret))
  const upstream: typeof fetch = async (_url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      await jwtVerify(body.token, new TextEncoder().encode(cfg.secret))
      commands.push(body)
      return Response.json({ error: commandError })
    }
    if (timeout) throw new Error('timeout')
    return new Response(content, { status })
  }
  const req = (path: string, init?: RequestInit) => service.routes.request(`http://192.168.0.23:8088${path}`, init)
  async function upload() {
    const response = await req('/api/v1/office/documents?name=test.docx', { method: 'POST', body: docx() })
    expect(response.status).toBe(201)
    return (await response.json()).id as string
  }
  async function launch(id: string) {
    const response = await req(`/api/v1/office/documents/${id}/editor`, { method: 'POST' })
    expect(response.status).toBe(200)
    return (await response.json()).config
  }
  async function callback(config: Awaited<ReturnType<typeof launch>>, status = 2, fields: Record<string, unknown> = {}) {
    const body = { key: config.document.key, status, ...fields }
    return req(new URL(config.editorConfig.callbackUrl).pathname, { method: 'POST', headers: { authorization: `Bearer ${await sign({ payload: body })}` }, body: JSON.stringify(body) })
  }
  beforeEach(async () => {
    cfg = officeSettings({ OFFICE_ENABLED: 'true', OFFICE_DATA_DIR: await mkdtemp(join(tmpdir(), 'gb-office-')), ONLYOFFICE_JWT_SECRET: 'test-secret-at-least-32-characters-long', ONLYOFFICE_PUBLIC_URL: 'http://192.168.0.23:8080' })
    content = docx('changed'); status = 200; commands = []; commandError = 0; timeout = false
    service = createOfficeService(cfg, upstream); await service.initialize()
  })
  afterEach(async () => { await rm(cfg.root, { recursive: true, force: true }) })
  it('signs source and editor configs and publishes IP-based plugin URLs', async () => {
    const id = await upload(), config = await launch(id)
    expect((await launch(id)).document.key).toBe(config.document.key)
    const signed = await jwtVerify(config.token, new TextEncoder().encode(cfg.secret))
    expect(signed.payload.document).toEqual(config.document)
    expect(config.editorConfig.plugins.pluginsData).toEqual(['http://192.168.0.23:8088/api/v1/office/plugin/config.json'])
    const url = new URL(config.document.url)
    expect((await req(url.pathname + url.search)).status).toBe(401)
    const source = await req(url.pathname + url.search, { headers: { authorization: `Bearer ${await sign({ payload: { url: url.href } })}` } })
    expect(Buffer.from(await source.arrayBuffer())).toEqual(docx())
    const plugin = await req('/api/v1/office/plugin/config.json')
    expect(plugin.headers.get('access-control-allow-origin')).toBe(cfg.public)
    expect((await plugin.json()).variations[0].url).toBe('index.html')
    const html = await (await req('/api/v1/office/plugin/index.html')).text()
    expect(html).toContain('GetSelectedText'); expect(html).not.toContain(cfg.secret)
  })
  it('retains immutable versions across final saves, late callbacks and restart', async () => {
    const id = await upload(), config = await launch(id), path = `/api/v1/office/documents/${id}`
    const original = await (await req(path)).json()
    expect(await (await callback(config, 2, { url: cfg.public + '/cache/a' })).json()).toEqual({ error: 0 })
    expect(await (await callback(config, 2, { url: cfg.public + '/cache/a' })).json()).toEqual({ error: 0 })
    content = docx('late')
    await callback(config, 6, { url: cfg.internal + '/cache/b' })
    service = createOfficeService(cfg, upstream); await service.initialize()
    expect((await (await req(path)).json()).revision).toBe(2)
    expect(Buffer.from(await (await req(path + '/download')).arrayBuffer())).toEqual(docx('changed'))
    const old = await req(path + '/download?revision=1')
    expect(old.headers.get('etag')).toBe(`"${original.digest}"`)
    expect(Buffer.from(await old.arrayBuffer())).toEqual(docx())
    expect((await req(path + '/download?revision=999')).status).toBe(404)
    expect((await req(path + '/download?revision=0')).status).toBe(422)
    expect((await launch(id)).document.key).not.toBe(config.document.key)
    expect((await callback(config, 4)).status).toBe(409)
  })
  it('serializes force saves, deduplicates snapshots and finalizes the session', async () => {
    const id = await upload(), config = await launch(id), path = `/api/v1/office/documents/${id}`
    expect((await req(path + '/save', { method: 'POST' })).status).toBe(200)
    expect((await req(path + '/save', { method: 'POST' })).status).toBe(409)
    const fields = { userdata: commands.at(-1)!.userdata, forcesavetype: 0, url: cfg.internal + '/cache/a' }
    expect(await (await callback(config, 6, fields)).json()).toEqual({ error: 0 })
    expect(await (await callback(config, 6, fields)).json()).toEqual({ error: 0 })
    expect((await launch(id)).document.key).toBe(config.document.key)
    content = docx('final'); await callback(config, 2, { url: cfg.internal + '/cache/final' })
    expect((await (await req(path)).json()).revision).toBe(3)
  })
  it.each(['origin', 'redirect', 'format', 'size', 'timeout', 'disk'])('preserves committed contents on %s failure', async failure => {
    const id = await upload(), config = await launch(id), path = `/api/v1/office/documents/${id}`
    let url = cfg.internal + '/cache/a'
    if (failure === 'origin') url = 'http://untrusted/file'
    if (failure === 'redirect') status = 302
    if (failure === 'format') content = Buffer.from('not DOCX')
    if (failure === 'size') cfg.limit = 10
    if (failure === 'timeout') timeout = true
    // A metadata publication failure after the new bytes are written must not expose them.
    if (failure === 'disk') {
      const fs = await import('node:fs/promises')
      const original = fs.rename
      const spy = vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
        if (String(to).endsWith('.json')) throw new Error('disk failure')
        return original(from, to)
      })
      try { expect(await (await callback(config, 2, { url })).json()).toEqual({ error: 1 }) } finally { spy.mockRestore() }
    } else expect(await (await callback(config, 2, { url })).json()).toEqual({ error: 1 })
    expect((await (await req(path)).json()).revision).toBe(1)
    expect(Buffer.from(await (await req(path + '/download')).arrayBuffer())).toEqual(docx())
  })
  it('rejects unsigned/tampered callbacks, bad filenames and invalid uploads', async () => {
    expect((await req('/api/v1/office/documents?name=bad.docx', { method: 'POST', body: 'bad' })).status).toBe(422)
    expect((await req('/api/v1/office/documents?name=../bad.docx', { method: 'POST', body: docx() })).status).toBe(422)
    const config = await launch(await upload()), path = new URL(config.editorConfig.callbackUrl).pathname
    const body = { key: config.document.key, status: 4 }
    expect((await req(path, { method: 'POST', body: JSON.stringify(body) })).status).toBe(401)
    expect((await req(path, { method: 'POST', headers: { authorization: `Bearer ${await sign({ payload: body })}` }, body: JSON.stringify({ ...body, status: 2 }) })).status).toBe(401)
    expect((await callback(config, 6, { url: cfg.internal + '/cache/a' })).status).toBe(409)
    cfg.limit = 10
    expect((await req('/api/v1/office/documents?name=big.docx', { method: 'POST', body: docx() })).status).toBe(413)
  })
  it('accepts Docs body JWTs with registered claims', async () => {
    const config = await launch(await upload()), body = { key: config.document.key, status: 4 }
    const response = await req(new URL(config.editorConfig.callbackUrl).pathname, { method: 'POST', body: JSON.stringify({ ...body, token: await sign({ ...body, iat: 1, exp: 9999999999 }) }) })
    expect(await response.json()).toEqual({ error: 0 })
  })
  it('recovers active sessions after restart and handles no-change save', async () => {
    const id = await upload(), config = await launch(id), path = `/api/v1/office/documents/${id}`
    service = createOfficeService(cfg, upstream); await service.initialize()
    expect((await req(path + '/editor', { method: 'POST' })).status).toBe(409)
    await callback(config, 1, { users: ['user'] })
    expect((await launch(id)).document.key).toBe(config.document.key)
    commandError = 4
    expect(await (await req(path + '/save', { method: 'POST' })).json()).toEqual({ accepted: false, noChanges: true })
    expect((await (await req(path)).json()).state).toBe('editing')
  })
  it('reports disabled configuration without starting another backend', async () => {
    cfg.enabled = false
    service = createOfficeService(cfg)
    expect((await (await req('/api/v1/office/config')).json()).enabled).toBe(false)
    expect((await req('/api/v1/office/documents')).status).toBe(503)
    await mkdir(join(cfg.root, 'unused'))
  })
  it('allows the production plugin through the unified app frame policy', async () => {
    const { app } = await import('../app.js')
    const response = await app.request('http://192.168.0.23:8088/api/v1/office/plugin/index.html')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self' http://localhost:8080")
    expect(response.headers.get('cross-origin-resource-policy')).not.toBe('same-origin')
  })
})
