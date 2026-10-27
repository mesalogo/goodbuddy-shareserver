import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { consoleModules, statusTransitions, type ConsoleModule, type ConsoleRecord, type ConsoleSnapshot, type RecordStatus } from '../../shared/console.js'
import { databaseEnabled, readState, writeState } from './database.js'
import { controlFields, taskTransitions, type TaskProgress } from '../../shared/control-fields.js'

export class ConsoleError extends Error {
  constructor(public status: 400 | 404 | 409, message: string) { super(message) }
}
export function moduleName(value: string): ConsoleModule {
  if (!Object.hasOwn(consoleModules, value)) throw new ConsoleError(404, '管理模块不存在。')
  return value as ConsoleModule
}
function input(value: unknown): { name: string; detail: string; revision?: number; status?: RecordStatus; fields?: Record<string, string> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConsoleError(400, '请输入有效的记录。')
  const v = value as Record<string, unknown>
   if (Object.keys(v).some(key => !['name', 'detail', 'revision', 'status', 'fields'].includes(key)) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 200 || typeof v.detail !== 'string' || v.detail.length > 12000) throw new ConsoleError(400, '名称需为 1–200 字，详细说明最多 12000 字。')
  if (v.revision !== undefined && (!Number.isSafeInteger(v.revision) || Number(v.revision) < 1)) throw new ConsoleError(400, '记录版本无效。')
  if (v.status !== undefined && !['draft', 'pending', 'approved', 'rejected', 'archived'].includes(String(v.status))) throw new ConsoleError(400, '记录状态无效。')
   if (v.fields !== undefined && (!v.fields || typeof v.fields !== 'object' || Array.isArray(v.fields) || Object.values(v.fields).some(x => typeof x !== 'string' || x.length > 4000))) throw new ConsoleError(400, 'Invalid structured fields.')
   return { name: v.name.trim(), detail: v.detail, revision: v.revision as number | undefined, status: v.status as RecordStatus | undefined, fields: v.fields as Record<string, string> | undefined }
}

function validateFields(module: ConsoleModule, fields: Record<string, string> | undefined, complete: boolean) {
  if (!fields) return // Legacy records are preserved without inventing values.
  const schema = controlFields[module]
  if (Object.keys(fields).some(key => !schema.some(f => f.key === key))) throw new ConsoleError(400, 'Unknown structured field.')
  for (const field of schema) {
    const value = fields[field.key]?.trim() ?? ''
    if (complete && field.required && !value) throw new ConsoleError(400, `Required field: ${field.key}`)
    if (!value) continue
    if (field.options && !field.options.some(o => o[0] === value)) throw new ConsoleError(400, `Invalid field: ${field.key}`)
    if (field.type === 'url') { try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error() } catch { throw new ConsoleError(400, `Invalid URL: ${field.key}`) } }
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ConsoleError(400, `Invalid email: ${field.key}`)
    if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new ConsoleError(400, `Invalid date: ${field.key}`)
    if (field.key === 'sha256' && !/^[a-f\d]{64}$/i.test(value)) throw new ConsoleError(400, 'Invalid SHA-256 checksum.')
  }
}

// One process per store, matching the existing sharing and gateway stores.
export class ConsoleStore {
  private queue: Promise<unknown> = Promise.resolve()
  private readonly filename: string
  constructor(private directory = process.env.SHARESERVER_DATA_DIR ?? './data') { this.filename = resolve(directory, 'console.json') }
  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }
  private async load(): Promise<ConsoleSnapshot> {
    let state: ConsoleSnapshot | null = databaseEnabled() ? await readState<ConsoleSnapshot>('console') : null
    if (!state) {
      try { state = JSON.parse(await readFile(this.filename, 'utf8')) as ConsoleSnapshot }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; state = { records: [], audits: [] } }
    }
    try {
      if (!state || !Array.isArray(state.records) || !Array.isArray(state.audits)) throw new Error('Invalid state')
      const ids = new Set<string>()
      for (const record of state.records) {
        moduleName(record.module)
         input({ name: record.name, detail: record.detail, revision: record.revision, status: record.status, fields: record.fields })
         validateFields(record.module, record.fields, false)
         if (record.progress && (record.module !== 'tasks' || !Object.hasOwn(taskTransitions, record.progress))) throw new Error('Invalid task progress')
        if (typeof record.id !== 'string' || !record.id || ids.has(record.id) || record.revision === undefined || record.status === undefined || !Number.isFinite(Date.parse(record.createdAt)) || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error('Invalid record')
        ids.add(record.id)
      }
      for (const audit of state.audits) {
        moduleName(audit.module)
        if (typeof audit.id !== 'string' || !ids.has(audit.recordId) || typeof audit.action !== 'string' || !Number.isSafeInteger(audit.revision) || !Number.isFinite(Date.parse(audit.at))) throw new Error('Invalid audit')
      }
    } catch (error) { throw new Error('管理数据格式无效。', { cause: error }) }
    return state
  }
  private async save(state: ConsoleSnapshot) {
    if (databaseEnabled()) return writeState('console', state)
    await mkdir(this.directory, { recursive: true })
    const temp = `${this.filename}.${randomUUID()}.tmp`
    try { await writeFile(temp, JSON.stringify(state), { mode: 0o600 }); await rename(temp, this.filename) }
    finally { await rm(temp, { force: true }) }
  }
  snapshot() { return this.run(() => this.load()) }
  write(module: ConsoleModule, value: unknown, id?: string) {
    return this.run(async () => {
      const data = input(value)
      const state = await this.load()
      const previous = id ? state.records.find(r => r.id === id && r.module === module) : undefined
      if (id && !previous) throw new ConsoleError(404, '记录不存在。')
      if (previous && previous.revision !== data.revision) throw new ConsoleError(409, '记录已被修改，请刷新后重试。')
      if (!previous && (data.revision !== undefined || (data.status && data.status !== 'draft'))) throw new ConsoleError(400, '新记录必须从草稿开始。')
       const status = data.status ?? previous?.status ?? 'draft'
       const fields = data.fields ?? previous?.fields
       validateFields(module, fields, status === 'pending' || status === 'approved')
      if (previous && previous.status !== status && !statusTransitions[previous.status].includes(status)) throw new ConsoleError(409, '当前状态不允许此操作。')
       if (previous && previous.status !== 'draft' && (previous.name !== data.name || previous.detail !== data.detail)) throw new ConsoleError(409, '请先恢复为草稿再编辑内容。')
       if (previous && previous.status !== 'draft' && JSON.stringify(fields) !== JSON.stringify(previous.fields)) throw new ConsoleError(409, '请先恢复为草稿再编辑内容。')
       if (previous?.progress === 'in_progress' && status !== 'approved') throw new ConsoleError(409, 'Finish or cancel the task before archiving.')
      if (!previous && state.records.length >= 5000) throw new ConsoleError(409, '登记记录已达 5000 条上限。')
      const at = new Date().toISOString()
       const record: ConsoleRecord = { id: previous?.id ?? randomUUID(), module, name: data.name, detail: data.detail, status, revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? at, updatedAt: at }
       if (fields) record.fields = fields
       if (module === 'tasks' && status === 'approved') { record.progress = previous?.progress ?? 'queued'; record.result = previous?.result ?? '' }
       else if (previous?.progress) { record.progress = previous.progress; record.result = previous.result }
       if (module === 'tasks' && status === 'draft') { delete record.progress; delete record.result }
      state.records = [record, ...state.records.filter(r => r.id !== record.id)]
      state.audits = [{ id: randomUUID(), module, recordId: record.id, action: previous ? (previous.status === status ? '编辑' : `${previous.status} → ${status}`) : '创建', at, revision: record.revision }, ...state.audits].slice(0, 1000)
      await this.save(state)
      return record
    })
  }
  progress(id: string, revision: unknown, progress: unknown, result: unknown) {
    return this.run(async () => {
      const state = await this.load()
      const record = state.records.find(r => r.module === 'tasks' && r.id === id)
      if (!record) throw new ConsoleError(404, '记录不存在。')
      if (record.revision !== revision) throw new ConsoleError(409, '记录已被修改，请刷新后重试。')
      if (record.status !== 'approved' || typeof progress !== 'string' || !taskTransitions[record.progress ?? 'queued'].includes(progress as TaskProgress)) throw new ConsoleError(409, '当前状态不允许此操作。')
      if (typeof result !== 'string' || result.length > 12000 || (['completed', 'cancelled'].includes(progress) && !result.trim())) throw new ConsoleError(400, 'A result or cancellation reason is required (maximum 12000 characters).')
      record.progress = progress as TaskProgress; record.result = result.trim(); record.revision++; record.updatedAt = new Date().toISOString()
      state.audits.unshift({ id: randomUUID(), module: 'tasks', recordId: id, action: `task:${progress}`, at: record.updatedAt, revision: record.revision })
      state.audits = state.audits.slice(0, 1000)
      await this.save(state)
      return record
    })
  }
}
