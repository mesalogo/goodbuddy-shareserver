import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { Hono, type Context, type Next } from 'hono'
import type { SocketBindings } from './admin-boundary.js'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import { databaseEnabled, readState, writeState } from './database.js'

const scrypt = promisify(derive)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const lifetime = 12 * 60 * 60 * 1000
const cookie = 'shareserver_session'
type Admin = { username: string; salt: string; hash: string }

export class AuthService {
  readonly enabled: boolean
  private readonly directory: string
  private readonly origin: string
  private sessions = new Map<string, { username: string; expires: number }>()
  private attempts = 0
  private windowEnd = 0
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: { enabled?: boolean; directory?: string; publicUrl?: string } = {}) {
    this.enabled = options.enabled ?? process.env.SHARESERVER_AUTH_ENABLED === 'true'
    this.directory = options.directory ?? process.env.SHARESERVER_DATA_DIR ?? './data'
    const url = options.publicUrl ?? process.env.SHARESERVER_PUBLIC_URL
    if (this.enabled && !url) throw new Error('SHARESERVER_PUBLIC_URL is required when authentication is enabled')
    this.origin = url ? new URL(url).origin : ''
    if (url && !['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Invalid public URL')
  }

  private async admin(): Promise<Admin | null> {
    const state = databaseEnabled() ? await readState<Admin>('admin') : await readFile(resolve(this.directory, 'admin.json'), 'utf8').then(text => JSON.parse(text) as Admin).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e })
    if (state && (typeof state.username !== 'string' || !/^[a-f0-9]{32}$/.test(state.salt) || !/^[a-f0-9]{128}$/.test(state.hash))) throw new Error('Invalid admin storage')
    return state
  }

  async initialize() {
    if (!this.enabled || await this.admin()) return
    await mkdir(this.directory, { recursive: true })
    await writeFile(resolve(this.directory, 'admin-setup-token'), randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e })
  }

  private session(c: Context) {
    const token = getCookie(c, cookie)
    if (!token) return null
    const key = digest(token)
    const session = this.sessions.get(key)
    if (session && session.expires > Date.now()) return session
    this.sessions.delete(key)
    return null
  }

  private sameOrigin(c: Context) {
    const origin = c.req.header('origin')
    return c.req.header('sec-fetch-site') !== 'cross-site' && (origin === this.origin || (!origin && ['GET', 'HEAD'].includes(c.req.method)))
  }

  readonly requireAdmin = async <E extends { Bindings: SocketBindings }>(c: Context<E>, next: Next) => {
    c.header('Cache-Control', 'no-store')
    if (!this.session(c)) return c.json({ code: 'LOGIN_REQUIRED', message: '请先登录管理员账号。' }, 401)
    if (!this.sameOrigin(c)) return c.json({ message: '请求来源不匹配，请从配置的控制台地址访问。' }, 403)
    await next()
  }

  private login(c: Context, username: string) {
    const previous = getCookie(c, cookie)
    if (previous) this.sessions.delete(digest(previous))
    for (const [key, value] of this.sessions) if (value.expires <= Date.now()) this.sessions.delete(key)
    if (this.sessions.size >= 100) this.sessions.delete(this.sessions.keys().next().value!)
    const token = randomBytes(32).toString('hex')
    this.sessions.set(digest(token), { username, expires: Date.now() + lifetime })
    setCookie(c, cookie, token, { httpOnly: true, sameSite: 'Strict', secure: this.origin.startsWith('https:'), path: '/', maxAge: lifetime / 1000 })
    return c.json({ authenticated: true, username })
  }

  routes() {
    const app = new Hono()
    app.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
    app.use('*', bodyLimit({ maxSize: 8192, onError: c => c.json({ message: '请求内容过大。' }, 413) }))
    app.onError((_error, c) => c.json({ message: '认证服务暂时不可用，请检查服务器存储。' }, 503))
    app.get('/session', async c => c.json({ enabled: this.enabled, initialized: this.enabled ? Boolean(await this.admin()) : false, authenticated: Boolean(this.session(c)), username: this.session(c)?.username ?? null }))
    app.use('*', async (c, next) => {
      if (!this.enabled) return c.json({ message: '当前实例未启用登录。' }, 404)
      if (!this.sameOrigin(c)) return c.json({ message: '请求来源不匹配，请从配置的控制台地址访问。' }, 403)
      await next()
    })
    app.post('/logout', c => {
      const token = getCookie(c, cookie)
      if (token) this.sessions.delete(digest(token))
      deleteCookie(c, cookie, { path: '/', secure: this.origin.startsWith('https:'), sameSite: 'Strict', httpOnly: true })
      return c.json({ authenticated: false })
    })
    app.use('*', async (c, next) => {
      if (Date.now() >= this.windowEnd) { this.windowEnd = Date.now() + 60_000; this.attempts = 0 }
      if (++this.attempts > 20) { c.header('Retry-After', String(Math.ceil((this.windowEnd - Date.now()) / 1000))); return c.json({ message: '尝试次数过多，请一分钟后重试。' }, 429) }
      if (!c.req.header('content-type')?.startsWith('application/json')) return c.json({ message: '请提交 JSON 表单。' }, 415)
      await next()
    })
    app.post('/:action', async c => {
      const action = c.req.param('action')
      if (!['setup', 'login'].includes(action)) return c.json({ message: '接口不存在。' }, 404)
      const body = await c.req.json().catch(() => null) as { username?: unknown; password?: unknown; setupToken?: unknown } | null
      if (!body || typeof body.username !== 'string' || !/^[a-zA-Z0-9_.@-]{3,64}$/.test(body.username) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1024) return c.json({ message: '账号需为 3–64 位字母、数字或 _.@-；密码需为 12–1024 位。' }, 400)
      const username = body.username
      const password = body.password
      if (action === 'login') {
        const admin = await this.admin()
        const hash = await scrypt(password, admin?.salt ?? '00000000000000000000000000000000', 64) as Buffer
        if (!admin || !timingSafeEqual(hash, Buffer.from(admin.hash, 'hex')) || username !== admin.username) return c.json({ message: '账号或密码错误。' }, 401)
        return this.login(c, username)
      }
      const operation = this.queue.then(async () => {
        if (await this.admin()) return c.json({ message: '管理员已创建，请登录。' }, 409)
        const token = await readFile(resolve(this.directory, 'admin-setup-token'), 'utf8')
        if (typeof body.setupToken !== 'string' || !timingSafeEqual(Buffer.from(digest(body.setupToken.trim()), 'hex'), Buffer.from(digest(token.trim()), 'hex'))) return c.json({ message: '初始化码无效。' }, 403)
        const salt = randomBytes(16).toString('hex')
        const hash = (await scrypt(password, salt, 64) as Buffer).toString('hex')
        const admin = { username, salt, hash }
        if (databaseEnabled()) await writeState('admin', admin)
        else {
          const temporary = resolve(this.directory, 'admin.json.tmp')
          await writeFile(temporary, JSON.stringify(admin), { mode: 0o600 })
          await rename(temporary, resolve(this.directory, 'admin.json'))
        }
        await rm(resolve(this.directory, 'admin-setup-token'), { force: true }).catch(() => undefined)
        return this.login(c, username)
      })
      this.queue = operation.catch(() => undefined)
      return operation
    })
    return app
  }
}
