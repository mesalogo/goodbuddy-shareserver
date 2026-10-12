export type GatewayUpstreamInput = {
  name: string
  baseUrl: string
  protocol: 'openai-chat-completions'
  authentication: 'api-key' | 'none'
  enabled: boolean
  credentialAction: 'keep' | 'replace' | 'clear'
  apiKey?: string
}

export type GatewayUpstream = Omit<GatewayUpstreamInput, 'credentialAction' | 'apiKey'> & {
  id: string
  credentialConfigured: boolean
}

export type GatewayModelInput = {
  alias: string
  upstreamId: string
  remoteModel: string
  enabled: boolean
  displayName?: string
}

export type GatewayModel = GatewayModelInput & { id: string }

export type GatewayAccessKey = {
  id: string
  name: string
  modelIds: string[]
  createdAt: string
  revokedAt: string | null
}
export type GatewayAccessKeyInput = { name: string; modelIds: string[] }
export type GatewayAccessKeyCreated = { accessKey: GatewayAccessKey; key: string }

export type GatewayAudit = {
  id: string
  time: string
  model: string
  upstreamId: string | null
  accessKeyId: string | null
  stream: boolean
  status: 'success' | 'failed' | 'cancelled'
  httpStatus: number
  durationMs: number
  inputTokens: number | null
  outputTokens: number | null
  errorCode: string | null
}

export type GatewaySnapshot = {
  upstreams: GatewayUpstream[]
  models: GatewayModel[]
  audits: GatewayAudit[]
  gatewayBaseUrl: string | null
}
