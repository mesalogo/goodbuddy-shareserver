import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ConsoleError, ConsoleStore, moduleName } from './console-store.js'
import { evaluatePolicies } from '../../shared/control-fields.js'

export function consoleRoutes(store: ConsoleStore) {
  const app = new Hono()
  app.use('*', bodyLimit({ maxSize: 64 * 1024 }))
  app.onError((error, c) => error instanceof ConsoleError
    ? c.json({ message: error.message }, error.status)
    : c.json({ message: '管理数据读取或保存失败，请检查服务端存储。' }, 500))
  app.get('/', async c => c.json(await store.snapshot()))
  app.post('/policies/evaluate', async c => {
    const body = await c.req.json().catch(() => null) as { subject?: unknown; resource?: unknown; action?: unknown } | null
    if (!body || [body.subject, body.resource, body.action].some(v => typeof v !== 'string' || !v.trim() || v.length > 200)) throw new ConsoleError(400, 'Subject, resource and action are required (maximum 200 characters each).')
    return c.json({ ...evaluatePolicies((await store.snapshot()).records, String(body.subject).trim(), String(body.resource).trim(), String(body.action).trim()), mode: 'simulation' })
  })
  app.post('/tasks/:id/progress', async c => {
    const body = await c.req.json().catch(() => null)
    return c.json(await store.progress(c.req.param('id'), body?.revision, body?.progress, body?.result))
  })
  app.get('/distribution/:id/config', async c => {
    const record = (await store.snapshot()).records.find(r => r.id === c.req.param('id') && r.module === 'distribution')
    if (!record) throw new ConsoleError(404, '记录不存在。')
    if (record.status !== 'approved' || !record.fields?.baseUrl || !record.fields.models || !record.fields.version) throw new ConsoleError(409, 'Approve a complete structured configuration before exporting.')
    return c.json({ schemaVersion: 1, version: record.fields.version, protocol: 'openai-chat-completions', baseURL: record.fields.baseUrl, models: record.fields.models.split(',').map(s => s.trim()).filter(Boolean), authentication: 'client-supplied-api-key' })
  })
  app.post('/:module', async c => {
    const module = moduleName(c.req.param('module'))
    const body: unknown = await c.req.json().catch(() => null)
    return c.json(await store.write(module, body), 201)
  })
  app.put('/:module/:id', async c => {
    const module = moduleName(c.req.param('module'))
    const body: unknown = await c.req.json().catch(() => null)
    return c.json(await store.write(module, body, c.req.param('id')))
  })
  return app
}
