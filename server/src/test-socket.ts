import type { Hono } from 'hono'
import type { IncomingMessage } from 'node:http'
import type { SocketBindings } from './admin-boundary.js'

export const socketBinding = (remoteAddress = '127.0.0.1'): SocketBindings => ({ incoming: { socket: { remoteAddress } } as IncomingMessage })

// Inject the same binding read from IncomingMessage in production, never a header.
export function withLocalSocket<T extends { request: Hono['request'] }>(app: T): T {
  const request = app.request.bind(app)
  app.request = (input, init, env, executionCtx) => request(input, init, env ?? socketBinding(), executionCtx)
  return app
}
