// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConsoleStore } from './console-store.js'
import { consoleRoutes } from './console-routes.js'
import type { ConsoleRecord } from '../../shared/console.js'

describe('structured control plane', () => {
  let directory: string
  let store: ConsoleStore
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'control-plane-')); store = new ConsoleStore(directory) })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })
  async function approve(record: ConsoleRecord) {
    for (const status of ['pending', 'approved'] as const) record = await store.write(record.module, { name: record.name, detail: record.detail, fields: record.fields, revision: record.revision, status }, record.id)
    return record
  }
  it('validates structured fields, retains legacy drafts and freezes reviewed values', async () => {
    const legacy = await store.write('distribution', { name: 'legacy', detail: 'manual notes' })
    expect((await new ConsoleStore(directory).snapshot()).records).toEqual([legacy])
    const draft = await store.write('distribution', { name: 'client', detail: '', fields: { version: '1' } })
    await expect(approve(draft)).rejects.toThrow('baseUrl')
    await expect(store.write('distribution', { name: 'x', detail: '', fields: { baseUrl: 'https://user:secret@host/' } })).rejects.toThrow('URL')
    await expect(store.write('members', { name: 'x', detail: '', fields: { unknown: 'x' } })).rejects.toThrow('Unknown')
    const record = await approve(await store.write('distribution', { name: 'client', detail: '', fields: { version: 'v1', baseUrl: 'http://192.168.0.23:8088/api/v1/gateway/v1', models: 'model-a, model-b' } }))
    await expect(store.write('distribution', { name: record.name, detail: '', revision: record.revision, fields: { ...record.fields, models: 'replacement' } }, record.id)).rejects.toThrow('草稿')
    const app = consoleRoutes(store)
    const response = await app.request(`/distribution/${record.id}/config`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ schemaVersion: 1, version: 'v1', protocol: 'openai-chat-completions', baseURL: 'http://192.168.0.23:8088/api/v1/gateway/v1', models: ['model-a', 'model-b'], authentication: 'client-supplied-api-key' })
    expect((await app.request(`/distribution/${draft.id}/config`)).status).toBe(409)
  })
  it('simulates approved policies with default deny and explicit deny precedence', async () => {
    const allow = await approve(await store.write('policies', { name: 'allow', detail: '', fields: { subject: '*', resource: 'catalog', actions: 'read,search', effect: 'allow' } }))
    await store.write('policies', { name: 'draft deny', detail: '', fields: { subject: '*', resource: '*', actions: '*', effect: 'deny' } })
    const app = consoleRoutes(store)
    const evaluate = async (action: string) => (await app.request('/policies/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: 'member', resource: 'catalog', action }) })).json()
    expect(await evaluate('read')).toEqual({ decision: 'allow', matchedIds: [allow.id], mode: 'simulation' })
    expect((await evaluate('delete')).decision).toBe('deny')
    const deny = await approve(await store.write('policies', { name: 'deny', detail: '', fields: { subject: 'member', resource: '*', actions: 'read', effect: 'deny' } }))
    expect(await evaluate('read')).toEqual({ decision: 'deny', matchedIds: [deny.id, allow.id], mode: 'simulation' })
  })
  it('persists manual task outcomes, protects concurrency and rejects invalid progress', async () => {
    let task = await approve(await store.write('tasks', { name: 'verify', detail: '', fields: { assignee: 'operator', dueDate: '2026-10-30', acceptance: 'review configuration' } }))
    await expect(store.progress(task.id, task.revision, 'completed', 'done')).rejects.toThrow('不允许')
    task = await store.progress(task.id, task.revision, 'in_progress', '')
    await expect(store.write('tasks', { name: task.name, detail: '', revision: task.revision, status: 'archived' }, task.id)).rejects.toThrow('Finish or cancel')
    await expect(store.progress(task.id, task.revision - 1, 'completed', 'done')).rejects.toThrow('已被修改')
    await expect(store.progress(task.id, task.revision, 'completed', '')).rejects.toThrow('required')
    task = await store.progress(task.id, task.revision, 'completed', 'Configuration reviewed')
    const saved = await new ConsoleStore(directory).snapshot()
    expect(saved.records[0]).toEqual(task)
    expect(saved.audits[0].action).toBe('task:completed')
    expect(saved.audits[0]).not.toHaveProperty('result')
  })
})
