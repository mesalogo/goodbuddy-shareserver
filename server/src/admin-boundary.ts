import type { Context, Next } from 'hono'
import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'
import { randomUUID } from 'node:crypto'

export type SocketBindings = { incoming?: IncomingMessage }

export async function localAdmin<E extends { Bindings: SocketBindings }>(c: Context<E>, next: Next) {
  const address = c.env?.incoming?.socket?.remoteAddress?.toLowerCase()
  const ipv4 = address?.startsWith('::ffff:') ? address.slice(7) : address
  const loopback = address === '::1' || (ipv4 !== undefined && isIP(ipv4) === 4 && ipv4.startsWith('127.'))
  const forwarded = [...c.req.raw.headers.keys()].some(key => key === 'forwarded' || key.startsWith('x-forwarded-') || key === 'x-real-ip')
  const origin = c.req.header('origin')
  const allowedOrigin = !origin || origin === new URL(c.req.url).origin || ['http://127.0.0.1:5174', 'http://localhost:5174'].includes(origin)
  if (!loopback || forwarded || !allowedOrigin) {
    return c.json({ error: { code: 'ADMIN_ACCESS_DENIED', message: 'Direct loopback administration required.' }, requestId: randomUUID() }, 403)
  }
  await next()
}
