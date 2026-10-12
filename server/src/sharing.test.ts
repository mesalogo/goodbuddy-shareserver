// @vitest-environment node
import { serve } from '@hono/node-server'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp as createUnboundApp } from './app.js'
import { withLocalSocket } from './test-socket.js'
import { SharingStore } from './sharing-store.js'

const createApp = (...args: Parameters<typeof createUnboundApp>) => withLocalSocket(createUnboundApp(...args))

const device = { id: 'desktop-1', name: 'Local desktop', platform: 'win32', appVersion: '1.0.0' }
const publication = {
  id: 'pub-1', deviceId: device.id, name: 'Local knowledge', kind: 'knowledge',
  description: 'Metadata only', sourceMode: 'server', permissions: { search: true, read: true, download: false }
}
const prefix = '/api/v1/sharing'
const post = (value: unknown): RequestInit => ({
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value)
})

describe('persistent sharing API', () => {
  let directory: string
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'shareserver-test-'))
    app = createApp(new SharingStore(directory))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('upserts devices and preserves registration time and exact retry timestamps', async () => {
    const first = await app.request(`${prefix}/devices/register`, post(device))
    expect(first.status).toBe(200)
    const original = await first.json()
    expect(original).toEqual({ ...device, registeredAt: expect.any(String), updatedAt: expect.any(String) })
    expect(new Date(original.registeredAt).toISOString()).toBe(original.registeredAt)
    const retry = await app.request(`${prefix}/devices/register`, post(device))
    expect(await retry.json()).toEqual(original)
    const update = await app.request(`${prefix}/devices/register`, post({ ...device, name: 'Renamed', appVersion: '2' }))
    const updated = await update.json()
    expect(updated).toMatchObject({ name: 'Renamed', appVersion: '2', registeredAt: original.registeredAt })
    expect(updated.updatedAt >= original.updatedAt).toBe(true)
    expect(await (await app.request(`${prefix}/devices`)).json()).toEqual({ devices: [updated] })
  })

  it('handles publication retries, conflicts, filtering and idempotent revocation across restarts', async () => {
    await app.request(`${prefix}/devices/register`, post(device))
    const created = await app.request(`${prefix}/publications`, post(publication))
    expect(created.status).toBe(200)
    const original = await created.json()
    expect(original).toEqual({ ...publication, status: 'published', createdAt: expect.any(String), updatedAt: expect.any(String) })
    // JSON key order is not part of the retry contract.
    const retry = await app.request(`${prefix}/publications`, post({
      ...publication, permissions: { download: false, read: true, search: true }
    }))
    expect(await retry.json()).toEqual(original)
    for (const change of [{ name: 'Changed' }, { deviceId: 'other' }, { permissions: { search: false, read: true, download: false } }]) {
      const conflict = await app.request(`${prefix}/publications`, post({ ...publication, ...change }))
      expect(conflict.status).toBe(409)
      expect(await conflict.json()).toMatchObject({ code: 'PUBLICATION_ID_CONFLICT' })
    }
    app = createApp(new SharingStore(directory))
    expect(await (await app.request(`${prefix}/publications?deviceId=${device.id}`)).json()).toEqual({ publications: [original] })
    expect(await (await app.request(`${prefix}/publications?deviceId=other`)).json()).toEqual({ publications: [] })
    const revoked = await (await app.request(`${prefix}/publications/pub-1/revoke`, { method: 'POST' })).json()
    expect(revoked).toMatchObject({ status: 'revoked', createdAt: original.createdAt })
    app = createApp(new SharingStore(directory))
    expect(await (await app.request(`${prefix}/publications/pub-1/revoke`, { method: 'POST' })).json()).toEqual(revoked)
    expect(await (await app.request(`${prefix}/publications`, post(publication))).json()).toEqual(revoked)
    expect(await (await app.request(`${prefix}/publications`)).json()).toEqual({ publications: [revoked] })
    expect(await readdir(directory)).toEqual(['sharing.json'])
  })

  it('serializes concurrent mutations without losing records, including conflicting ID retries', async () => {
    const results = await Promise.all(Array.from({ length: 16 }, (_, index) =>
      app.request(`${prefix}/devices/register`, post({ ...device, id: `device-${index}` }))))
    expect(results.every((response) => response.status === 200)).toBe(true)
    const publishes = await Promise.all(['A', 'B'].map((name) => app.request(`${prefix}/publications`,
      post({ ...publication, deviceId: 'device-0', name }))))
    expect(publishes.map((response) => response.status).sort()).toEqual([200, 409])
    const restarted = createApp(new SharingStore(directory))
    const devices = await (await restarted.request(`${prefix}/devices`)).json()
    expect(devices.devices).toHaveLength(16)
    const publications = await (await restarted.request(`${prefix}/publications`)).json()
    expect(publications.publications).toHaveLength(1)
  })

  it('returns explicit missing-resource errors', async () => {
    for (const [path, init, code] of [
      [`${prefix}/publications`, post(publication), 'DEVICE_NOT_FOUND'],
      [`${prefix}/publications/missing/revoke`, { method: 'POST' }, 'PUBLICATION_NOT_FOUND']
    ] as const) {
      const response = await app.request(path, init)
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ code, requestId: expect.any(String) })
    }
  })

  it.each([
    null, [], {}, { ...device, id: '../escape' }, { ...device, id: 'x'.repeat(129) },
    { ...device, name: ' ' }, { ...device, name: 'x'.repeat(201) }, { ...device, name: 'bad\u0000name' },
    { ...device, platform: 123 }, { ...device, appVersion: 'x'.repeat(65) }, { ...device, token: 'not-accepted' }
  ])('rejects invalid device input %j', async (input) => {
    const response = await app.request(`${prefix}/devices/register`, post(input))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' })
    expect(await readdir(directory)).toEqual([])
  })

  it.each([
    { ...publication, kind: 'file' }, { ...publication, sourceMode: 'cloud' },
    { ...publication, description: 'x'.repeat(4001) }, { ...publication, deviceId: '' },
    { ...publication, permissions: { search: 'true', read: true, download: false } },
    { ...publication, permissions: { search: true, read: true } },
    { ...publication, permissions: { ...publication.permissions, token: 'not-accepted' } },
    { ...publication, status: 'published' }
  ])('rejects invalid publication input %j', async (input) => {
    const response = await app.request(`${prefix}/publications`, post(input))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('bounds requests and rejects malformed JSON, media types, and invalid filters', async () => {
    for (const [init, status, code] of [
      [{ method: 'POST', body: '{}' }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
      [{ ...post({}), body: '{' }, 400, 'INVALID_JSON'],
      [post({ ...device, name: 'x'.repeat(32768) }), 413, 'PAYLOAD_TOO_LARGE']
    ] as const) {
      const response = await app.request(`${prefix}/devices/register`, init)
      expect(response.status).toBe(status)
      expect(await response.json()).toMatchObject({ code })
    }
    for (const query of ['deviceId=', 'deviceId=a&deviceId=b', 'deviceId=..%2Fsecret', 'token=secret']) {
      const response = await app.request(`${prefix}/publications?${query}`)
      expect(response.status).toBe(400)
    }
  })

  it('does not overwrite corrupt storage or expose filesystem details', async () => {
    await writeFile(join(directory, 'sharing.json'), '{broken')
    const response = await app.request(`${prefix}/devices/register`, post(device))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(await readFile(join(directory, 'sharing.json'), 'utf8')).toBe('{broken')
    await writeFile(join(directory, 'sharing.json'), JSON.stringify({ version: 1, devices: [], publications: [{ ...publication }] }))
    expect((await app.request(`${prefix}/devices`)).status).toBe(503)
  })

  it('does not commit failed writes in memory and recovers its mutation queue', async () => {
    // A directory at the final file path forces the atomic rename to fail.
    expect((await app.request(`${prefix}/devices`)).status).toBe(200)
    await mkdir(join(directory, 'sharing.json'))
    expect((await app.request(`${prefix}/devices/register`, post(device))).status).toBe(503)
    expect(await (await app.request(`${prefix}/devices`)).json()).toEqual({ devices: [] })
    expect(await readdir(directory)).toEqual(['sharing.json'])
    await rm(join(directory, 'sharing.json'), { recursive: true })
    expect((await app.request(`${prefix}/devices/register`, post(device))).status).toBe(200)
  })

  it('uses JSON 404s for unknown API paths and unsupported methods', async () => {
    for (const path of ['/api', '/api/missing', `${prefix}/missing`, `${prefix}/devices/register`]) {
      const response = await app.request(path)
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    }
  })

  it('serves real HTTP and reloads persisted state after listener replacement', async () => {
    async function listen(current: ReturnType<typeof createApp>) {
      const server = serve({ fetch: current.fetch, hostname: '127.0.0.1', port: 0 })
      await once(server, 'listening')
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing listener address')
      return {
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      }
    }
    let listener = await listen(app)
    try {
      const registered = await fetch(`${listener.url}${prefix}/devices/register`, post(device))
      expect(registered.status).toBe(200)
      await registered.json()
      const published = await fetch(`${listener.url}${prefix}/publications`, post(publication))
      expect(published.status).toBe(200)
      const record = await published.json()
      await listener.close()
      listener = await listen(createApp(new SharingStore(directory)))
      const listed = await fetch(`${listener.url}${prefix}/publications?deviceId=${device.id}`)
      expect(await listed.json()).toEqual({ publications: [record] })
      const revoked = await fetch(`${listener.url}${prefix}/publications/pub-1/revoke`, { method: 'POST' })
      expect(await revoked.json()).toMatchObject({ status: 'revoked' })
      const ready = await fetch(`${listener.url}/api/v1/public/ready`)
      expect(await ready.json()).toMatchObject({ productionReady: false, sharing: {
        authentication: 'none', sourceMode: 'descriptive-only-no-content-sync', permissionsEnforced: false
      } })
      const missing = await fetch(`${listener.url}/api/unknown`)
      expect(missing.status).toBe(404)
      expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await listener.close()
    }
  })

  it('persists metadata across actual server process restarts using SHARESERVER_DATA_DIR', async () => {
    async function start() {
      const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))], {
        env: { ...process.env, SHARESERVER_DATA_DIR: directory, SHARESERVER_HOST: '127.0.0.1', SHARESERVER_PORT: '0' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const exited = once(child, 'exit')
      const stop = async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill()
        await exited
      }
      try {
        const url = await new Promise<string>((resolve, reject) => {
          let output = ''
          const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000)
          child.once('error', (error) => { clearTimeout(timer); reject(error) })
          child.once('exit', () => { clearTimeout(timer); reject(new Error(`Server exited during startup: ${output}`)) })
          child.stderr.on('data', (chunk) => { output += chunk.toString() })
          child.stdout.on('data', (chunk) => {
            output += chunk.toString()
            const address = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/)
            if (address) { clearTimeout(timer); resolve(address[1]) }
          })
        })
        return { url, stop }
      } catch (error) {
        await stop()
        throw error
      }
    }
    const first = await start()
    let original: unknown
    try {
      const registered = await fetch(`${first.url}${prefix}/devices/register`, post(device))
      expect(registered.status).toBe(200)
      await registered.json()
      const response = await fetch(`${first.url}${prefix}/publications`, post(publication))
      expect(response.status).toBe(200)
      original = await response.json()
    } finally {
      await first.stop()
    }
    const second = await start()
    try {
      const response = await fetch(`${second.url}${prefix}/publications`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ publications: [original] })
      const retry = await fetch(`${second.url}${prefix}/publications`, post(publication))
      expect(await retry.json()).toEqual(original)
    } finally {
      await second.stop()
    }
  }, 30000)
})
