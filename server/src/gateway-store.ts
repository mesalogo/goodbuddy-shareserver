import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { GatewayAccessKey, GatewayAudit, GatewayModel, GatewayModelInput, GatewaySnapshot, GatewayUpstream, GatewayUpstreamInput } from '../../shared/gateway.js'
import { decryptCredential, encryptCredential, type EncryptedCredential } from './gateway-credentials.js'
import { databaseEnabled, readState, writeState } from './database.js'

export class GatewayError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500 | 502 | 503 | 504, public code: string, message = 'Gateway request failed.') {
    super(message)
  }
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GatewayError(400, 'INVALID_INPUT')
  return value as Record<string, unknown>
}
function exact(value: unknown, keys: string[]) {
  const item = record(value)
  if (Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key))) throw new GatewayError(400, 'INVALID_FIELDS')
  return item
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || Array.from(value).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw new GatewayError(400, 'INVALID_TEXT')
  return value
}
function enabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new GatewayError(400, 'INVALID_ENABLED')
  return value
}
function uuid(value: unknown): string {
  const id = text(value)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new GatewayError(400, 'INVALID_ID')
  return id
}
export function upstreamInput(value: unknown): GatewayUpstreamInput {
  const item = record(value)
  exact(item, ['name', 'baseUrl', 'protocol', 'authentication', 'enabled', 'credentialAction', ...(Object.hasOwn(item, 'apiKey') ? ['apiKey'] : [])])
  if (item.protocol !== 'openai-chat-completions' || !['api-key', 'none'].includes(String(item.authentication)) || !['keep', 'replace', 'clear'].includes(String(item.credentialAction))) throw new GatewayError(400, 'INVALID_UPSTREAM')
  if ((item.credentialAction !== 'replace' && Object.hasOwn(item, 'apiKey')) || (item.authentication === 'none' && item.credentialAction === 'replace')) throw new GatewayError(400, 'INVALID_CREDENTIAL_ACTION')
  return {
    name: text(item.name), baseUrl: baseUrl(item.baseUrl), protocol: item.protocol,
    authentication: item.authentication as GatewayUpstreamInput['authentication'], enabled: enabled(item.enabled),
    credentialAction: item.credentialAction as GatewayUpstreamInput['credentialAction'],
    ...(item.credentialAction === 'replace' ? { apiKey: text(item.apiKey, 16384) } : {})
  }
}
function baseUrl(value: unknown): string {
  let url: URL
  const raw = text(value, 2048)
  try { url = new URL(raw) } catch { throw new GatewayError(400, 'INVALID_BASE_URL') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || raw.includes('?') || raw.includes('#')) {
    throw new GatewayError(400, 'INVALID_BASE_URL', 'Use HTTP or HTTPS without credentials, query or fragment.')
  }
  return url.href.replace(/\/+$/, '')
}
export function modelInput(value: unknown, legacy = false): GatewayModelInput {
  const item = record(value)
  exact(item, ['alias', 'upstreamId', 'remoteModel', 'enabled', ...(Object.hasOwn(item, 'displayName') ? ['displayName'] : [])])
  const alias = text(item.alias, legacy ? 200 : 128)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(alias)) throw new GatewayError(400, 'INVALID_ALIAS')
  return { alias, upstreamId: uuid(item.upstreamId), remoteModel: text(item.remoteModel), enabled: enabled(item.enabled), ...(item.displayName !== undefined ? { displayName: text(item.displayName) } : {}) }
}
type StoredUpstream = Omit<GatewayUpstream, 'credentialConfigured'> & { credential: EncryptedCredential | null; apiKeyEnv?: string }
type StoredAccessKey = GatewayAccessKey & { digest: string }
type State = { version: 2; upstreams: StoredUpstream[]; models: GatewayModel[]; audits: GatewayAudit[]; accessKeys: StoredAccessKey[] }
function publicUpstream(u: StoredUpstream): GatewayUpstream {
  return { id: u.id, name: u.name, baseUrl: u.baseUrl, protocol: u.protocol, authentication: u.authentication, enabled: u.enabled,
    credentialConfigured: Boolean(u.credential || (u.apiKeyEnv && process.env[u.apiKeyEnv]?.trim())) }
}
function publicAccessKey(k: StoredAccessKey): GatewayAccessKey {
  return { id: k.id, name: k.name, modelIds: [...k.modelIds], createdAt: k.createdAt, revokedAt: k.revokedAt }
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid timestamp')
  return value
}
function parseState(value: unknown): State {
  const item = record(value)
  exact(item, ['version', 'upstreams', 'models', 'audits', ...(item.version === 2 ? ['accessKeys'] : [])])
  if ((item.version !== 1 && item.version !== 2) || !Array.isArray(item.upstreams) || !Array.isArray(item.models) || !Array.isArray(item.audits) || item.audits.length > 200) throw new Error('Invalid state')
  const upstreams = item.upstreams.map(value => {
    const u = record(value)
    if (item.version === 1) {
      exact(u, ['id', 'name', 'baseUrl', 'apiKeyEnv', 'enabled'])
      if (typeof u.apiKeyEnv !== 'string' || !/^[A-Z_][A-Z0-9_]{0,127}$/.test(u.apiKeyEnv)) throw new Error('Invalid legacy credential')
      return { id: uuid(u.id), name: text(u.name), baseUrl: baseUrl(u.baseUrl), enabled: enabled(u.enabled), protocol: 'openai-chat-completions' as const, authentication: 'api-key' as const, apiKeyEnv: u.apiKeyEnv, credential: null }
    }
    exact(u, ['id', 'name', 'baseUrl', 'protocol', 'authentication', 'enabled', 'credential', ...(Object.hasOwn(u, 'apiKeyEnv') ? ['apiKeyEnv'] : [])])
    const input = upstreamInput({ name: u.name, baseUrl: u.baseUrl, protocol: u.protocol, authentication: u.authentication, enabled: u.enabled, credentialAction: 'keep' })
    if (u.apiKeyEnv !== undefined && (typeof u.apiKeyEnv !== 'string' || !/^[A-Z_][A-Z0-9_]{0,127}$/.test(u.apiKeyEnv))) throw new Error('Invalid credential reference')
    if (u.credential !== null) {
      const cipher = exact(u.credential, ['nonce', 'tag', 'ciphertext'])
      if (typeof cipher.nonce !== 'string' || !/^[a-f0-9]{24}$/.test(cipher.nonce) || typeof cipher.tag !== 'string' || !/^[a-f0-9]{32}$/.test(cipher.tag) || typeof cipher.ciphertext !== 'string' || !/^(?:[a-f0-9]{2}){1,65536}$/.test(cipher.ciphertext)) throw new Error('Invalid ciphertext')
    }
    if (u.credential && u.apiKeyEnv) throw new Error('Ambiguous credential')
    return { id: uuid(u.id), name: input.name, baseUrl: input.baseUrl, protocol: input.protocol, authentication: input.authentication, enabled: input.enabled, credential: u.credential as EncryptedCredential | null, ...(u.apiKeyEnv ? { apiKeyEnv: u.apiKeyEnv as string } : {}) }
  })
  const models = item.models.map(value => {
    const { id, ...input } = record(value)
    return { id: uuid(id), ...modelInput(input, true) }
  })
  const audits = item.audits.map(value => {
    const audit: Record<string, unknown> = { ...record(value), ...(item.version === 1 ? { accessKeyId: null } : {}) }
    exact(audit, ['id', 'time', 'model', 'upstreamId', 'accessKeyId', 'stream', 'status', 'httpStatus', 'durationMs', 'inputTokens', 'outputTokens', 'errorCode'])
    uuid(audit.id)
    if (audit.accessKeyId !== null) uuid(audit.accessKeyId)
    if (typeof audit.time !== 'string' || !Number.isFinite(Date.parse(audit.time)) || new Date(audit.time).toISOString() !== audit.time ||
      typeof audit.model !== 'string' || audit.model.length > 200 || (audit.upstreamId !== null && !upstreams.some(u => u.id === audit.upstreamId)) ||
      typeof audit.stream !== 'boolean' || !['success', 'failed', 'cancelled'].includes(String(audit.status)) ||
      !Number.isInteger(audit.httpStatus) || Number(audit.httpStatus) < 100 || Number(audit.httpStatus) > 599 ||
      !Number.isFinite(audit.durationMs) || Number(audit.durationMs) < 0 ||
      [audit.inputTokens, audit.outputTokens].some(n => n !== null && (!Number.isSafeInteger(n) || Number(n) < 0)) ||
      (audit.errorCode !== null && (typeof audit.errorCode !== 'string' || !/^[A-Z_]{1,64}$/.test(audit.errorCode)))) throw new Error('Invalid audit')
    return audit as GatewayAudit
  })
  if (new Set(upstreams.map(u => u.id)).size !== upstreams.length || new Set(models.map(m => m.id)).size !== models.length ||
    new Set(models.map(m => m.alias)).size !== models.length || new Set(audits.map(a => a.id)).size !== audits.length ||
    models.some(m => !upstreams.some(u => u.id === m.upstreamId))) throw new Error('Invalid references')
  if (item.version === 2 && !Array.isArray(item.accessKeys)) throw new Error('Invalid access keys')
  const accessKeys = ((item.accessKeys ?? []) as unknown[]).map(value => {
    const k = exact(value, ['id', 'name', 'modelIds', 'createdAt', 'revokedAt', 'digest'])
    if (!Array.isArray(k.modelIds) || !k.modelIds.length || k.modelIds.some(id => !models.some(m => m.id === id)) || new Set(k.modelIds).size !== k.modelIds.length || typeof k.digest !== 'string' || !/^[a-f0-9]{64}$/.test(k.digest)) throw new Error('Invalid access key')
    return { id: uuid(k.id), name: text(k.name), modelIds: k.modelIds as string[], createdAt: timestamp(k.createdAt), revokedAt: k.revokedAt === null ? null : timestamp(k.revokedAt), digest: k.digest }
  })
  if (new Set(accessKeys.map(k => k.id)).size !== accessKeys.length || new Set(accessKeys.map(k => k.digest)).size !== accessKeys.length || audits.some(a => a.accessKeyId !== null && !accessKeys.some(k => k.id === a.accessKeyId))) throw new Error('Invalid access key references')
  return { version: 2, upstreams, models, audits, accessKeys }
}

// One process and one store per data directory; publish memory only after atomic replacement.
export class GatewayStore {
  private state?: State
  private queue: Promise<unknown> = Promise.resolve()
  private readonly filename: string
  constructor(private readonly directory = process.env.SHARESERVER_DATA_DIR ?? './data') {
    this.filename = resolve(directory, 'gateway.json')
  }
  private run<T>(operation: (state: State) => T | Promise<T>, write = false): Promise<T> {
    const result = this.queue.then(async () => {
      if (!this.state) {
        if (databaseEnabled()) {
          const stored = await readState<unknown>('gateway')
          if (stored !== null) {
            try { this.state = parseState(stored) }
            catch { throw new GatewayError(503, 'GATEWAY_STORAGE_UNAVAILABLE') }
          } else {
            try {
              this.state = parseState(JSON.parse(await readFile(this.filename, 'utf8')))
              await writeState('gateway', this.state)
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new GatewayError(503, 'GATEWAY_STORAGE_UNAVAILABLE')
              this.state = { version: 2, upstreams: [], models: [], audits: [], accessKeys: [] }
              await writeState('gateway', this.state)
            }
          }
        } else {
        try { this.state = parseState(JSON.parse(await readFile(this.filename, 'utf8'))) }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new GatewayError(503, 'GATEWAY_STORAGE_UNAVAILABLE')
          this.state = { version: 2, upstreams: [], models: [], audits: [], accessKeys: [] }
        }
        }
      }
      const next = structuredClone(this.state)
      const value = await operation(next)
      if (write) {
        if (databaseEnabled()) {
          try { await writeState('gateway', next); this.state = next }
          catch { throw new GatewayError(503, 'GATEWAY_STORAGE_UNAVAILABLE') }
          return value
        }
        const temporary = `${this.filename}.${randomUUID()}.tmp`
        try {
          await mkdir(this.directory, { recursive: true })
          const file = await open(temporary, 'wx', 0o600)
          try { await file.writeFile(JSON.stringify(next) + '\n'); await file.sync() } finally { await file.close() }
          await rename(temporary, this.filename)
          this.state = next
        } catch { throw new GatewayError(503, 'GATEWAY_STORAGE_UNAVAILABLE') }
        finally { await rm(temporary, { force: true }).catch(() => undefined) }
      }
      return value
    })
    this.queue = result.catch(() => undefined)
    return result
  }
  snapshot(): Promise<GatewaySnapshot> {
    return this.run(state => {
      let gatewayBaseUrl: string | null = null
      if (process.env.SHARESERVER_GATEWAY_BASE_URL) {
        try { gatewayBaseUrl = baseUrl(process.env.SHARESERVER_GATEWAY_BASE_URL) }
        catch { throw new GatewayError(503, 'INVALID_GATEWAY_BASE_URL') }
      }
      return { models: state.models, audits: state.audits, upstreams: state.upstreams.map(publicUpstream), gatewayBaseUrl }
    })
  }
  upstream(value: unknown, id?: string) {
    const input = upstreamInput(value)
    return this.run(async state => {
      const index = id === undefined ? -1 : state.upstreams.findIndex(u => u.id === id)
      if (id !== undefined && index < 0) throw new GatewayError(404, 'UPSTREAM_NOT_FOUND')
      const { credentialAction, apiKey, ...fields } = input
      const previous = state.upstreams[index]
      const upstream: StoredUpstream = { ...fields, id: id ?? randomUUID(), credential: previous?.credential ?? null, ...(previous?.apiKeyEnv ? { apiKeyEnv: previous.apiKeyEnv } : {}) }
      if (credentialAction === 'replace') {
        try {
          // A changed deployment key must not silently create a mixed-key store.
          for (const existing of state.upstreams) {
            if (existing.credential) await decryptCredential(this.directory, existing.id, existing.credential)
          }
          upstream.credential = await encryptCredential(this.directory, upstream.id, apiKey!)
        }
        catch { throw new GatewayError(503, 'CREDENTIAL_UNAVAILABLE') }
        delete upstream.apiKeyEnv
      } else if (credentialAction === 'clear') {
        upstream.credential = null
        delete upstream.apiKeyEnv
      }
      if (index < 0) state.upstreams.push(upstream); else state.upstreams[index] = upstream
      return publicUpstream(upstream)
    }, true)
  }
  model(value: unknown, id?: string) {
    return this.run(state => {
      const index = id === undefined ? -1 : state.models.findIndex(m => m.id === id)
      if (id !== undefined && index < 0) throw new GatewayError(404, 'MODEL_NOT_FOUND')
      const input = modelInput(value, index >= 0 && record(value).alias === state.models[index].alias)
      if (!state.upstreams.some(u => u.id === input.upstreamId)) throw new GatewayError(404, 'UPSTREAM_NOT_FOUND')
      if (state.models.some(m => m.alias === input.alias && m.id !== id)) throw new GatewayError(409, 'ALIAS_EXISTS')
      const model = { ...input, id: id ?? randomUUID() }
      if (index < 0) state.models.push(model); else state.models[index] = model
      return model
    }, true)
  }
  headers(id: string): Promise<Record<string, string>> {
    return this.run(async (state): Promise<Record<string, string>> => {
      const upstream = state.upstreams.find(u => u.id === id)
      if (!upstream) throw new GatewayError(404, 'UPSTREAM_NOT_FOUND')
      if (!upstream.enabled) throw new GatewayError(403, 'UPSTREAM_DISABLED')
      if (upstream.authentication === 'none') return { 'content-type': 'application/json' }
      let key: string | undefined
      try { key = upstream.credential ? await decryptCredential(this.directory, id, upstream.credential) : upstream.apiKeyEnv ? process.env[upstream.apiKeyEnv]?.trim() : undefined }
      catch { throw new GatewayError(503, 'CREDENTIAL_UNAVAILABLE') }
      if (!key) throw new GatewayError(503, 'CREDENTIAL_NOT_CONFIGURED')
      return { 'content-type': 'application/json', authorization: `Bearer ${key}` }
    })
  }
  accessKeys() {
    return this.run(state => ({ accessKeys: state.accessKeys.map(publicAccessKey) }))
  }
  createAccessKey(value: unknown) {
    const input = exact(value, ['name', 'modelIds'])
    const name = text(input.name)
    return this.run(state => {
      if (!Array.isArray(input.modelIds) || !input.modelIds.length || input.modelIds.some(id => typeof id !== 'string' || !state.models.some(m => m.id === id)) || new Set(input.modelIds).size !== input.modelIds.length) throw new GatewayError(400, 'INVALID_MODEL_SCOPE')
      const key = `ss_${randomBytes(32).toString('base64url')}`
      const accessKey: StoredAccessKey = { id: randomUUID(), name, modelIds: [...input.modelIds] as string[], createdAt: new Date().toISOString(), revokedAt: null, digest: createHash('sha256').update(key).digest('hex') }
      state.accessKeys.push(accessKey)
      return { accessKey: publicAccessKey(accessKey), key }
    }, true)
  }
  revokeAccessKey(id: string) {
    return this.run(state => {
      const key = state.accessKeys.find(k => k.id === id)
      if (!key) throw new GatewayError(404, 'ACCESS_KEY_NOT_FOUND')
      key.revokedAt ??= new Date().toISOString()
      return publicAccessKey(key)
    }, true)
  }
  authenticate(authorization?: string) {
    if (!authorization || !/^Bearer ss_[A-Za-z0-9_-]{43}$/i.test(authorization)) throw new GatewayError(401, 'INVALID_ACCESS_KEY')
    const digest = createHash('sha256').update(authorization.slice(7)).digest()
    return this.run(state => {
      const key = state.accessKeys.find(k => timingSafeEqual(Buffer.from(k.digest, 'hex'), digest))
      if (!key || key.revokedAt) throw new GatewayError(401, 'INVALID_ACCESS_KEY')
      return publicAccessKey(key)
    })
  }
  audit(audit: GatewayAudit) {
    return this.run(state => { state.audits = [audit, ...state.audits].slice(0, 200) }, true)
  }
}
