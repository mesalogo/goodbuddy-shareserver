// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { serve } from '@hono/node-server'
import type { AddressInfo } from 'node:net'
import type { ConsoleRecord, ConsoleSnapshot, RecordStatus } from '../../shared/console.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConsoleStore } from './console-store.js'
import { createApp } from './app.js'
import { socketBinding, withLocalSocket } from './test-socket.js'

describe('persistent management register', () => {
  let directory: string
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'console-test-')) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

  it('persists drafts and their atomic audit across store restarts', async () => {
    const store = new ConsoleStore(directory)
    const created = await store.write('distribution', { name: '客户端配置', detail: 'public model alias' })
    expect(created.status).toBe('draft')
    const snapshot = await new ConsoleStore(directory).snapshot()
    expect(snapshot.records).toEqual([created])
    expect(snapshot.audits).toHaveLength(1)
    expect(snapshot.audits[0]).not.toHaveProperty('detail')
  })

  it('rejects stale concurrent edits and freezes submitted content until restored to draft', async () => {
    const store = new ConsoleStore(directory)
    const r = await store.write('approvals', { name: '申请', detail: '申请理由' })
    const results = await Promise.allSettled([
      store.write('approvals', { name: r.name, detail: r.detail, revision: 1, status: 'pending' }, r.id),
      store.write('approvals', { name: r.name, detail: '覆盖修改', revision: 1 }, r.id)
    ])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
    await expect(store.write('approvals', { name: r.name, detail: '偷换内容', revision: 2, status: 'approved' }, r.id)).rejects.toThrow('恢复为草稿')
    await store.write('approvals', { name: r.name, detail: r.detail, revision: 2, status: 'approved' }, r.id)
    await expect(store.write('approvals', { name: r.name, detail: r.detail, revision: 3, status: 'pending' }, r.id)).rejects.toThrow('不允许')
    expect((await store.snapshot()).audits).toHaveLength(3)
    await expect(store.write('members', { name: r.name, detail: r.detail, revision: 3 }, r.id)).rejects.toThrow('不存在')
  })

  it('serves actual records with local admin protection and validates requests', async () => {
    const app = withLocalSocket(createApp(undefined, undefined, new ConsoleStore(directory)))
    const create = (module: string, body: unknown) => app.request(`/api/v1/console/${module}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    expect((await app.request('/api/v1/console', {}, socketBinding('192.168.0.50'))).status).toBe(403)
    expect((await create('unknown', { name: 'A', detail: '' })).status).toBe(404)
    expect((await create('members', { name: '', detail: '' })).status).toBe(400)
    expect((await create('members', { name: 'A', detail: '', status: 'approved' })).status).toBe(400)
    expect((await create('members', { name: '成员登记', detail: '组 A' })).status).toBe(201)
    const response = await app.request('/api/v1/console')
    expect(response.status).toBe(200)
    expect((await response.json()).records).toHaveLength(1)
  })

  it('preserves corrupt storage and reports a server failure', async () => {
    const filename = join(directory, 'console.json')
    const corrupted = JSON.stringify({ records: [{ module: 'members', name: 'A', detail: '' }], audits: [] })
    await writeFile(filename, corrupted)
    const app = withLocalSocket(createApp(undefined, undefined, new ConsoleStore(directory)))
    expect((await app.request('/api/v1/console')).status).toBe(500)
    expect((await app.request('/api/v1/console/members', { method: 'POST', body: JSON.stringify({ name: 'B', detail: '' }) })).status).toBe(500)
    expect(await readFile(filename, 'utf8')).toBe(corrupted)
  })

  it('completes review, archive and restoration through real HTTP and reloads persisted history', async () => {
    const app = createApp(undefined, undefined, new ConsoleStore(directory))
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 })
    try {
      if (!server.listening) await once(server, 'listening')
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/console`
      const created = await fetch(`${url}/approvals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '审核闭环', detail: '保留原始申请内容' }) })
      expect(created.status).toBe(201)
      let record = await created.json() as ConsoleRecord
      const statuses: RecordStatus[] = ['pending', 'rejected', 'archived', 'draft', 'pending', 'approved', 'archived']
      for (const status of statuses) {
        const response = await fetch(`${url}/approvals/${record.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: record.name, detail: record.detail, revision: record.revision, status }) })
        expect(response.status).toBe(200)
        record = await response.json() as ConsoleRecord
        expect(record.status).toBe(status)
      }
      const snapshot = await (await fetch(url)).json() as ConsoleSnapshot
      expect(snapshot.records).toEqual([record])
      expect(snapshot.audits).toHaveLength(8)
      expect(await new ConsoleStore(directory).snapshot()).toEqual(snapshot)
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
