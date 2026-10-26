import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import process from 'node:process'

const [action, base, filename] = process.argv.slice(2)
if (!['capture', 'check'].includes(action) || !base || !filename) throw new Error('Usage: check-migration.mjs capture|check <web-origin> <snapshot-file>')
const response = await globalThis.fetch(`${base}/api/v1/office/documents`)
assert(response.ok)
const { documents } = await response.json()
const allowConfirmedSessions = process.argv.includes('--user-confirmed-sessions')
const unresolved = documents.filter(d => ['editing', 'saving', 'recovering'].includes(d.state))
if (allowConfirmedSessions && unresolved.length) {
  process.stderr.write(`User-confirmed deployment: preserving ${unresolved.length} unresolved session states; checking persisted versions only.\n`)
} else {
  assert(!unresolved.length, 'Unresolved sessions; finish those before switching Docs')
}
const snapshot = []
for (const document of documents) {
  const file = await globalThis.fetch(`${base}/api/v1/office/documents/${document.id}/download?revision=${document.revision}`)
  assert(file.ok)
  const digest = createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex')
  assert.equal(digest, document.digest)
  snapshot.push({ id: document.id, revision: document.revision, digest })
}
snapshot.sort((a, b) => a.id.localeCompare(b.id))
if (action === 'capture') await writeFile(filename, JSON.stringify(snapshot), { mode: 0o600 })
else assert.deepEqual(snapshot, JSON.parse(await readFile(filename, 'utf8')))
process.stdout.write(`PASS: ${action}, ${snapshot.length} document revisions and downloaded SHA-256 digests\n`)
