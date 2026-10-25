import { cp } from 'node:fs/promises'

await cp('server/src/office/plugin', 'dist/server/server/src/office/plugin', { recursive: true })
