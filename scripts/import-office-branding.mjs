// One-time artwork import; normal builds/runtime do not depend on the GB checkout.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { URL } from 'node:url'

const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/import-office-branding.mjs <GoodBuddy assets directory>')
const destination = new URL('../server/src/office/branding/', import.meta.url)
await mkdir(destination, { recursive: true })
for (const theme of ['light', 'dark']) {
  const image = await readFile(resolve(source, `goodbuddy-${theme}.png`))
  if (!image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) || image.length > 100_000) throw new Error('Expected a bounded PNG artwork file')
  await writeFile(new URL(`icon-${theme}.png`, destination), image)
}
