import { serve } from '@hono/node-server'
import { app, office, auth } from './app.js'
import { initializeDatabase } from './database.js'

const port = Number(process.env.SHARESERVER_PORT ?? 8787)
const hostname = process.env.SHARESERVER_HOST ?? '127.0.0.1'

await initializeDatabase()
await auth.initialize()
await office.initialize()
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`ShareServer interactive prototype listening on http://${hostname}:${info.port}`)
})
