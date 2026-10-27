import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { SignJWT, jwtVerify } from 'jose'
import { unzip } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { officeFormats, conversionFormats, inputFormats, fileExtension, outputFormat, type OfficeFormat } from './formats.js'
import { officeCustomization, officeLogo } from './branding.js'

function origin(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Office URLs must be HTTP(S) origins')
  return url.origin
}
export function officeSettings(env = process.env) {
  const cfg = {
    enabled: env.OFFICE_ENABLED === 'true', root: env.OFFICE_DATA_DIR ?? './data/office',
    secret: env.ONLYOFFICE_JWT_SECRET ?? '', public: origin(env.ONLYOFFICE_PUBLIC_URL ?? 'http://localhost:8080'),
    internal: origin(env.ONLYOFFICE_INTERNAL_URL ?? 'http://onlyoffice'),
    api: origin(env.OFFICE_INTERNAL_URL ?? 'http://shareserver:8787'),
    web: env.SHARESERVER_PUBLIC_URL ? origin(env.SHARESERVER_PUBLIC_URL) : undefined,
    whiteLabel: env.OFFICE_WHITE_LABEL_ENABLED === 'true',
    customUi: env.OFFICE_CUSTOM_UI_ENABLED === 'true',
    limit: Number(env.OFFICE_MAX_BYTES ?? 20 * 1024 * 1024),
    quota: Number(env.OFFICE_QUOTA_BYTES ?? 1024 * 1024 * 1024),
    timeout: Number(env.OFFICE_TIMEOUT_SECONDS ?? 30) * 1000
  }
  if (cfg.enabled && cfg.secret.length < 32) throw new Error('ONLYOFFICE_JWT_SECRET requires at least 32 characters')
  if ([cfg.limit, cfg.quota, cfg.timeout].some(n => !Number.isFinite(n) || n <= 0)) throw new Error('Office limits must be positive')
  return cfg
}
type Version = { file: string; digest: string; size: number }
type Session = { key: string; state: string; source: string; nonce: string; sequence: number; pending: string | null; completed: string[] }
type Document = Partial<Version> & { id: string; name: string; originalName?: string; revision: number; updatedAt?: number; session: Session | null; versions?: Record<string, Version>; error?: string | null }
type Payload = Record<string, unknown>
const id = () => randomUUID().replaceAll('-', '')
const fail = (status: 400 | 401 | 404 | 409 | 413 | 422 | 502 | 503 | 507, message: string): never => { throw new HTTPException(status, { message }) }

export async function validateOffice(content: Uint8Array, limit: number, format: OfficeFormat) {
  const definition = officeFormats[format]
  try {
    let count = 0, expanded = 0
    const names = new Set<string>()
    let invalid = false
    const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(content, {
      filter(entry) {
        count++; expanded += entry.originalSize
        if (count > 4096 || names.has(entry.name) || expanded > limit * 10 || /vbaproject/i.test(entry.name)) invalid = true
        names.add(entry.name)
        return !invalid
      }
    }, (error, result) => error ? reject(error) : resolve(result)))
    if (invalid || !['[Content_Types].xml', '_rels/.rels', definition.part].every(n => files[n])) throw new Error('Invalid archive')
    const types = Buffer.from(files['[Content_Types].xml']).toString('utf8')
    const document = Buffer.from(files[definition.part]).toString('utf8')
    if ([types, document].some(xml => /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)) throw new Error('Invalid XML')
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true })
    const parsed = parser.parse(types)
    const overrides = parsed.Types?.Override
    if (![overrides].flat().some(item => item?.['@_PartName'] === `/${definition.part}` && item?.['@_ContentType'] === definition.contentType)) throw new Error('Wrong document type')
    if (!parser.parse(document)[definition.root] || !document.includes(`http://schemas.openxmlformats.org/${definition.namespace}/2006/main`)) throw new Error('Invalid document XML')
  } catch { fail(422, `文件不是受支持的 ${format.toUpperCase()}，或解压后超过限制`) }
}

async function atomicWrite(path: string, content: Uint8Array | string) {
  const temporary = `${path}.${id()}.tmp`
  try {
    const file = await open(temporary, 'wx')
    try { await file.writeFile(content); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
    const directory = await open(dirname(path), 'r')
    try { await directory.sync() } finally { await directory.close() }
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}
async function bounded(body: ReadableStream<Uint8Array> | null, limit: number) {
  const chunks: Uint8Array[] = []; let length = 0
  if (body) {
    const reader = body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.length
        if (length > limit) { await reader.cancel(); fail(413, '文件超过大小限制') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
  }
  return Buffer.concat(chunks)
}

export function createOfficeService(cfg = officeSettings(), request: typeof fetch = fetch) {
  const routes = new Hono()
  const secret = new TextEncoder().encode(cfg.secret)
  const conversionSources = new Map<string, Uint8Array>()
  let queue: Promise<unknown> = Promise.resolve()
  function locked<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(work)
    queue = result.catch(() => {})
    return result
  }
  function enabled() { if (!cfg.enabled) fail(503, 'Office 尚未启用，请配置 ShareServer Office 模块') }
  async function load(documentId: string): Promise<Document> {
    enabled()
    if (!/^[a-f0-9]{32}$/.test(documentId)) fail(404, '文档不存在')
    try { return JSON.parse(await readFile(join(cfg.root, `${documentId}.json`), 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') fail(404, '文档不存在'); throw error }
  }
  const store = (record: Document) => atomicWrite(join(cfg.root, `${record.id}.json`), JSON.stringify(record))
  const summary = (r: Document) => ({ id: r.id, name: r.name, originalName: r.originalName, requiresSaveAs: !!r.originalName, revision: r.revision, size: r.size, updatedAt: r.updatedAt, digest: r.digest, state: r.session?.state ?? 'saved', error: r.error ?? null })
  async function version(record: Document, content: Uint8Array) {
    const format = outputFormat(record.name)
    await validateOffice(content, cfg.limit, format)
    let used = 0
    for (const name of await readdir(cfg.root)) if (Object.hasOwn(officeFormats, fileExtension(name))) used += (await stat(join(cfg.root, name))).size
    if (used + content.length > cfg.quota) fail(507, 'Office 存储额度不足')
    const digest = createHash('sha256').update(content).digest('hex')
    if (digest === record.digest) return
    const versions = record.versions ??= {}
    if (record.file) versions[String(record.revision)] = { file: record.file, digest: record.digest!, size: record.size! }
    const file = `${record.id}-${id()}.${format}`
    await atomicWrite(join(cfg.root, file), content)
    Object.assign(record, { file, digest, revision: record.revision + 1, size: content.length, updatedAt: Date.now() / 1000 })
    versions[String(record.revision)] = { file, digest, size: content.length }
  }
  const sign = (payload: Payload) => new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).sign(secret)
  async function decode(token: string): Promise<Payload> {
    try { return (await jwtVerify(token, secret, { algorithms: ['HS256'] })).payload }
    catch { return fail(401, 'ONLYOFFICE 签名无效') }
  }
  function session(record: Document, key: string) {
    if (!record.session || record.session.key !== key) return fail(409, '编辑轮次已过期')
    return record.session
  }
  async function command(payload: Payload) {
    try {
      const response = await request(`${cfg.internal}/coauthoring/CommandService.ashx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
        body: JSON.stringify({ ...payload, token: await sign(payload) }), signal: AbortSignal.timeout(cfg.timeout)
      })
      if (!response.ok) throw new Error(`Docs HTTP ${response.status}`)
      return await response.json() as { error: number }
    } catch { return fail(502, '编辑服务结果待确认，请等待回调或核对轮次') }
  }
  routes.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ detail: error.message }, error.status)
    console.error('Office operation failed', error)
    return c.json({ detail: 'Office 操作失败，最近成功版本保留' }, 500)
  })
  routes.get('/api/v1/office/config', c => c.json({ enabled: cfg.enabled, maxBytes: cfg.limit, publicUrl: cfg.public, webUrl: cfg.web, formats: inputFormats, directFormats: Object.keys(officeFormats), conversions: conversionFormats, versionedDownload: true, productionReady: false }))
  routes.get('/internal/office/conversion/:key/source', async c => {
    enabled()
    const key = c.req.param('key'), content = conversionSources.get(key)
    if (!content) return fail(404, '转换源文件已释放，请重新上传')
    const claims = await decode((c.req.header('authorization') ?? '').replace(/^Bearer /, ''))
    if (((claims.payload ?? claims) as Payload).url !== `${cfg.api}/internal/office/conversion/${key}/source`) fail(401, '转换源签名地址不匹配')
    return new Response(Buffer.from(content), { headers: { 'Content-Type': 'application/octet-stream' } })
  })
  async function convert(content: Uint8Array, name: string): Promise<Uint8Array> {
    // Old binary Office formats are compound files; reject other data before invoking Docs.
    if (!Buffer.from(content.subarray(0, 8)).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) fail(422, '文件不是受支持的旧版 Office 二进制文件')
    const key = id()
    conversionSources.set(key, content)
    try {
      const payload = { async: false, filetype: fileExtension(name), outputtype: outputFormat(name), key,
        url: `${cfg.api}/internal/office/conversion/${key}/source`, title: name }
      const response = await request(`${cfg.internal}/converter`, { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...payload, token: await sign(payload) }), signal: AbortSignal.timeout(cfg.timeout) })
      if (!response.ok) return fail(502, `转换服务 HTTP ${response.status}`)
      const result = await response.json() as { error?: number; endConvert?: boolean; fileUrl?: string }
      if (result.error || !result.endConvert || !result.fileUrl) return fail(502, `旧格式转换失败（${result.error ?? '未完成'}），原文件未修改`)
      const url = new URL(result.fileUrl)
      if (url.username || url.password || ![cfg.internal, cfg.public].includes(url.origin)) return fail(502, '转换结果地址无效')
      const download = await request(`${cfg.internal}${url.pathname}${url.search}`, { redirect: 'error', signal: AbortSignal.timeout(cfg.timeout) })
      if (!download.ok) return fail(502, '无法下载转换结果')
      return await bounded(download.body, cfg.limit)
    } catch (error) {
      if (error instanceof HTTPException) throw error
      return fail(502, '旧格式转换或下载失败，请重试；原文件未修改')
    } finally { conversionSources.delete(key) }
  }
  routes.get('/api/v1/office/documents', async c => {
    enabled()
    return c.json(await locked(async () => ({ documents: await Promise.all((await readdir(cfg.root)).filter(n => n.endsWith('.json')).sort().map(async n => summary(JSON.parse(await readFile(join(cfg.root, n), 'utf8'))))) })))
  })
  routes.post('/api/v1/office/documents', async c => {
    enabled()
    const name = c.req.query('name') ?? ''
    if (!/\.[^.]+$/.test(name) || !inputFormats.includes(fileExtension(name)) || name.length > 200 || /[/\\\r\n]/.test(name)) fail(422, '请使用有效的 Office 文件名（最多 200 字符）')
    let content: Uint8Array = await bounded(c.req.raw.body, cfg.limit)
    const converted = Object.hasOwn(conversionFormats, fileExtension(name))
    if (converted) content = await convert(content, name)
    const result = await locked(async () => {
      const record: Document = { id: id(), name: converted ? name.replace(/\.[^.]+$/, `.${outputFormat(name)}`) : name,
        ...(converted ? { originalName: name } : {}), revision: 0, session: null }
      await version(record, content); await store(record); return summary(record)
    })
    return c.json(result, 201)
  })
  routes.get('/api/v1/office/documents/:id', async c => c.json(summary(await load(c.req.param('id')))))
  routes.get('/api/v1/office/documents/:id/download', async c => {
    const record = await load(c.req.param('id'))
    const raw = c.req.query('revision'), revision = raw === undefined ? record.revision : Number(raw)
    if (!Number.isSafeInteger(revision) || revision < 1) fail(422, '版本号无效')
    const selected = revision === record.revision ? record : record.versions?.[String(revision)]
    if (!selected?.file) return fail(404, '该文档版本不存在')
    return new Response(await readFile(join(cfg.root, selected.file)), { headers: {
      'Content-Type': officeFormats[outputFormat(record.name)].mime,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(record.name)}`,
      ETag: `"${selected.digest}"`, 'X-Office-Revision': String(revision), 'Cache-Control': 'no-store'
    } })
  })
  routes.post('/api/v1/office/documents/:id/editor', async c => c.json(await locked(async () => {
    const record = await load(c.req.param('id'))
    let current = record.session
    if (current && ['recovering', 'error', 'saving'].includes(current.state)) fail(409, '编辑轮次正在保存或待确认，请等待回调后重试')
    if (!current || ['saved', 'closed'].includes(current.state)) {
      current = { key: id(), state: 'editing', source: record.file!, nonce: randomBytes(32).toString('base64url'), sequence: 0, pending: null, completed: [] }
      record.session = current; await store(record)
    }
    const base = `${cfg.api}/internal/office/${record.id}/${current.key}`
    const configuration = {
      documentType: officeFormats[outputFormat(record.name)].documentType, type: 'desktop',
      document: { fileType: outputFormat(record.name), key: current.key, title: record.name, url: `${base}/source?access=${current.nonce}`, permissions: { chat: false } },
      editorConfig: { mode: 'edit', lang: /^en(?:-|,|;|$)/i.test(c.req.header('Accept-Language') ?? '') ? 'en' : 'zh-CN', callbackUrl: `${base}/callback`, customization: officeCustomization(cfg.web ?? new URL(c.req.url).origin, cfg.whiteLabel, cfg.customUi),
        plugins: { autostart: ['asc.{C32D455A-5134-4E5C-A161-D919D9380020}'], pluginsData: [`${new URL(c.req.url).origin}/api/v1/office/plugin/config.json`] } }
    }
    return { scriptUrl: `${cfg.public}/web-apps/apps/api/documents/api.js`, config: { ...configuration, token: await sign(configuration) } }
  })))
  routes.get('/api/v1/office/branding/:asset', async c => {
    const name = c.req.param('asset')
    if (!['icon-light.png', 'icon-dark.png', 'logo-light.svg', 'logo-dark.svg'].includes(name)) return fail(404, '品牌资源不存在')
    const dark = name.includes('-dark.')
    const icon = await readFile(new URL(`./branding/icon-${dark ? 'dark' : 'light'}.png`, import.meta.url))
    c.header('Access-Control-Allow-Origin', cfg.public)
    c.header('Vary', 'Origin')
    c.header('Cross-Origin-Resource-Policy', 'cross-origin')
    c.header('Cache-Control', 'public, max-age=3600')
    c.header('Content-Security-Policy', "default-src 'none'; img-src data:")
    c.header('Content-Type', name.endsWith('.svg') ? 'image/svg+xml' : 'image/png')
    return c.body(name.endsWith('.svg') ? officeLogo(icon, dark) : icon)
  })
  routes.get('/api/v1/office/plugin/config.json', c => {
    c.header('Access-Control-Allow-Origin', cfg.public); c.header('Vary', 'Origin')
    return c.json({ name: 'GoodBuddy', guid: 'asc.{C32D455A-5134-4E5C-A161-D919D9380020}', baseUrl: '', variations: [{ description: 'GoodBuddy AI 选区编辑', url: 'index.html', icons: ['../branding/icon-light.png', '../branding/icon-light.png'], isViewer: false, EditorsSupport: ['word', 'cell', 'slide'], type: 'background', events: ['onContextMenuShow', 'onContextMenuClick'], isVisual: false, isModal: false, isInsideMode: false, initDataType: 'none', initData: '', buttons: [] }] })
  })
  routes.get('/api/v1/office/plugin/index.html', async c => {
    c.header('Access-Control-Allow-Origin', cfg.public); c.header('Vary', 'Origin')
    // This page must run inside Docs' plugin iframe, with its existing narrow postMessage bridge.
    // Docs 10 plugins.js evaluates its initialization payload inside this frame.
    c.header('Content-Security-Policy', `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${cfg.public}; style-src 'unsafe-inline'; connect-src 'self' ${cfg.public}; frame-ancestors 'self' ${cfg.public}`)
    return c.html((await readFile(new URL('./plugin/index.html', import.meta.url), 'utf8')).replace('__DOCS_ORIGIN__', JSON.stringify(cfg.public)))
  })
  routes.get('/internal/office/:id/:key/source', async c => {
    const record = await load(c.req.param('id')), current = session(record, c.req.param('key'))
    const access = c.req.query('access')
    if (access !== current.nonce) fail(401, '文件访问凭据无效')
    const claims = await decode((c.req.header('authorization') ?? '').replace(/^Bearer /, ''))
    const payload = (claims.payload ?? claims) as Payload
    if (payload.url !== `${cfg.api}/internal/office/${record.id}/${current.key}/source?access=${access}`) fail(401, '文件签名地址不匹配')
    return new Response(await readFile(join(cfg.root, current.source)), { headers: { 'Content-Type': officeFormats[outputFormat(record.name)].mime } })
  })
  routes.post('/api/v1/office/documents/:id/save', async c => {
    const payload = await locked(async () => {
      const record = await load(c.req.param('id')), current = record.session
      if (!current || current.state !== 'editing' || current.pending) return fail(409, '当前轮次不可发起保存，请等待正在进行的保存')
      const marker = `${current.key}:${++current.sequence}`
      Object.assign(current, { pending: marker, state: 'saving' }); await store(record)
      return { c: 'forcesave', key: current.key, userdata: marker }
    })
    const result = await command(payload)
    if (result.error !== 0) {
      await locked(async () => {
        const record = await load(c.req.param('id')), current = session(record, payload.key)
        if (current.pending === payload.userdata) {
          Object.assign(current, { pending: null, state: result.error === 4 ? 'editing' : 'error' })
          record.error = result.error === 4 ? null : 'ONLYOFFICE 拒绝保存命令'; await store(record)
        }
      })
      if (result.error !== 4) fail(502, 'ONLYOFFICE 拒绝保存命令')
    }
    return c.json({ accepted: result.error === 0, noChanges: result.error === 4 })
  })
  routes.post('/api/v1/office/documents/:id/reconcile', async c => {
    const record = await load(c.req.param('id'))
    if (!record.session) return fail(409, '尚无编辑轮次')
    if ((await command({ c: 'info', key: record.session.key })).error !== 0) fail(409, '编辑服务无法确认该轮次；保留已保存版本，需检查编辑服务缓存')
    return c.json({ accepted: true })
  })
  routes.post('/internal/office/:id/:key/callback', async c => {
    enabled()
    const raw = await bounded(c.req.raw.body, 65536)
    let body: Payload
    try { body = JSON.parse(raw.toString()); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error() }
    catch { return fail(400, '回调格式无效') }
    const claims = await decode((c.req.header('authorization') ?? '').replace(/^Bearer /, '') || String(body.token ?? ''))
    const payload = claims.payload ?? Object.fromEntries(Object.entries(claims).filter(([k]) => !['iat', 'exp', 'nbf'].includes(k)))
    const unsigned = Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'token'))
    if ((!isDeepStrictEqual(payload, body) && !isDeepStrictEqual(payload, unsigned)) || body.key !== c.req.param('key')) fail(401, '回调内容与签名不匹配')
    return locked(async () => {
      let record = await load(c.req.param('id'))
      const current = session(record, c.req.param('key')), status = body.status
      if (['saved', 'closed'].includes(current.state)) return c.json({ error: 0 })
      if (status === 1) {
        if (current.state === 'recovering') current.state = current.pending ? 'saving' : 'editing'
        if (Array.isArray(body.users) && body.users.length === 0) current.state = 'saving'
      } else if (status === 3 || status === 7) {
        Object.assign(current, { state: 'error', pending: null }); record.error = 'ONLYOFFICE 报告保存失败；保留最近成功版本'
      } else if (status === 4) Object.assign(current, { state: 'closed', pending: null })
      else if (status === 2 || status === 6) {
        const marker = body.userdata
        const editorSave = status === 6 && body.forcesavetype === 1 && !marker
        if (status === 6) {
          if (editorSave) {
            if (current.pending || !['editing', 'error'].includes(current.state)) return c.json({ error: 1 }, 409)
          } else {
            if (current.completed.includes(String(marker))) return c.json({ error: 0 })
            if (!marker || marker !== current.pending || body.forcesavetype !== 0) return c.json({ error: 1 }, 409)
          }
        }
        try {
          const output = new URL(String(body.url))
          if (output.username || output.password || output.hash || ![cfg.public, cfg.internal].includes(output.origin)) throw new Error('Unapproved save origin')
          const response = await request(`${cfg.internal}${output.pathname}${output.search}`, { redirect: 'error', signal: AbortSignal.timeout(cfg.timeout) })
          if (response.status !== 200) throw new Error('Save download failed')
          await version(record, await bounded(response.body, cfg.limit))
          Object.assign(current, { state: status === 2 ? 'saved' : 'editing', pending: null })
          if (status === 6 && !editorSave) current.completed.push(String(marker))
          record.error = null; await store(record)
          return c.json({ error: 0 })
        } catch {
          record = await load(c.req.param('id')); record.error = '保存失败；最近成功版本未改变，可重试回调'
          record.session!.state = 'error'; await store(record).catch(() => {})
          return c.json({ error: 1 }, 500)
        }
      } else return c.json({ error: 1 }, 400)
      await store(record); return c.json({ error: 0 })
    })
  })
  async function initialize() {
    if (!cfg.enabled) return
    await mkdir(cfg.root, { recursive: true })
    for (const name of await readdir(cfg.root)) {
      if (!name.endsWith('.json')) continue
      const record: Document = JSON.parse(await readFile(join(cfg.root, name), 'utf8'))
      if (record.session && ['editing', 'saving'].includes(record.session.state)) { record.session.state = 'recovering'; await store(record) }
    }
  }
  return { routes, initialize }
}
