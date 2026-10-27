// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.js'
import { createApp } from './app.js'
import { ConsoleStore } from './console-store.js'
import { SharingStore } from './sharing-store.js'
import { GatewayStore } from './gateway-store.js'

describe('instance administrator sessions', () => {
  let directory: string
  let auth: AuthService
  let app: ReturnType<typeof createApp>
  const origin = 'http://192.168.0.23:8088'
  const credentials = { username: 'admin', password: 'a-test-password-123' }
  const makeAuth = () => new AuthService({ enabled: true, directory, publicUrl: origin })
  const makeApp = (service: AuthService) => createApp(new SharingStore(directory), new GatewayStore(directory), new ConsoleStore(directory), service)
  const post = (path: string, body: unknown, cookie = '', requestOrigin = origin) => app.request(`/api/v1/${path}`, { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': '192.168.0.99' }, body: JSON.stringify(body) })
  const setup = async () => post('auth/setup', { ...credentials, setupToken: await readFile(join(directory, 'admin-setup-token'), 'utf8') })

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shareserver-auth-'))
    auth = makeAuth(); await auth.initialize(); app = makeApp(auth)
  })
  afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

  it('requires a bootstrap token, closes setup once and stores only a salted password hash', async () => {
    expect((await post('auth/setup', credentials)).status).toBe(403)
    const response = await setup()
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/)
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Strict/)
    const saved = await readFile(join(directory, 'admin.json'), 'utf8')
    expect(saved).not.toContain(credentials.password)
    expect(JSON.parse(saved).hash).toHaveLength(128)
    expect((await post('auth/setup', credentials)).status).toBe(409)
    await expect(readFile(join(directory, 'admin-setup-token'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('authorizes LAN management with a session and rejects forged or cross-origin requests', async () => {
    for (const path of ['console', 'sharing/devices', 'gateway/config', 'web/prototype/snapshot']) expect((await app.request(`/api/v1/${path}`)).status).toBe(401)
    const response = await setup()
    const cookie = response.headers.get('set-cookie')!.split(';')[0]
    expect((await post('console/members', { name: 'LAN 成员登记', detail: '' }, cookie)).status).toBe(201)
    expect((await post('console/members', { name: '不应保存', detail: '' }, cookie, 'http://evil.example')).status).toBe(403)
    expect((await app.request('/api/v1/console/members', { method: 'POST', headers: { Cookie: cookie }, body: '{}' })).status).toBe(403)
    expect((await app.request('/api/v1/console', { headers: { Cookie: 'shareserver_session=forged' } })).status).toBe(401)
    expect((await app.request('/api/v1/gateway/config', { headers: { Cookie: cookie, 'X-Forwarded-For': '192.168.0.99' } })).status).toBe(200)
    // A browser session never substitutes for a scoped inference key.
    expect((await app.request('/api/v1/gateway/v1/models', { headers: { Cookie: cookie } })).status).toBe(401)
    const snapshot = await (await app.request('/api/v1/console', { headers: { Cookie: cookie } })).json()
    expect(snapshot.records).toHaveLength(1)
  })

  it('revokes logout sessions and retains credentials across restart while invalidating sessions', async () => {
    const created = await setup()
    const cookie = created.headers.get('set-cookie')!.split(';')[0]
    expect((await post('auth/logout', {}, cookie)).status).toBe(200)
    expect((await app.request('/api/v1/console', { headers: { Cookie: cookie } })).status).toBe(401)
    expect((await post('auth/login', { ...credentials, password: 'wrong-password-123' })).status).toBe(401)
    const login = await post('auth/login', credentials)
    expect(login.status).toBe(200)
    const oldCookie = login.headers.get('set-cookie')!.split(';')[0]
    const restarted = makeAuth(); await restarted.initialize(); app = makeApp(restarted)
    expect((await app.request('/api/v1/console', { headers: { Cookie: oldCookie } })).status).toBe(401)
    expect((await post('auth/login', credentials)).status).toBe(200)
    expect((await (await app.request('/api/v1/auth/session')).json()).initialized).toBe(true)
  })

  it('changes passwords, rotates sessions and persists the new credentials', async () => {
    const first = (await setup()).headers.get('set-cookie')!.split(';')[0]
    const second = (await post('auth/login', credentials)).headers.get('set-cookie')!.split(';')[0]
    const body = { currentPassword: credentials.password, newPassword: 'a-new-password-456' }
    expect((await post('auth/password', body)).status).toBe(401)
    expect((await post('auth/password', body, first, 'http://evil.example')).status).toBe(403)
    expect((await post('auth/password', { ...body, currentPassword: 'incorrect' }, first)).status).toBe(400)
    expect((await post('auth/password', { ...body, newPassword: 'short' }, first)).status).toBe(400)
    expect((await post('auth/password', { ...body, newPassword: credentials.password }, first)).status).toBe(400)
    const response = await post('auth/password', body, first)
    expect(response.status).toBe(200)
    const renewed = response.headers.get('set-cookie')!.split(';')[0]
    for (const old of [first, second]) expect((await app.request('/api/v1/console', { headers: { Cookie: old } })).status).toBe(401)
    expect((await app.request('/api/v1/console', { headers: { Cookie: renewed } })).status).toBe(200)
    const saved = await readFile(join(directory, 'admin.json'), 'utf8')
    expect(saved).not.toContain(body.newPassword)
    const restarted = makeAuth(); await restarted.initialize(); app = makeApp(restarted)
    expect((await post('auth/login', credentials)).status).toBe(401)
    expect((await post('auth/login', { ...credentials, password: body.newPassword })).status).toBe(200)
  })

  it('expires sessions after twelve hours', async () => {
    const response = await setup()
    const cookie = response.headers.get('set-cookie')!.split(';')[0]
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 12 * 60 * 60 * 1000 + 1)
    expect((await app.request('/api/v1/console', { headers: { Cookie: cookie } })).status).toBe(401)
  })

  it('serializes competing initializations and bounds login attempts and request size', async () => {
    const token = await readFile(join(directory, 'admin-setup-token'), 'utf8')
    const results = await Promise.all([1, 2].map(() => post('auth/setup', { ...credentials, setupToken: token })))
    expect(results.map(r => r.status).sort()).toEqual([200, 409])
    for (let i = 0; i < 18; i++) await post('auth/login', {})
    expect((await post('auth/login', credentials)).status).toBe(429)
    expect((await post('auth/login', { password: 'x'.repeat(9000) })).status).toBe(413)
  })
})
