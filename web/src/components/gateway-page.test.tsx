import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GatewayAccessKey, GatewaySnapshot, GatewayUpstream } from '../../../shared/gateway'
import { GatewayPage } from './gateway-page'

const upstream: GatewayUpstream = { id: 'up-1', name: 'Local provider', baseUrl: 'https://provider.example/v1', protocol: 'openai-chat-completions', authentication: 'api-key', enabled: true, credentialConfigured: true }
const model = { id: 'model-stable-id', alias: 'local-chat', remoteModel: 'remote-chat', upstreamId: upstream.id, enabled: true }
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const failure = () => response({ error: { code: 'CREDENTIAL_UNAVAILABLE', message: 'secret-should-not-echo' }, requestId: 'secret-should-not-echo' }, 503)

describe('real gateway UI', () => {
  let snapshot: GatewaySnapshot
  let keys: GatewayAccessKey[]
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    snapshot = { upstreams: [], models: [], audits: [], gatewayBaseUrl: null }
    keys = []
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/v1/gateway/config') return response(snapshot)
      const body = init?.body ? JSON.parse(String(init.body)) : null
      if (url === '/api/v1/gateway/access-keys') {
        if (init?.method === 'POST') {
          const accessKey = { ...body, id: 'key-1', createdAt: '2026-10-01T00:00:00.000Z', revokedAt: null }
          keys.push(accessKey)
          return response({ accessKey, key: 'ss_only-once-secret' })
        }
        return response({ accessKeys: keys })
      }
      if (url === '/api/v1/gateway/access-keys/key-1/revoke') {
        keys = keys.map(key => ({ ...key, revokedAt: '2026-10-02T00:00:00.000Z' }))
        return response(keys[0])
      }
      if (url === '/api/v1/gateway/upstreams/up-1/discover') return response({ models: ['discovered-chat'] })
      if (url === '/api/v1/gateway/upstreams' || url === '/api/v1/gateway/upstreams/up-1') {
        const { apiKey, credentialAction, ...fields } = body
        const saved = { ...upstream, ...fields, credentialConfigured: credentialAction === 'clear' ? false : Boolean(apiKey) || (snapshot.upstreams[0]?.credentialConfigured ?? false) }
        snapshot = { ...snapshot, upstreams: [saved] }
        return response(saved)
      }
      if (url === '/api/v1/gateway/models' || url === `/api/v1/gateway/models/${model.id}`) {
        const saved = { ...model, ...body }
        snapshot = { ...snapshot, models: [saved] }
        return response(saved)
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('loads empty real data and asks for a configured client URL without inventing an origin', async () => {
    render(<GatewayPage />)
    await screen.findByText(/尚无上游服务/)
    await screen.findByText(/暂无访问密钥/)
    expect(screen.getByText(/尚无模型映射/)).toBeInTheDocument()
    expect(screen.getByText(/SHARESERVER_GATEWAY_BASE_URL/)).toBeInTheDocument()
    expect(screen.queryByText(/127\.0\.0\.1:8787|localhost:5174/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/环境变量/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送真实请求' })).toBeDisabled()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/gateway/config', '/api/v1/gateway/access-keys'])
  })

  it('shows the configured baseURL and client protocol, alias and key instructions', async () => {
    snapshot = { ...snapshot, upstreams: [upstream], models: [{ ...model, displayName: '聊天模型' }], gatewayBaseUrl: 'https://gateway.example/custom/v1' }
    render(<GatewayPage />)
    const settings = await screen.findByRole('region', { name: '客户端设置' })
    expect(within(settings).getByText(snapshot.gatewayBaseUrl!)).toBeInTheDocument()
    expect(settings).toHaveTextContent('openai-chat-completions')
    expect(settings).toHaveTextContent(`模型 ID：${model.alias}`)
    expect(settings).toHaveTextContent('API Key 使用新建的访问密钥')
  })

  it('retries load failures with useful Chinese errors without reflecting arbitrary server content', async () => {
    fetchMock.mockResolvedValueOnce(failure())
    render(<GatewayPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503 · 服务器无法加密或读取凭据')
    expect(document.body).not.toHaveTextContent('secret-should-not-echo')
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }))
    await screen.findByText(/尚无上游服务/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('preserves the last snapshot after refresh failure', async () => {
    snapshot.upstreams = [upstream]
    render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    fetchMock.mockResolvedValueOnce(failure())
    fireEvent.click(screen.getByRole('button', { name: '刷新配置与审计' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('当前显示上次读取的数据')
    expect(screen.getByRole('heading', { name: upstream.name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('creates with a secret, keeps blank edits, and toggles without secrets', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    fireEvent.click(screen.getByRole('button', { name: '添加上游' }))
    fireEvent.change(screen.getByLabelText('上游名称'), { target: { value: upstream.name } })
    fireEvent.change(screen.getByLabelText('上游 Base URL'), { target: { value: upstream.baseUrl } })
    expect(screen.getByLabelText('上游 API Key')).toHaveAttribute('type', 'password')
    fireEvent.change(screen.getByLabelText('上游 API Key'), { target: { value: 'private-upstream-key' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await screen.findByRole('heading', { name: upstream.name })
    const input = { name: upstream.name, baseUrl: upstream.baseUrl, protocol: upstream.protocol, authentication: 'api-key', credentialAction: 'replace', apiKey: 'private-upstream-key', enabled: true }
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/gateway/upstreams', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }))
    expect(screen.queryByDisplayValue('private-upstream-key')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `编辑上游 ${upstream.name}` }))
    expect(screen.getByLabelText('上游 API Key')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const keep = { name: upstream.name, baseUrl: upstream.baseUrl, protocol: upstream.protocol, authentication: 'api-key', credentialAction: 'keep', enabled: true }
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/gateway/upstreams/up-1', expect.objectContaining({ body: JSON.stringify(keep) }))
    fireEvent.click(screen.getByRole('button', { name: `停用上游 ${upstream.name}` }))
    await screen.findByRole('button', { name: `启用上游 ${upstream.name}` })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/gateway/upstreams/up-1', expect.objectContaining({ body: JSON.stringify({ ...keep, enabled: false }) }))
    expect(storage).not.toHaveBeenCalled()
  })

  it('clears submitted secrets on errors and permits replacement retry', async () => {
    snapshot.upstreams = [upstream]
    render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    fireEvent.click(screen.getByRole('button', { name: `编辑上游 ${upstream.name}` }))
    fireEvent.change(screen.getByLabelText('上游 API Key'), { target: { value: 'secret-should-not-echo' } })
    fetchMock.mockResolvedValueOnce(failure())
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('保存配置失败')
    expect(screen.getByLabelText('上游 API Key')).toHaveValue('')
    expect(screen.getByLabelText('上游名称')).toHaveValue(upstream.name)
    expect(document.body).not.toHaveTextContent('secret-should-not-echo')
    fireEvent.change(screen.getByLabelText('上游 API Key'), { target: { value: 'replacement-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: `编辑上游 ${upstream.name}` }))
    expect(screen.getByLabelText('上游 API Key')).toHaveValue('')
  })

  it('allows unauthenticated upstream discovery and testing without configured credentials', async () => {
    snapshot.upstreams = [{ ...upstream, authentication: 'none', credentialConfigured: false }]
    snapshot.models = [model]
    render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    expect(screen.getByRole('button', { name: '发送真实请求' })).toBeEnabled()
    expect(screen.getByLabelText('测试模型')).toHaveValue(model.alias)
    fireEvent.click(screen.getByRole('button', { name: `编辑上游 ${upstream.name}` }))
    expect(screen.getByLabelText('认证方式')).toHaveValue('none')
    expect(screen.queryByRole('option', { name: '设置或替换凭据' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(screen.getByRole('button', { name: '发现模型 Local provider' }))
    expect(await screen.findByRole('button', { name: '添加映射 discovered-chat' })).toBeEnabled()
  })

  it('discovers then selects a model and preserves alias and display name through edits and toggle', async () => {
    snapshot.upstreams = [upstream]
    render(<GatewayPage />)
    fireEvent.click(await screen.findByRole('button', { name: '发现模型 Local provider' }))
    fireEvent.click(await screen.findByRole('button', { name: '添加映射 discovered-chat' }))
    expect(screen.getByLabelText('远端模型名称')).toHaveValue('discovered-chat')
    fireEvent.change(screen.getByLabelText('模型别名'), { target: { value: 'discovered-alias' } })
    fireEvent.change(screen.getByLabelText('显示名称（可选）'), { target: { value: '发现的模型' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await screen.findByRole('heading', { name: 'discovered-alias → discovered-chat' })
    const input = { alias: 'discovered-alias', upstreamId: upstream.id, remoteModel: 'discovered-chat', displayName: '发现的模型', enabled: true }
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/gateway/models', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }))
    fireEvent.click(screen.getByRole('button', { name: '编辑映射 discovered-alias' }))
    expect(screen.getByLabelText('显示名称（可选）')).toHaveValue('发现的模型')
    fireEvent.change(screen.getByLabelText('模型别名'), { target: { value: 'edited-alias' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await screen.findByRole('heading', { name: 'edited-alias → discovered-chat' })
    fireEvent.click(screen.getByRole('button', { name: '停用映射 edited-alias' }))
    await screen.findByRole('button', { name: '启用映射 edited-alias' })
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/gateway/models/${model.id}`, expect.objectContaining({ method: 'PUT', body: JSON.stringify({ ...input, alias: 'edited-alias', enabled: false }) }))
  })

  it('allows manual mappings when discovery is unavailable', async () => {
    snapshot.upstreams = [{ ...upstream, credentialConfigured: false }]
    render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    expect(screen.getByRole('button', { name: '发现模型 Local provider' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '手动添加映射' }))
    const alias = screen.getByLabelText('模型别名')
    for (const value of ['spaces not allowed', '_invalid', '中文别名']) {
      fireEvent.change(alias, { target: { value } })
      expect(alias).toBeInvalid()
    }
    fireEvent.change(alias, { target: { value: 'provider/model:1.0_test-chat' } })
    expect(alias).toBeValid()
    fireEvent.change(screen.getByLabelText('模型别名'), { target: { value: 'manual-alias' } })
    fireEvent.change(screen.getByLabelText('远端模型名称'), { target: { value: 'manual-remote' } })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await screen.findByRole('heading', { name: 'manual-alias → manual-remote' })
    expect(screen.getByRole('button', { name: '发送真实请求' })).toBeEnabled()
  })

  it('creates scoped keys by stable model IDs, dismisses raw secrets permanently, and revokes with retry', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    snapshot = { ...snapshot, upstreams: [upstream], models: [model] }
    const view = render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    fireEvent.click(screen.getByRole('button', { name: '创建访问密钥' }))
    expect(screen.getByRole('button', { name: '确认创建' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('密钥名称'), { target: { value: 'Desktop' } })
    fireEvent.click(screen.getByRole('checkbox', { name: model.alias }))
    fetchMock.mockResolvedValueOnce(failure())
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('创建访问密钥失败')
    expect(screen.getByLabelText('密钥名称')).toHaveValue('Desktop')
    expect(screen.getByRole('checkbox', { name: model.alias })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))
    expect(await screen.findByLabelText('新访问密钥')).toHaveValue('ss_only-once-secret')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/gateway/access-keys', expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Desktop', modelIds: [model.id] }) }))
    fireEvent.click(screen.getByRole('button', { name: '已保存，关闭密钥' }))
    expect(screen.queryByDisplayValue('ss_only-once-secret')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新访问密钥' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新访问密钥' })).toBeEnabled())
    expect(screen.queryByLabelText('新访问密钥')).not.toBeInTheDocument()
    view.unmount()
    snapshot.models = [{ ...model, alias: 'renamed-alias' }]
    render(<GatewayPage />)
    await screen.findByRole('heading', { name: 'Desktop' })
    expect(screen.getByText('授权模型：renamed-alias')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('ss_only-once-secret')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '撤销密钥 Desktop' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('此操作无法恢复')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/revoke'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: '撤销密钥 Desktop' }))
    fetchMock.mockResolvedValueOnce(failure())
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('撤销访问密钥失败')
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '撤销密钥 Desktop' })).not.toBeInTheDocument()
    expect(screen.getByText(/已撤销/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/gateway/access-keys/key-1/revoke', expect.objectContaining({ method: 'POST' }))
    expect(storage).not.toHaveBeenCalled()
  })

  it('keeps key list failures distinct from an empty list and supports retry', async () => {
    fetchMock.mockImplementationOnce(async () => response(snapshot)).mockResolvedValueOnce(failure())
    render(<GatewayPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('访问密钥加载失败')
    expect(screen.queryByText(/暂无访问密钥/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新访问密钥' }))
    await screen.findByText(/暂无访问密钥/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('tests via POST /test nonstreaming and forgets prompt and response after unmount', async () => {
    snapshot = { ...snapshot, upstreams: [upstream], models: [model] }
    const view = render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    fireEvent.change(screen.getByLabelText('测试模型'), { target: { value: model.alias } })
    fireEvent.change(screen.getByLabelText('测试提示词'), { target: { value: 'A private prompt' } })
    fetchMock.mockImplementationOnce(async () => {
      snapshot.audits = [{ id: 'audit-1', time: '2026-10-01T00:00:00Z', model: model.alias, upstreamId: upstream.id, accessKeyId: null, stream: false, status: 'success', httpStatus: 200, durationMs: 128, inputTokens: null, outputTokens: 0, errorCode: null }]
      return response({ choices: [{ message: { content: 'Actual response text' } }] })
    })
    fireEvent.click(screen.getByRole('button', { name: '发送真实请求' }))
    await screen.findByText('Actual response text')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/gateway/test', expect.objectContaining({ method: 'POST', body: JSON.stringify({ model: model.alias, messages: [{ role: 'user', content: 'A private prompt' }], stream: false }) }))
    const table = await screen.findByRole('table')
    expect(within(table).getByText('未知')).toBeInTheDocument()
    expect(within(table).getByText('0')).toBeInTheDocument()
    expect(table).not.toHaveTextContent('A private prompt')
    view.unmount()
    render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    expect(screen.getByLabelText('测试提示词')).toHaveValue('')
    expect(screen.queryByText('Actual response text')).not.toBeInTheDocument()
  })

  it('cancels requests, ignores late responses, and aborts on unmount', async () => {
    snapshot = { ...snapshot, upstreams: [upstream], models: [model] }
    const view = render(<GatewayPage />)
    await screen.findByText(/暂无访问密钥/)
    fireEvent.change(screen.getByLabelText('测试模型'), { target: { value: model.alias } })
    fireEvent.change(screen.getByLabelText('测试提示词'), { target: { value: 'Cancel me' } })
    let signal: AbortSignal | undefined
    let resolve!: (value: Response) => void
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => { signal = init.signal!; return new Promise<Response>((done) => { resolve = done }) })
    fireEvent.click(screen.getByRole('button', { name: '发送真实请求' }))
    fireEvent.click(screen.getByRole('button', { name: '取消测试' }))
    expect(signal?.aborted).toBe(true)
    await act(async () => resolve(response({ choices: [{ message: { content: 'Late response' } }] })))
    expect(screen.queryByText('Late response')).not.toBeInTheDocument()
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => { signal = init.signal!; return new Promise(() => {}) })
    fireEvent.click(screen.getByRole('button', { name: '发送真实请求' }))
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })
})
