import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Device, DeviceInput, Publication, PublicationInput } from '../../shared/sharing.js'

export class SharingError extends Error {
  constructor(public status: 400 | 404 | 409 | 413 | 415, public code: string, message: string) {
    super(message)
  }
}

function invalid(message: string): never {
  throw new SharingError(400, 'INVALID_INPUT', message)
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected a JSON object.')
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) {
    invalid(`Expected exactly these fields: ${keys.join(', ')}.`)
  }
  return record
}

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0)
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code))
    })) {
    invalid(`${field} must be ${allowEmpty ? '0' : '1'}-${max} characters without control characters.`)
  }
  return value
}

export function validateId(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    invalid(`${field} must be 1-128 ASCII letters, digits, dots, underscores or hyphens, starting with a letter or digit.`)
  }
  return value
}

export function validateDevice(value: unknown): DeviceInput {
  const input = object(value, ['id', 'name', 'platform', 'appVersion'])
  return {
    id: validateId(input.id),
    name: text(input.name, 'name', 200),
    platform: text(input.platform, 'platform', 64),
    appVersion: text(input.appVersion, 'appVersion', 64)
  }
}

export function validatePublication(value: unknown): PublicationInput {
  const input = object(value, ['id', 'deviceId', 'name', 'kind', 'description', 'sourceMode', 'permissions'])
  if (input.kind !== 'capability' && input.kind !== 'knowledge') invalid('Invalid kind.')
  if (input.sourceMode !== 'device' && input.sourceMode !== 'server') invalid('Invalid sourceMode.')
  const permissions = object(input.permissions, ['search', 'read', 'download'])
  if (typeof permissions.search !== 'boolean' || typeof permissions.read !== 'boolean' ||
    typeof permissions.download !== 'boolean') invalid('Permissions must be booleans.')
  return {
    id: validateId(input.id),
    deviceId: validateId(input.deviceId, 'deviceId'),
    name: text(input.name, 'name', 200),
    kind: input.kind,
    description: text(input.description, 'description', 4000, true),
    sourceMode: input.sourceMode,
    permissions: { search: permissions.search, read: permissions.read, download: permissions.download }
  }
}

interface State {
  version: 1
  devices: Device[]
  publications: Publication[]
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value) throw new Error('Invalid stored timestamp.')
  return value
}

function parseState(value: unknown): State {
  const state = object(value, ['version', 'devices', 'publications'])
  if (state.version !== 1 || !Array.isArray(state.devices) || !Array.isArray(state.publications)) {
    throw new Error('Invalid metadata file.')
  }
  const devices = state.devices.map((value) => {
    const { registeredAt, updatedAt, ...input } = object(value, ['id', 'name', 'platform', 'appVersion', 'registeredAt', 'updatedAt'])
    return { ...validateDevice(input), registeredAt: timestamp(registeredAt), updatedAt: timestamp(updatedAt) }
  })
  const publications = state.publications.map((value): Publication => {
    const { status, createdAt, updatedAt, ...input } = object(value,
      ['id', 'deviceId', 'name', 'kind', 'description', 'sourceMode', 'permissions', 'status', 'createdAt', 'updatedAt'])
    if (status !== 'published' && status !== 'revoked') throw new Error('Invalid stored status.')
    return { ...validatePublication(input), status, createdAt: timestamp(createdAt), updatedAt: timestamp(updatedAt) }
  })
  const ids = new Set(devices.map((device) => device.id))
  if (ids.size !== devices.length || new Set(publications.map((item) => item.id)).size !== publications.length ||
    publications.some((item) => !ids.has(item.deviceId))) throw new Error('Invalid metadata references.')
  return { version: 1, devices, publications }
}

// One store per data directory in one process. The queue covers reads and mutations.
export class SharingStore {
  private state?: State
  private queue: Promise<unknown> = Promise.resolve()
  private readonly directory: string
  private readonly filename: string

  constructor(directory = process.env.SHARESERVER_DATA_DIR ?? './data') {
    this.directory = resolve(directory)
    this.filename = resolve(this.directory, 'sharing.json')
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  private async load(): Promise<State> {
    if (!this.state) {
      try {
        this.state = parseState(JSON.parse(await readFile(this.filename, 'utf8')))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          // Stored corruption is a service failure, never a client validation error.
          throw new Error('Unable to load sharing metadata.', { cause: error })
        }
        this.state = { version: 1, devices: [], publications: [] }
      }
    }
    return this.state
  }

  private async save(state: State): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = `${this.filename}.${randomUUID()}.tmp`
    try {
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(JSON.stringify(state, null, 2) + '\n', 'utf8')
        await file.sync()
      } finally {
        await file.close()
      }
      await rename(temporary, this.filename)
      this.state = state
    } finally {
      await rm(temporary, { force: true })
    }
  }

  devices(): Promise<Device[]> {
    return this.run(async () => structuredClone((await this.load()).devices))
  }

  publications(deviceId?: string): Promise<Publication[]> {
    return this.run(async () => structuredClone((await this.load()).publications.filter(
      (item) => deviceId === undefined || item.deviceId === deviceId
    )))
  }

  register(input: DeviceInput): Promise<Device> {
    return this.run(async () => {
      const state = structuredClone(await this.load())
      const index = state.devices.findIndex((item) => item.id === input.id)
      const existing = state.devices[index]
      if (existing && existing.name === input.name && existing.platform === input.platform &&
        existing.appVersion === input.appVersion) return existing
      const now = new Date().toISOString()
      const device = { ...input, registeredAt: existing?.registeredAt ?? now, updatedAt: now }
      if (index < 0) state.devices.push(device)
      else state.devices[index] = device
      await this.save(state)
      return structuredClone(device)
    })
  }

  publish(input: PublicationInput): Promise<Publication> {
    return this.run(async () => {
      const state = structuredClone(await this.load())
      const existing = state.publications.find((item) => item.id === input.id)
      if (existing) {
        const original: PublicationInput = {
          id: existing.id, deviceId: existing.deviceId, name: existing.name, kind: existing.kind,
          description: existing.description, sourceMode: existing.sourceMode, permissions: existing.permissions
        }
        if (JSON.stringify(original) !== JSON.stringify(input)) {
          throw new SharingError(409, 'PUBLICATION_ID_CONFLICT', 'Publication ID already has different metadata.')
        }
        // Retrying creation must never republish a revoked record.
        return existing
      }
      if (!state.devices.some((item) => item.id === input.deviceId)) {
        throw new SharingError(404, 'DEVICE_NOT_FOUND', 'Register the device before publishing.')
      }
      const now = new Date().toISOString()
      const publication: Publication = { ...input, status: 'published', createdAt: now, updatedAt: now }
      state.publications.push(publication)
      await this.save(state)
      return structuredClone(publication)
    })
  }

  revoke(id: string): Promise<Publication> {
    return this.run(async () => {
      const state = structuredClone(await this.load())
      const publication = state.publications.find((item) => item.id === id)
      if (!publication) throw new SharingError(404, 'PUBLICATION_NOT_FOUND', 'Publication does not exist.')
      if (publication.status === 'revoked') return publication
      publication.status = 'revoked'
      publication.updatedAt = new Date().toISOString()
      await this.save(state)
      return structuredClone(publication)
    })
  }
}
