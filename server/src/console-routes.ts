import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ConsoleError, ConsoleStore, moduleName } from './console-store.js'

export function consoleRoutes(store: ConsoleStore) {
  const app = new Hono()
  app.use('*', bodyLimit({ maxSize: 64 * 1024 }))
  app.onError((error, c) => error instanceof ConsoleError
    ? c.json({ message: error.message }, error.status)
    : c.json({ message: '管理数据读取或保存失败，请检查服务端存储。' }, 500))
  app.get('/', async c => c.json(await store.snapshot()))
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
