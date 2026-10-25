import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { SharingError, SharingStore, validateDevice, validatePublication, validateId } from './sharing-store.js'

// Desktop device protocol. Console routes retain their administrator boundary.
export function deviceSharingRoutes(store: SharingStore) {
  const app = new Hono<{ Variables: { deviceId: string } }>()
  app.onError((error, c) => error instanceof SharingError
    ? c.json({ code: error.code, message: error.message }, error.status)
    : c.json({ message: '设备服务暂时不可用，请重试。' }, 503))
  app.use('*', bodyLimit({ maxSize: 32768 }))
  const token = (authorization?: string) => authorization?.replace(/^Bearer /, '') ?? ''
  app.post('/devices/register', async c => {
    const input = validateDevice(await c.req.json())
    return c.json(await store.enroll(input, token(c.req.header('authorization'))))
  })
  app.get('/status', async c => c.json(await store.deviceIdentity(
    c.req.header('x-device-id') ?? '', token(c.req.header('authorization')), false)))
  app.use('*', async (c, next) => {
    const identity = await store.deviceIdentity(c.req.header('x-device-id') ?? '', token(c.req.header('authorization')))
    c.set('deviceId', identity.id)
    await next()
  })
  app.get('/devices', async c => {
    const snapshot = await store.registrationSettings()
    return c.json({ devices: snapshot.devices.filter(d => d.registrationStatus === 'approved') })
  })
  app.get('/publications', async c => {
    const snapshot = await store.registrationSettings()
    const approved = new Set(snapshot.devices.filter(d => d.registrationStatus === 'approved').map(d => d.id))
    return c.json({ publications: (await store.publications(c.req.query('deviceId'))).filter(p => approved.has(p.deviceId)) })
  })
  app.post('/publications', async c => {
    const input = validatePublication(await c.req.json())
    if (input.deviceId !== c.get('deviceId')) throw new SharingError(403, 'DEVICE_MISMATCH', '只能发布本设备的资源。')
    return c.json(await store.publish(input))
  })
  app.post('/publications/:id/revoke', async c => {
    const id = validateId(c.req.param('id'))
    if (!(await store.publications(c.get('deviceId'))).some(p => p.id === id)) throw new SharingError(403, 'DEVICE_MISMATCH', '只能撤销本设备的资源。')
    return c.json(await store.revoke(id))
  })
  return app
}
