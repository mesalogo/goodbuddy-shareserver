// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SharingStore, sharingEventLimit } from './sharing-store.js'
import { createApp } from './app.js'
import { withLocalSocket } from './test-socket.js'

const directories: string[] = []
async function directory() { const path = await mkdtemp(join(tmpdir(), 'sharing-history-')); directories.push(path); return path }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const device = { id: 'desktop', name: 'Desktop', platform: 'linux', appVersion: '1' }
const token = 'a'.repeat(64)

it('persists registration, decisions and idempotent revocation together without leaking credentials', async () => {
  const path = await directory()
  const store = new SharingStore(path)
  await store.setRegistrationMode('approval')
  await store.enroll(device, token)
  await expect(store.enroll(device, 'b'.repeat(64))).rejects.toMatchObject({ status: 401 })
  await store.decideDevice(device.id, 'approved')
  await store.decideDevice(device.id, 'approved')
  await store.enroll(device, token)
  await store.publish({ id: 'pub', deviceId: device.id, name: 'Resource', kind: 'knowledge', sourceMode: 'device', description: '', permissions: { read: true, search: true, download: false } })
  await store.revoke('pub'); await store.revoke('pub')
  await store.decideDevice(device.id, 'disabled')
  const restarted = new SharingStore(path)
  const detail = await restarted.deviceDetails(device.id)
  expect(detail.history.events.map(event => event.kind)).toEqual(['disabled', 'publication-revoked', 'registration', 'approved', 'registration'])
  expect(detail.device.registrationStatus).toBe('disabled')
  expect(detail.publications[0].status).toBe('revoked')
  expect(JSON.stringify(detail)).not.toMatch(/hash|aaaaaaaa/)
  await expect(restarted.deviceIdentity(device.id, token)).rejects.toMatchObject({ status: 403 })
  expect((await restarted.history('other')).events).toEqual([])
})

it('loads legacy state without inventing history and bounds the persisted audit window', async () => {
  const path = await directory()
  const at = '2026-01-01T00:00:00.000Z'
  const state = { version: 1, devices: [{ ...device, registeredAt: at, updatedAt: at }], publications: [] }
  await writeFile(join(path, 'sharing.json'), JSON.stringify(state))
  expect((await new SharingStore(path).history()).events).toEqual([])
  const events = Array.from({ length: sharingEventLimit }, (_, index) => ({ id: `event-${index}`, at, kind: 'registration', deviceId: device.id, publicationId: null, registrationStatus: 'unregistered' }))
  await writeFile(join(path, 'sharing.json'), JSON.stringify({ ...state, events }))
  await new SharingStore(path).register(device)
  const history = await new SharingStore(path).history()
  expect(history.events).toHaveLength(sharingEventLimit)
  expect(history.events.some(event => event.id === 'event-0')).toBe(false)
  expect(history.events[0].at).not.toBe(at)
})

it('does not retain events or mutations when the atomic write fails', async () => {
  const path = await directory()
  const store = new SharingStore(path)
  await store.devices()
  await mkdir(join(path, 'sharing.json'))
  await expect(store.enroll(device, token)).rejects.toThrow()
  expect(await store.devices()).toEqual([])
  expect((await store.history()).events).toEqual([])
  await rm(join(path, 'sharing.json'), { recursive: true })
  await store.enroll(device, token)
  expect(JSON.parse(await readFile(join(path, 'sharing.json'), 'utf8')).events).toHaveLength(1)
})

it('protects details and history with the existing admin boundary and validates filters', async () => {
  const store = new SharingStore(await directory())
  await store.enroll(device, token)
  const app = createApp(store)
  for (const endpoint of ['history', 'devices/desktop/details']) {
    expect((await createApp(store).request(`/api/v1/sharing/${endpoint}`)).status).toBe(403)
    expect((await withLocalSocket(createApp(store)).request(`/api/v1/sharing/${endpoint}`)).status).toBe(200)
  }
  expect((await withLocalSocket(app).request('/api/v1/sharing/history?deviceId=a&deviceId=b')).status).toBe(400)
  expect((await withLocalSocket(app).request('/api/v1/sharing/devices/missing/details')).status).toBe(404)
})
