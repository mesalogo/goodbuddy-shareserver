import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Hono } from 'hono'

export const MAX_CONSOLE_ASSET_SIZE = 20 * 1024 * 1024
const maxRequestSize = MAX_CONSOLE_ASSET_SIZE + 64 * 1024
const baseUrl = '/api/v1/console-assets'

function safeName(value: string) {
  // Names are display/download metadata only, never filesystem paths.
  const name = value.split(/[\\/]/).pop()!.replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, '_').trim().replace(/^\.+|\.+$/g, '')
  return Array.from(name).slice(0, 120).join('') || 'asset.bin'
}

/**
 * Mount at /api/v1/console-assets AFTER the app's admin middleware.
 * POST /: multipart field `file`; returns { url, name, size, sha256 }.
 * GET /:sha256?name=...: authenticated attachment; name is optional metadata.
 * Bytes live only in <data directory>/console-assets/<sha256>, including when
 * PostgreSQL is enabled. Back up this directory; replicas need a shared volume.
 * There is no external fetching, execution, retention policy or automatic GC.
 */
export function consoleAssetRoutes(directory = process.env.SHARESERVER_DATA_DIR ?? './data') {
  const root = resolve(directory, 'console-assets')
  const app = new Hono()
  app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
  app.onError((_error, c) => c.json({ code: 'ASSET_STORAGE_ERROR', message: '资源存储暂时不可用。 / Asset storage is unavailable.' }, 500))
  app.post('/', async c => {
    const fail = (code: string, message: string, status: 400 | 413 | 415) => c.json({ code, message }, status)
    if (!/^multipart\/form-data\s*;/i.test(c.req.header('content-type') ?? '')) return fail('INVALID_UPLOAD', '请上传文件表单。 / Multipart file required.', 415)
    // Count actual bytes even without Content-Length (or with a dishonest value).
    const reader = c.req.raw.body?.getReader()
    if (!reader) return fail('INVALID_UPLOAD', '缺少文件。 / File required.', 400)
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maxRequestSize) {
          await reader.cancel()
          return fail('ASSET_TOO_LARGE', '文件最大为 20 MiB。 / Maximum file size is 20 MiB.', 413)
        }
        chunks.push(chunk.value)
      }
    } finally { reader.releaseLock() }
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': c.req.header('content-type')! } }).formData().catch(() => null)
    const entries = form ? [...form.entries()] : []
    const file = form?.get('file')
    if (entries.length !== 1 || entries[0][0] !== 'file' || !(file instanceof File)) return fail('INVALID_UPLOAD', '仅支持一个 file 文件字段。 / Exactly one file field is required.', 400)
    if (file.size > MAX_CONSOLE_ASSET_SIZE) return fail('ASSET_TOO_LARGE', '文件最大为 20 MiB。 / Maximum file size is 20 MiB.', 413)
    const bytes = Buffer.from(await file.arrayBuffer())
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const name = safeName(file.name)
    await mkdir(root, { recursive: true, mode: 0o700 })
    const temporary = resolve(root, `.upload-${randomUUID()}`)
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 })
      // Atomic publication: concurrent uploads of identical bytes are equivalent.
      await rename(temporary, resolve(root, sha256))
    } finally { await rm(temporary, { force: true }) }
    return c.json({ url: `${baseUrl}/${sha256}?name=${encodeURIComponent(name)}`, sha256, name, size: file.size }, 201)
  })
  app.get('/:sha256', async c => {
    const sha256 = c.req.param('sha256')
    if (!/^[a-f0-9]{64}$/.test(sha256)) return c.json({ code: 'INVALID_DIGEST', message: '无效的 SHA-256。 / Invalid SHA-256.' }, 400)
    let bytes: Buffer
    try { bytes = await readFile(resolve(root, sha256)) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ code: 'ASSET_NOT_FOUND', message: '资源不存在。 / Asset not found.' }, 404)
      throw error
    }
    const name = safeName(c.req.query('name') ?? `${sha256}.bin`)
    const encoded = encodeURIComponent(name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    return new Response(new Uint8Array(bytes), { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="asset.bin"; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    } })
  })
  return app
}
