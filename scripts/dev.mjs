import process from 'node:process'
import console from 'node:console'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'
import { concurrently } from 'concurrently'

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && !args[0].startsWith('--env-file='))) {
  console.error('Usage: npm run dev -- --env-file=<path>')
  process.exit(1)
}
let apiEnvironment = process.env
if (args.length) {
  try {
    // Provider credentials belong only to the API child, not the Vite process.
    apiEnvironment = { ...parseEnv(readFileSync(args[0].slice('--env-file='.length), 'utf8')), ...process.env }
  } catch {
    console.error('Unable to load API environment file. Check the supplied path and permissions.')
    process.exit(1)
  }
}

function developmentMasterKey(environment) {
  if (environment.SHARESERVER_MASTER_KEY || environment.SHARESERVER_MASTER_KEY_FILE) return environment
  const file = join(homedir(), '.goodbuddy-shareserver', 'master-key')
  try {
    mkdirSync(dirname(file), { recursive: true })
    try {
      const existing = readFileSync(file, 'utf8').trim()
      if (!/^[0-9a-fA-F]{64}$/.test(existing)) throw new Error('The development gateway master key is invalid.')
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      writeFileSync(file, `${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' })
    }
    return { ...environment, SHARESERVER_MASTER_KEY_FILE: file }
  } catch (error) {
    if (error?.code === 'EEXIST') return { ...environment, SHARESERVER_MASTER_KEY_FILE: file }
    console.error(`Unable to prepare the development gateway master key: ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exit(1)
  }
}

apiEnvironment = developmentMasterKey(apiEnvironment)

// Avoid CLI argv detection treating Electron's Node mode as a bundled app.
const { result } = concurrently([
  { command: 'npm run dev:api', name: 'api', prefixColor: 'cyan', env: apiEnvironment },
  { command: 'npm run dev:web -- --host 127.0.0.1', name: 'web', prefixColor: 'magenta', env: { SHARESERVER_API_PORT: apiEnvironment.SHARESERVER_PORT ?? '8787' } }
], { killOthersOn: ['success', 'failure'] })

result.then(() => { process.exitCode = 0 }, () => { process.exitCode = 1 })
