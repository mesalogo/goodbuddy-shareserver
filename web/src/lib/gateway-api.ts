import { adminFetch } from './admin-fetch'
import { translate } from './i18n'

const errors: Record<string, [string, string]> = {
  LOGIN_REQUIRED: ['登录已过期，请重新登录。', 'Your session has expired. Please sign in again.'],
  CREDENTIAL_UNAVAILABLE: ['服务器无法加密或读取凭据，请管理员检查网关主密钥配置。', 'The server cannot encrypt or read credentials. Ask an administrator to check the gateway master key configuration.'],
  CREDENTIAL_NOT_CONFIGURED: ['请编辑上游并设置 API Key，或选择无需认证。', 'Edit the upstream and set an API Key, or select no authentication.'],
  INVALID_BASE_URL: ['请输入 HTTP 或 HTTPS 地址，不含用户名、密码、查询参数或片段。', 'Enter an HTTP or HTTPS URL without a username, password, query parameters, or fragment.'],
  INVALID_GATEWAY_BASE_URL: ['请管理员检查 SHARESERVER_GATEWAY_BASE_URL 配置。', 'Ask an administrator to check SHARESERVER_GATEWAY_BASE_URL.'],
  INVALID_CREDENTIAL_ACTION: ['请检查凭据操作；只有替换凭据时才可填写 API Key。', 'Check the credential action. An API Key can only be supplied when replacing credentials.'],
  INVALID_ALIAS: ['模型别名须以字母或数字开头，仅支持字母、数字、点、下划线、冒号、斜杠和连字符。', 'Model aliases must start with a letter or number and contain only letters, numbers, periods, underscores, colons, slashes, and hyphens.'],
  ALIAS_EXISTS: ['该模型别名已存在，请更换别名。', 'This model alias already exists. Choose another alias.'],
  INVALID_MODEL_SCOPE: ['请至少选择一个仍存在的模型，刷新后重试。', 'Select at least one existing model. Refresh and try again.'],
  UPSTREAM_HTTP_ERROR: ['上游拒绝请求，请检查上游地址、凭据和模型权限。', 'The upstream rejected the request. Check its URL, credentials, and model permissions.'],
  UPSTREAM_FAILURE: ['无法连接上游，请检查地址和服务器网络。', 'Cannot connect to the upstream. Check its URL and the server network.'],
  REQUEST_TIMEOUT: ['请求超时，请检查上游服务后重试。', 'The request timed out. Check the upstream service and try again.'],
  INVALID_UPSTREAM_RESPONSE: ['上游响应不符合 OpenAI Chat Completions 协议。', 'The upstream response does not conform to the OpenAI Chat Completions protocol.'],
  GATEWAY_STORAGE_UNAVAILABLE: ['网关数据无法读取或保存，请管理员检查存储目录。', 'Gateway data could not be read or saved. Ask an administrator to check the storage directory.'],
  MODEL_DISABLED: ['模型或上游已停用，请启用后重试。', 'The model or upstream is disabled. Enable it and try again.'],
  UPSTREAM_DISABLED: ['上游已停用，请启用后重试。', 'The upstream is disabled. Enable it and try again.'],
  ADMIN_ACCESS_DENIED: ['管理操作仅允许从服务器本机直接访问，请检查访问地址与代理配置。', 'Administration requires direct access from the server itself. Check the access URL and proxy configuration.'],
  INVALID_TEXT: ['请检查必填项、长度及不可见字符。', 'Check required fields, length limits, and invisible characters.'],
  INVALID_FIELDS: ['请求字段不符合服务器接口，请刷新页面后重试。', 'The request fields do not match the server API. Refresh the page and try again.'],
  MODEL_NOT_FOUND: ['模型已不存在，请刷新配置后重试。', 'The model no longer exists. Refresh the configuration and try again.'],
  UPSTREAM_NOT_FOUND: ['上游已不存在，请刷新配置后重试。', 'The upstream no longer exists. Refresh the configuration and try again.'],
  ACCESS_KEY_NOT_FOUND: ['访问密钥已不存在，请刷新列表后重试。', 'The access key no longer exists. Refresh the list and try again.'],
}

// Resolve safe messages when rendered, including after a live language switch.
class GatewayRequestError extends Error {
  constructor(message: () => string) {
    super()
    Object.defineProperty(this, 'message', { get: message })
  }
}

export async function gatewayRequest<T>(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await adminFetch(`/api/v1/gateway${path}`, { signal, method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  } catch { throw new GatewayRequestError(() => translate('网络请求失败，请检查连接后重试。', 'Network request failed. Check your connection and try again.')) }
  if (!response.ok) {
    const envelope = await response.json().catch(() => null)
    const code = envelope?.error?.code ?? envelope?.code
    // Never render arbitrary server messages: they may echo submitted credentials.
    const message = typeof code === 'string' && Object.hasOwn(errors, code) ? errors[code] : ['请求失败，请检查输入与服务器配置后重试。', 'Request failed. Check your input and the server configuration, then try again.']
    throw new GatewayRequestError(() => `HTTP ${response.status} · ${translate(message[0], message[1])}`)
  }
  return response.json() as Promise<T>
}
