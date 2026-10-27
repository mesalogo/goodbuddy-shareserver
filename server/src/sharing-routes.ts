import { randomUUID } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { SharingError, SharingStore, validateDevice, validateId, validatePublication } from './sharing-store.js'

async function body(context: Context): Promise<unknown> {
  if (context.req.header('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new SharingError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.')
  }
  try {
    return await context.req.json()
  } catch {
    throw new SharingError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }
}

export function sharingRoutes(store: SharingStore) {
  const routes = new Hono()
  routes.onError((error, context) => {
    if (error instanceof SharingError) {
      return context.json({ code: error.code, message: error.message, requestId: randomUUID() }, error.status)
    }
    return context.json({ code: 'STORAGE_UNAVAILABLE', message: 'Sharing metadata storage is unavailable.', requestId: randomUUID() }, 503)
  })
  routes.use('*', bodyLimit({
    maxSize: 32 * 1024,
    onError: (context) => context.json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 32768 bytes.', requestId: randomUUID() }, 413)
  }))
  routes.post('/devices/register', async (context) => context.json(await store.register(validateDevice(await body(context)))))
  routes.get('/registration', async c => c.json(await store.registrationSettings()))
  routes.put('/registration', async c => c.json(await store.setRegistrationMode((await body(c) as { mode?: unknown })?.mode)))
  routes.post('/devices/:id/decision', async c => c.json(await store.decideDevice(validateId(c.req.param('id')), (await body(c) as { status?: unknown })?.status)))
  routes.get('/devices', async (context) => context.json({ devices: await store.devices() }))
  // Mounted under the application's administrator boundary, never the Desktop protocol.
  routes.get('/devices/:id/details', async c => c.json(await store.deviceDetails(validateId(c.req.param('id')))))
  routes.get('/history', async c => {
    const queries = c.req.queries()
    if (Object.keys(queries).some(key => key !== 'deviceId') || (queries.deviceId && queries.deviceId.length !== 1)) throw new SharingError(400, 'INVALID_INPUT', 'Only one optional deviceId query parameter is supported.')
    return c.json(await store.history(queries.deviceId ? validateId(queries.deviceId[0], 'deviceId') : undefined))
  })
  routes.get('/publications', async (context) => {
    const queries = context.req.queries()
    if (Object.keys(queries).some((key) => key !== 'deviceId') || (queries.deviceId && queries.deviceId.length !== 1)) {
      throw new SharingError(400, 'INVALID_INPUT', 'Only one optional deviceId query parameter is supported.')
    }
    const deviceId = queries.deviceId ? validateId(queries.deviceId[0], 'deviceId') : undefined
    return context.json({ publications: await store.publications(deviceId) })
  })
  routes.post('/publications', async (context) => context.json(await store.publish(validatePublication(await body(context)))))
  routes.post('/publications/:id/revoke', async (context) => context.json(await store.revoke(validateId(context.req.param('id')))))
  return routes
}
