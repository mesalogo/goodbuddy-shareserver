import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { prototypeSnapshot } from '../../shared/prototype-data.js'
import { sharingRoutes } from './sharing-routes.js'
import { SharingStore } from './sharing-store.js'

export function createApp(store = new SharingStore()) {
  const app = new Hono()

  app.use('*', logger())
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"]
      },
      crossOriginEmbedderPolicy: false
    })
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
      sharing: {
        mode: 'local-metadata-only',
        authentication: 'none',
        persistence: 'local-json',
        writerScope: 'single-process-single-store-per-data-directory',
        sourceMode: 'descriptive-only-no-content-sync',
        permissionsEnforced: false,
        networkBoundary: 'trusted-local-test-service',
        storageChecked: false
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

  app.all('/api/*', (context) => context.json({
    code: 'NOT_FOUND', message: 'API route not found.', requestId: crypto.randomUUID()
  }, 404))
  app.all('/api', (context) => context.json({
    code: 'NOT_FOUND', message: 'API route not found.', requestId: crypto.randomUUID()
  }, 404))

  app.use('*', serveStatic({ root: './dist/web' }))
  app.get('*', serveStatic({ path: './dist/web/index.html' }))

  return app
}

const app = createApp()
export { app }
