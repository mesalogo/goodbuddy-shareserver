import process from 'node:process'
import { concurrently } from 'concurrently'

// Avoid CLI argv detection treating Electron's Node mode as a bundled app.
const { result } = concurrently([
  { command: 'npm run dev:api', name: 'api', prefixColor: 'cyan' },
  { command: 'npm run dev:web -- --host 127.0.0.1', name: 'web', prefixColor: 'magenta' }
], { killOthersOn: ['success', 'failure'] })

result.then(() => { process.exitCode = 0 }, () => { process.exitCode = 1 })
