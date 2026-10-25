// @vitest-environment node
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createApp } from './app.js'
import { SharingStore } from './sharing-store.js'
import { GatewayStore } from './gateway-store.js'
import { ConsoleStore } from './console-store.js'
import { AuthService } from './auth.js'

const cleanup: string[] = []
afterEach(async () => { for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true }) })
it('separates device registration from admin login and persists approval, ownership and revocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'device-enrollment-')); cleanup.push(directory)
  const origin = 'http://192.168.0.23:8088'
  const auth = new AuthService({ enabled: true, directory, publicUrl: origin }); await auth.initialize()
  const build = () => createApp(new SharingStore(directory), new GatewayStore(directory), new ConsoleStore(directory), auth)
  let app = build()
  const call = (path: string, body?: unknown, headers: Record<string, string> = {}, method = body === undefined ? 'GET' : 'POST') => app.request(`${origin}/api/v1/${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const device = (id: string) => ({ id, name: id, platform: 'linux', appVersion: 'test' })
  const proof = (id: string, token = 'a'.repeat(64)) => ({ 'x-device-id': id, authorization: `Bearer ${token}` })
  const enroll = (id: string) => call('device-sharing/devices/register', device(id), proof(id))
  expect((await call('sharing/registration')).status).toBe(401)
  expect(await (await enroll('first')).json()).toMatchObject({ registrationStatus: 'approved' })
  expect((await call('device-sharing/devices', undefined, proof('first'))).status).toBe(200)
  const setup = await call('auth/setup', { username: 'admin', password: 'test-password-123', setupToken: await readFile(join(directory, 'admin-setup-token'), 'utf8') }, { Origin: origin })
  const admin = { Origin: origin, Cookie: setup.headers.get('set-cookie')!.split(';')[0] }
  expect((await call('sharing/registration', { mode: 'approval' }, proof('first'), 'PUT')).status).toBe(401)
  expect((await call('sharing/registration', { mode: 'approval' }, admin, 'PUT')).status).toBe(200)
  expect(await (await enroll('second')).json()).toMatchObject({ registrationStatus: 'pending' })
  expect((await call('device-sharing/devices', undefined, proof('second'))).status).toBe(403)
  expect(await (await call('device-sharing/status', undefined, proof('second'))).json()).toMatchObject({ registrationStatus: 'pending' })
  await call('sharing/registration', { mode: 'open' }, admin, 'PUT')
  expect(await (await enroll('second')).json()).toMatchObject({ registrationStatus: 'pending' })
  await call('sharing/devices/second/decision', { status: 'approved' }, admin)
  const publication = { id: 'resource', deviceId: 'first', name: 'resource', kind: 'capability', description: '', sourceMode: 'device', permissions: { search: false, read: false, download: false } }
  expect((await call('device-sharing/publications', publication, proof('second'))).status).toBe(403)
  expect((await call('device-sharing/publications', publication, proof('first'))).status).toBe(200)
  expect((await call('device-sharing/publications/resource/revoke', {}, proof('second'))).status).toBe(403)
  expect((await call('device-sharing/devices/register', device('first'), proof('first', 'b'.repeat(64)))).status).toBe(401)
  await call('sharing/devices/first/decision', { status: 'disabled' }, admin)
  expect((await call('device-sharing/publications', undefined, proof('first'))).status).toBe(403)
  expect(await (await enroll('first')).json()).toMatchObject({ registrationStatus: 'disabled' })
  expect((await (await call('device-sharing/publications', undefined, proof('second'))).json()).publications).toEqual([])
  await call('sharing/devices/second/decision', { status: 'rejected' }, admin)
  app = build()
  expect(await (await enroll('second')).json()).toMatchObject({ registrationStatus: 'rejected' })
  expect((await (await call('sharing/registration', undefined, admin)).json()).devices).toHaveLength(2)
  const disk = await readFile(join(directory, 'sharing.json'), 'utf8')
  expect(disk).not.toContain('a'.repeat(64))
  expect(JSON.stringify(await (await call('sharing/registration', undefined, admin)).json())).not.toContain('hash')
})
