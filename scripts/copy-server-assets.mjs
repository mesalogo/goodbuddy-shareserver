import { cp } from 'node:fs/promises'

await cp('server/src/office/plugin', 'dist/server/server/src/office/plugin', { recursive: true })
await cp('server/src/office/branding', 'dist/server/server/src/office/branding', { recursive: true })
