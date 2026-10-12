import { randomBytes } from 'node:crypto'
import process from 'node:process'
import console from 'node:console'
import { open, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

// Keep this file outside the data directory and back it up separately.
const target = process.argv[2]
if (!target || process.argv.length !== 3) {
  console.error('Usage: npm run gateway:init-key -- <secret-file-outside-data-directory>')
  process.exitCode = 1
} else {
  try {
    const directory = resolve(process.env.SHARESERVER_DATA_DIR ?? './data')
    const destination = resolve(target)
    const actualParent = await realpath(dirname(destination))
    const actualDirectory = await realpath(directory).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return directory
    })
    for (const [root, file] of [[directory, destination], [actualDirectory, resolve(actualParent, basename(destination))]]) {
      const path = relative(root, file)
      if (!(path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path))) throw new Error('Secret file must be outside the data directory.')
    }
    const file = await open(destination, 'wx', 0o600)
    try { await file.writeFile(`${randomBytes(32).toString('hex')}\n`); await file.sync() }
    finally { await file.close() }
    console.log('Master key created. Set SHARESERVER_MASTER_KEY_FILE to this file. Back it up separately from data; never publish it. On Windows, restrict its ACL to the service account.')
  } catch {
    console.error('Master key initialization failed. Use a new file in an existing directory outside SHARESERVER_DATA_DIR; existing files are never replaced.')
    process.exitCode = 1
  }
}
