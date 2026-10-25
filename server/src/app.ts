import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { prototypeSnapshot } from '../../shared/prototype-data.js'
import { sharingRoutes } from './sharing-routes.js'
import { SharingStore } from './sharing-store.js'
import { GatewayStore } from './gateway-store.js'
import { gatewayRoutes } from './gateway-routes.js'
import { localAdmin, type SocketBindings } from './admin-boundary.js'
import { createOfficeService } from './office/service.js'

export const office = createOfficeService()

export function createApp(store = new SharingStore(), gateway = new GatewayStore()) {
  const app = new Hono<{ Bindings: SocketBindings }>()

  app.use('*', logger())
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/v1/office/') || c.req.path.startsWith('/api/v1/gateway/') || (c.req.method === 'GET' && ['/api/v1/public/health', '/api/v1/public/ready'].includes(c.req.path))) await next()
    else return localAdmin(c, next)
  })
  app.use('/api', localAdmin)
  app.use(
    '*',
    async (c, next) => {
      // Docs embeds the plugin across ports/origins. Its route supplies a
      // narrowly scoped CSP; the general same-origin frame policy cannot apply.
      if (c.req.path.startsWith('/api/v1/office/plugin/')) return next()
      return secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      },
      crossOriginEmbedderPolicy: false
      })(c, next)
    }
  )

  app.get('/api/v1/public/health', (context) =>
    context.json({
      status: 'ok',
      service: 'shareserver',
      version: '0.1.0-prototype.1'
    })
  )

  app.get('/api/v1/public/ready', (context) =>
    context.json({
      status: 'ready',
      mode: 'interactive-prototype',
      productionReady: false,
      gateway: {
        mode: 'local-openai-compatible',
        authentication: 'scoped-bearer-key',
        persistence: process.env.DATABASE_URL ? 'postgresql-jsonb' : 'local-json',
        credentials: 'aes-256-gcm-and-legacy-environment-references',
        writerScope: 'single-process-single-store-per-data-directory',
        networkBoundary: 'direct-loopback-admin-authenticated-inference',
        organizationAclEnforced: false,
        storageChecked: Boolean(process.env.DATABASE_URL)
      },
      sharing: {
        mode: 'local-metadata-only',
        authentication: 'none',
        persistence: process.env.DATABASE_URL ? 'postgresql-jsonb' : 'local-json',
        writerScope: 'single-process-single-store-per-data-directory',
        sourceMode: 'descriptive-only-no-content-sync',
        permissionsEnforced: false,
        networkBoundary: 'trusted-local-test-service',
        storageChecked: Boolean(process.env.DATABASE_URL)
      }
    })
  )

  app.get('/api/v1/web/prototype/snapshot', (context) =>
    context.json({
      ...prototypeSnapshot,
      instance: {
        ...prototypeSnapshot.instance,
        generatedAt: new Date().toISOString()
      }
    })
  )

  app.post('/api/v1/web/prototype/actions', async (context) => {
    const body = await context.req.json<{ action?: string; targetId?: string }>().catch(() => null)
    if (!body?.action || !body.targetId) {
      return context.json(
        {
          code: 'INVALID_PROTOTYPE_ACTION',
          message: '缺少原型操作或目标对象。',
          requestId: crypto.randomUUID()
        },
        400
      )
    }

    return context.json({
      accepted: true,
      action: body.action,
      targetId: body.targetId,
      prototypeOnly: true,
      requestId: crypto.randomUUID()
    })
  })

  app.route('/api/v1/sharing', sharingRoutes(store))
  app.route('/api/v1/gateway', gatewayRoutes(gateway))
  app.route('/', office.routes)

  app.all('/api/*', (context) => context.json({
    code: 'NOT_FOUND', message: 'API route not found.', requestId: crypto.randomUUID()
  }, 404))
  app.all('/api', (context) => context.json({
    code: 'NOT_FOUND', message: 'API route not found.', requestId: crypto.randomUUID()
  }, 404))

  return app
}

const app = createApp()
export { app }
