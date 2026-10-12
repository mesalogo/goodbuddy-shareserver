import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

export type EncryptedCredential = { nonce: string; tag: string; ciphertext: string }

export function outsideDirectory(directory: string, file: string) {
  const path = relative(resolve(directory), resolve(file))
  return path !== '' && (path === '..' || path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(path))
}

async function masterKey(directory: string): Promise<Buffer> {
  let value = process.env.SHARESERVER_MASTER_KEY
  const file = process.env.SHARESERVER_MASTER_KEY_FILE
  if (value && file) throw new Error('Ambiguous master key configuration')
  if (file) {
    const actualFile = await realpath(file)
    const actualDirectory = await realpath(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return resolve(directory)
    })
    if (!outsideDirectory(directory, file) || !outsideDirectory(actualDirectory, actualFile)) throw new Error('Master key must be outside data directory')
    value = (await readFile(actualFile, 'utf8')).trim()
  }
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('Master key unavailable')
  return Buffer.from(value, 'hex')
}

export async function encryptCredential(directory: string, id: string, secret: string): Promise<EncryptedCredential> {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', await masterKey(directory), nonce)
  cipher.setAAD(Buffer.from(id))
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return { nonce: nonce.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') }
}

export async function decryptCredential(directory: string, id: string, value: EncryptedCredential): Promise<string> {
  const decipher = createDecipheriv('aes-256-gcm', await masterKey(directory), Buffer.from(value.nonce, 'hex'))
  decipher.setAAD(Buffer.from(id))
  decipher.setAuthTag(Buffer.from(value.tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'hex')), decipher.final()]).toString('utf8')
}
