import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayModel, GatewayModelInput, GatewaySnapshot, GatewayUpstream, GatewayUpstreamInput } from '../../../shared/gateway'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { StatusBadge } from './ui/status-badge'
import { gatewayRequest as request } from '../lib/gateway-api'
import { GatewayAccessKeys } from './gateway-access-keys'
import { PageTabs } from './page-tabs'
import { useI18n } from '../lib/i18n'
const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-current'

type Editor = { kind: 'upstream'; value?: GatewayUpstream } | { kind: 'model'; value?: GatewayModel; upstreamId?: string; remoteModel?: string }
type Notice = '' | (() => string)
const actions = {
  upstream: ['更新上游', 'Update upstream'],
  discover: ['发现模型', 'Discover models'],
  model: ['更新映射', 'Update mapping'],
  save: ['保存配置', 'Save configuration'],
} as const

export function GatewayPage() {
  const { t, formatDate } = useI18n()
  const [snapshot, setSnapshot] = useState<GatewaySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<Notice>('')
  const [actionError, setActionError] = useState<Notice>('')
  const [pending, setPending] = useState<keyof typeof actions | ''>('')
  const [message, setMessage] = useState<Notice>('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [authentication, setAuthentication] = useState<GatewayUpstreamInput['authentication']>('api-key')
  const [discovery, setDiscovery] = useState<{ upstreamId: string; models: string[] } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState<Notice>('')
  const [testError, setTestError] = useState<Notice>('')
  const [result, setResult] = useState<string | null>('')
  const [testAlias, setTestAlias] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const requests = useRef(new Set<AbortController>())
  const testRequest = useRef<AbortController | null>(null)
  const loadRequest = useRef<AbortController | null>(null)
  const actionRequest = useRef<AbortController | null>(null)

  const loadConfig = useCallback(() => {
    loadRequest.current?.abort()
    const controller = new AbortController()
    loadRequest.current = controller
    requests.current.add(controller)
    return request<GatewaySnapshot>('/config', controller.signal).then((data) => {
      if (!controller.signal.aborted) { setSnapshot(data); setLoadError('') }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(() => () => t('网关配置加载失败：{error}', 'Failed to load gateway configuration: {error}', { error: error instanceof Error ? error.message : t('网络请求失败', 'Network request failed') }))
    }).finally(() => {
      requests.current.delete(controller)
      if (!controller.signal.aborted) setLoading(false)
    })
  }, [t])

  function refresh() {
    setLoading(true)
    return loadConfig()
  }

  useEffect(() => {
    void loadConfig()
    const active = requests.current
    return () => { active.forEach((controller) => controller.abort()) }
  }, [loadConfig])

  async function act(label: keyof typeof actions, path: string, method: string, body?: unknown, discoverId?: string) {
    if (actionRequest.current) return
    const controller = new AbortController()
    actionRequest.current = controller
    requests.current.add(controller)
    setPending(label); setActionError(''); setMessage('')
    try {
      const data = await request<GatewaySnapshot | { models: string[] }>(path, controller.signal, method, body)
      if (controller.signal.aborted) return
      if (discoverId) setDiscovery({ upstreamId: discoverId, models: (data as { models: string[] }).models })
      else {
        setEditor(null)
        await refresh()
      }
      setMessage(() => () => t('{action}完成。{detail}', '{action} completed. {detail}', { action: t(actions[label][0], actions[label][1]), detail: discoverId ? t('请选择模型添加映射，也可手动填写。', 'Select a model to add a mapping, or enter it manually.') : t('配置已保存到服务器。', 'Configuration saved to the server.') }))
    } catch (error) {
      if (!controller.signal.aborted) setActionError(() => () => t('{action}失败：{error}', '{action} failed: {error}', { action: t(actions[label][0], actions[label][1]), error: error instanceof Error ? error.message : t('网络请求失败', 'Network request failed') }))
    } finally {
      requests.current.delete(controller)
      actionRequest.current = null
      if (!controller.signal.aborted) setPending('')
    }
  }

  async function test(alias: string, prompt: string) {
    if (testRequest.current) return
    const controller = new AbortController()
    testRequest.current = controller
    requests.current.add(controller)
    setTesting(true); setResult(''); setTestError(''); setTestMessage(() => () => t('正在请求上游…', 'Requesting upstream…'))
    try {
      const data = await request<{ choices?: { message?: { content?: string | null } }[] }>('/test', controller.signal, 'POST', { model: alias, messages: [{ role: 'user', content: prompt }], stream: false })
      if (!controller.signal.aborted) {
        setResult(data.choices?.[0]?.message?.content ?? null)
        setTestMessage(() => () => t('请求完成。', 'Request completed.'))
      }
    } catch (error) {
      if (!controller.signal.aborted) setTestError(() => () => t('测试失败：{error}', 'Test failed: {error}', { error: error instanceof Error ? error.message : t('网络请求失败', 'Network request failed') }))
      if (!controller.signal.aborted) setTestMessage('')
    } finally {
      requests.current.delete(controller)
      if (testRequest.current === controller) testRequest.current = null
      if (!controller.signal.aborted) { setTesting(false); void refresh() }
    }
  }

  const busy = loading || Boolean(pending)
  const available = snapshot?.models.filter((model) => model.enabled && snapshot.upstreams.some((upstream) => upstream.id === model.upstreamId && upstream.enabled)) ?? []
  return <div className="min-w-0 space-y-5 text-[var(--text-primary)]">
    <PageHeader eyebrow={t('当前服务器 · 本地技术预览', 'Current server · Local technical preview')} title={t('模型网关', 'Model gateway')} description={t('真实保存上游与模型别名，向上游转发请求并查看调用元数据。ShareServer 不运行模型。', 'Save upstreams and model aliases, forward requests upstream, and view call metadata. ShareServer does not run models.')} action={<Button disabled={busy} onClick={() => { setActionError(''); setAuthentication('api-key'); setEditor({ kind: 'upstream' }) }}>{t('添加上游', 'Add upstream')}</Button>} />
    <aside className={panel} aria-label={t('网关使用说明', 'Gateway instructions')}>
      <p className={muted}>{t('管理操作受实例访问控制保护。客户端通过访问密钥调用获授权的模型；组织成员授权和配额控制尚未接入。', 'Administration is protected by instance access controls. Clients use access keys to call authorized models; organization member permissions and quotas are not yet integrated.')}</p>
      <p className={muted}>{t('先添加上游，再发现或手动添加模型，完成测试后创建客户端访问密钥。上游 API Key 加密保存在服务器，编辑时不会返回原文。', 'Add an upstream, discover or manually add models, test them, then create client access keys. Upstream API Keys are encrypted on the server and are never returned when editing.')}</p>
      <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>{loading ? t('正在刷新…', 'Refreshing…') : t('刷新配置与审计', 'Refresh configuration and audit')}</Button>
    </aside>
    {loading && <p role="status">{t('正在加载网关配置…', 'Loading gateway configuration…')}</p>}
    {loadError && <div className={panel}><p role="alert" className="break-words">{loadError()}{snapshot ? t('。当前显示上次读取的数据。', ' Showing the last loaded data.') : ''}</p><Button variant="secondary" disabled={busy} onClick={() => void refresh()}>{t('重试加载', 'Retry loading')}</Button></div>}
    {actionError && !editor && <p role="alert" className="break-words">{actionError()}</p>}
    {pending && <p role="status">{t('{action}中…', '{action} in progress…', { action: t(actions[pending][0], actions[pending][1]) })}</p>}
    {message && <p role="status">{message()}</p>}
     {snapshot && <>
       <PageTabs title={t('模型网关', 'Model gateway')} active={activeTab} onChange={setActiveTab} tabs={[{ key: 'overview', label: t('概览', 'Overview') }, { key: 'upstreams', label: t('上游服务', 'Upstreams') }, { key: 'models', label: t('模型目录', 'Model catalog') }, { key: 'keys', label: t('访问密钥', 'Access keys') }, { key: 'test', label: t('请求测试', 'Request test') }, { key: 'audits', label: t('调用审计', 'Call audit') }, { key: 'client', label: t('客户端接入', 'Client integration') }]} />
       <section className={`${panel} ${activeTab === 'overview' ? '' : 'hidden'}`} aria-label={t('网关概览', 'Gateway overview')}><h2 className="font-semibold">{t('网关概览', 'Gateway overview')}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>{t('上游服务', 'Upstreams')}</p><p className="mt-1 text-2xl font-semibold">{snapshot.upstreams.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>{t('模型映射', 'Model mappings')}</p><p className="mt-1 text-2xl font-semibold">{snapshot.models.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>{t('调用记录', 'Call records')}</p><p className="mt-1 text-2xl font-semibold">{snapshot.audits.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>{t('客户端地址', 'Client URL')}</p><p className="mt-1 break-all text-sm">{snapshot.gatewayBaseUrl ?? t('未配置', 'Not configured')}</p></div></div><p className={muted}>{t('客户端通过访问密钥调用已授权模型；上游凭据只保存在服务器，网关不执行模型返回的工具调用。', 'Clients use access keys to call authorized models. Upstream credentials stay on the server. The gateway does not execute tool calls returned by models.')}</p></section>
       <section className={`${panel} ${activeTab === 'upstreams' ? '' : 'hidden'}`} aria-label={t('上游服务', 'Upstreams')}><h2 className="font-semibold">{t('上游服务', 'Upstreams')}</h2>
        {!snapshot.upstreams.length && <p className={muted}>{t('尚无上游服务。添加上游后，再配置模型映射。', 'No upstreams yet. Add an upstream, then configure model mappings.')}</p>}
        {snapshot.upstreams.map((upstream) => <article key={upstream.id} className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-3"><h3 className="break-all font-semibold">{upstream.name}</h3><StatusBadge status={upstream.enabled ? t('已启用', 'Enabled') : t('已停用', 'Disabled')} tone={upstream.enabled ? 'online' : 'offline'} /></div>
          <p className={`${muted} break-all`}>{upstream.baseUrl}</p><p className={`${muted} break-all`}>OpenAI Chat Completions · {upstream.authentication === 'none' ? t('无需认证', 'No authentication') : upstream.credentialConfigured ? t('凭据已配置', 'Credentials configured') : t('凭据未配置', 'Credentials not configured')}{t('（不代表连接已验证）', ' (connection not verified)')}</p>
           <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setActionError(''); setAuthentication(upstream.authentication); setEditor({ kind: 'upstream', value: upstream }) }}>{t('编辑上游 {name}', 'Edit upstream {name}', { name: upstream.name })}</Button><Button variant="secondary" disabled={busy} onClick={() => void act('upstream', `/upstreams/${encodeURIComponent(upstream.id)}`, 'PUT', { name: upstream.name, baseUrl: upstream.baseUrl, protocol: upstream.protocol, authentication: upstream.authentication, credentialAction: 'keep', enabled: !upstream.enabled } satisfies GatewayUpstreamInput)}>{upstream.enabled ? t('停用上游 {name}', 'Disable upstream {name}', { name: upstream.name }) : t('启用上游 {name}', 'Enable upstream {name}', { name: upstream.name })}</Button><Button variant="secondary" disabled={busy || !upstream.enabled || (upstream.authentication === 'api-key' && !upstream.credentialConfigured)} onClick={() => { setDiscovery(null); void act('discover', `/upstreams/${encodeURIComponent(upstream.id)}/discover`, 'POST', undefined, upstream.id) }}>{t('发现模型 {name}', 'Discover models {name}', { name: upstream.name })}</Button></div>
        </article>)}
        {discovery && <div className="min-w-0 space-y-3"><h3 className="break-all font-semibold">{t('发现结果', 'Discovery results')} · {snapshot.upstreams.find((item) => item.id === discovery.upstreamId)?.name}</h3>{!discovery.models.length && <p className={muted}>{t('上游未返回模型，可手动添加映射。', 'The upstream returned no models. You can add mappings manually.')}</p>}<div className="flex flex-wrap gap-2">{discovery.models.map((remoteModel) => <Button key={remoteModel} className="h-auto min-w-0 max-w-full whitespace-normal break-all py-2 text-left" variant="secondary" disabled={busy} onClick={() => { setActionError(''); setEditor({ kind: 'model', upstreamId: discovery.upstreamId, remoteModel }) }}>{t('添加映射 {name}', 'Add mapping {name}', { name: remoteModel })}</Button>)}</div></div>}
       </section>
       <section className={`${panel} ${activeTab === 'models' ? '' : 'hidden'}`} aria-label={t('模型映射', 'Model mappings')}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t('模型映射', 'Model mappings')}</h2><Button variant="secondary" disabled={busy || !snapshot.upstreams.length} onClick={() => { setActionError(''); setEditor({ kind: 'model' }) }}>{t('手动添加映射', 'Add mapping manually')}</Button></div>
        {!snapshot.models.length && <p className={muted}>{t('尚无模型映射。先添加上游，再发现模型或手动填写远端模型名称与别名。', 'No model mappings yet. Add an upstream, then discover models or enter a remote model name and alias manually.')}</p>}
        {snapshot.models.map((model) => <article key={model.id} className="space-y-3 border-t border-white/10 pt-4"><h3 className="break-all font-semibold">{model.alias} → {model.remoteModel}</h3>{model.displayName && <p className="break-all">{model.displayName}</p>}<p className={muted}>{t('上游：', 'Upstream: ')}{snapshot.upstreams.find((item) => item.id === model.upstreamId)?.name ?? model.upstreamId} · {model.enabled ? t('映射已启用', 'Mapping enabled') : t('映射已停用', 'Mapping disabled')}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setActionError(''); setEditor({ kind: 'model', value: model }) }}>{t('编辑映射 {name}', 'Edit mapping {name}', { name: model.alias })}</Button><Button variant="secondary" disabled={busy} onClick={() => void act('model', `/models/${encodeURIComponent(model.id)}`, 'PUT', { alias: model.alias, upstreamId: model.upstreamId, remoteModel: model.remoteModel, ...(model.displayName ? { displayName: model.displayName } : {}), enabled: !model.enabled } satisfies GatewayModelInput)}>{model.enabled ? t('停用映射 {name}', 'Disable mapping {name}', { name: model.alias }) : t('启用映射 {name}', 'Enable mapping {name}', { name: model.alias })}</Button></div></article>)}
       </section>
       <div className={activeTab === 'keys' ? '' : 'hidden'}><GatewayAccessKeys models={snapshot.models} /></div>
       <section className={`${panel} ${activeTab === 'client' ? '' : 'hidden'}`} aria-label={t('客户端设置', 'Client settings')}><h2 className="font-semibold">{t('客户端设置', 'Client settings')}</h2>
        <p className={muted}>{t('在 GoodBuddy 或兼容客户端中添加服务：协议选择 OpenAI Chat Completions（openai-chat-completions）。', 'Add a service in GoodBuddy or a compatible client and select OpenAI Chat Completions (openai-chat-completions) as the protocol.')}</p>
        {snapshot.gatewayBaseUrl ? <p className="break-all text-sm">{t('baseURL：', 'baseURL: ')}<code>{snapshot.gatewayBaseUrl}</code></p> : <p className={muted}>{t('尚未配置客户端 baseURL。请管理员设置 SHARESERVER_GATEWAY_BASE_URL 为客户端可达的完整网关 API 基础地址并重启服务。', 'The client baseURL is not configured. Ask an administrator to set SHARESERVER_GATEWAY_BASE_URL to the full gateway API base URL reachable by clients and restart the service.')}</p>}
        <p className={muted}>{t('模型 ID 填写下方模型别名，不填远端模型名称或显示名称。API Key 使用新建的访问密钥，并确保它已授权该模型。', 'Use a model alias below as the model ID, rather than the remote model name or display name. Use a newly created access key as the API Key and ensure it is authorized for the model.')}</p>
        <ul className="space-y-2 text-sm">{snapshot.models.map(model => <li key={model.id} className="break-all">{t('模型 ID：', 'Model ID: ')}<code>{model.alias}</code>{model.displayName ? ` · ${model.displayName}` : ''}</li>)}</ul>
       </section>
       <section className={`${panel} ${activeTab === 'test' ? '' : 'hidden'}`} aria-label={t('真实请求测试', 'Live request test')}><h2 className="font-semibold">{t('真实请求测试', 'Live request test')}</h2><p id="gateway-test-help" className={muted}>{t('选择模型并发送一条真实请求。提示词和结果仅保留在当前页面，失败后可以直接修改并重试。', 'Select a model and send a live request. Prompts and results stay only on this page. You can edit and retry after a failure.')}</p>
         <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void test(String(form.get('alias')), String(form.get('prompt'))) }}>
           <fieldset disabled={testing || busy || !available.length} className="space-y-4"><label className="block text-sm">{t('测试模型', 'Test model')}<select name="alias" required value={testAlias || (available.length === 1 ? available[0].alias : '')} onChange={event => setTestAlias(event.target.value)} className={control}><option value="">{t('请选择模型别名', 'Select a model alias')}</option>{available.map((model) => <option key={model.id} value={model.alias}>{model.alias}</option>)}</select></label><label className="block text-sm">{t('测试提示词', 'Test prompt')}<textarea name="prompt" required rows={3} aria-describedby="gateway-test-help" className={control} /></label><Button type="submit" variant="secondary">{testing ? t('请求中…', 'Requesting…') : t('发送真实请求', 'Send live request')}</Button></fieldset>
           {!available.length && <p className={muted}>{t('请先启用模型与上游。', 'Enable a model and its upstream first.')}</p>}
          {testing && <Button variant="secondary" onClick={() => { testRequest.current?.abort(); testRequest.current = null; setTesting(false); setTestMessage(() => () => t('已取消测试；服务器审计可能稍后更新，请刷新查看。', 'Test cancelled. Server audit records may update later; refresh to view them.')) }}>{t('取消测试', 'Cancel test')}</Button>}
        </form>
        {testMessage && <p role="status">{testMessage()}</p>}{testError && <p role="alert" className="break-words">{testError()}</p>}{result !== '' && <div><h3 className="font-semibold">{t('测试结果', 'Test result')}</h3><pre className="mt-2 whitespace-pre-wrap break-words text-sm">{result ?? t('上游未返回文本内容。', 'The upstream returned no text content.')}</pre><Button variant="ghost" onClick={() => setResult('')}>{t('清除结果', 'Clear result')}</Button></div>}
       </section>
       <section className={`${panel} ${activeTab === 'audits' ? '' : 'hidden'}`} aria-label={t('调用审计', 'Call audit')}><h2 className="font-semibold">{t('调用审计', 'Call audit')}</h2><p className={muted}>{t('服务器返回的调用元数据；不含提示词或响应正文。用量未返回时显示「未知」，不按零计算。', 'Call metadata returned by the server, without prompts or response bodies. Missing usage is shown as “Unknown”, not counted as zero.')}</p>
        {!snapshot.audits.length ? <p className={muted}>{t('暂无调用审计。完成真实请求后刷新查看。', 'No call audit records yet. Send a live request, then refresh.')}</p> : <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={t('调用审计表格', 'Call audit table')}><table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">{t('真实网关调用元数据', 'Live gateway call metadata')}</caption><thead><tr>{[t('时间 / 编号', 'Time / ID'), t('模型 / 上游', 'Model / Upstream'), t('方式', 'Mode'), t('结果 / HTTP', 'Result / HTTP'), t('耗时 ms', 'Duration ms'), t('输入 Token', 'Input tokens'), t('输出 Token', 'Output tokens'), t('错误码', 'Error code'), t('访问密钥 ID', 'Access key ID')].map((heading, index) => <th key={index} scope="col" className={`p-2 ${index >= 4 && index <= 6 ? 'text-right' : ''}`}>{heading}</th>)}</tr></thead><tbody>{snapshot.audits.map((audit) => <tr key={audit.id} className="border-t border-white/10"><td className="p-2"><time dateTime={audit.time}>{formatDate(audit.time)}</time><div>{audit.id}</div></td><td className="break-all p-2">{audit.model}<div>{audit.upstreamId ?? t('未知', 'Unknown')}</div></td><td className="p-2">{audit.stream ? t('流式', 'Streaming') : t('非流式', 'Non-streaming')}</td><td className="p-2">{{ success: t('成功', 'Success'), failed: t('失败', 'Failed'), cancelled: t('已取消', 'Cancelled') }[audit.status]} / {audit.httpStatus}</td><td className="p-2 text-right">{audit.durationMs}</td><td className="p-2 text-right">{audit.inputTokens ?? t('未知', 'Unknown')}</td><td className="p-2 text-right">{audit.outputTokens ?? t('未知', 'Unknown')}</td><td className="p-2">{audit.errorCode ?? t('无', 'None')}</td><td className="break-all p-2">{audit.accessKeyId ?? t('未关联密钥', 'No linked key')}</td></tr>)}</tbody></table></div>}
       </section>
    </>}
    {editor && <Dialog open title={editor.kind === 'upstream' ? (editor.value ? t('编辑上游服务', 'Edit upstream') : t('添加上游服务', 'Add upstream')) : (editor.value ? t('编辑模型映射', 'Edit model mapping') : t('添加模型映射', 'Add model mapping'))} description={t('保存到当前服务器。失败后保留普通字段；密钥提交后清空，重试时需重新输入。', 'Save to the current server. Regular fields are kept after a failure; submitted keys are cleared and must be entered again to retry.')} onOpenChange={(open) => { if (!open && !pending) { setEditor(null); setActionError('') } }}>
      <form className="space-y-4" aria-describedby={actionError ? 'gateway-editor-error' : undefined} onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const text = (key: string) => String(form.get(key) ?? '').trim()
         const apiKey = text('apiKey')
         const body = editor.kind === 'upstream' ? { name: text('name'), baseUrl: text('baseUrl'), protocol: 'openai-chat-completions', authentication, credentialAction: apiKey ? 'replace' : 'keep', ...(apiKey ? { apiKey } : {}), enabled: form.has('enabled') } satisfies GatewayUpstreamInput : { alias: text('alias'), upstreamId: text('upstreamId'), remoteModel: text('remoteModel'), ...(text('displayName') ? { displayName: text('displayName') } : {}), enabled: form.has('enabled') } satisfies GatewayModelInput
        const secret = event.currentTarget.elements.namedItem('apiKey')
        if (secret instanceof HTMLInputElement) secret.value = ''
        void act('save', `/${editor.kind === 'upstream' ? 'upstreams' : 'models'}${editor.value ? `/${encodeURIComponent(editor.value.id)}` : ''}`, editor.value ? 'PUT' : 'POST', body)
      }}>
        <fieldset disabled={Boolean(pending)} className="space-y-4">
          {editor.kind === 'upstream' ? <>
            <label className="block text-sm">{t('上游名称', 'Upstream name')}<input name="name" required maxLength={200} defaultValue={editor.value?.name} className={control} /></label>
            <label className="block text-sm">{t('上游 Base URL', 'Upstream Base URL')}<input name="baseUrl" type="url" required maxLength={2048} defaultValue={editor.value?.baseUrl} placeholder="https://api.deepseek.com/v1" className={control} /></label>
            <label className="block text-sm">{t('上游协议', 'Upstream protocol')}<select className={control} defaultValue="openai-chat-completions"><option value="openai-chat-completions">OpenAI Chat Completions</option></select></label>
             <label className="block text-sm">{t('认证方式', 'Authentication')}<select value={authentication} className={control} onChange={event => setAuthentication(event.target.value as typeof authentication)}><option value="api-key">API Key</option><option value="none">{t('无需认证', 'No authentication')}</option></select></label>
             {authentication === 'api-key' && <label className="block text-sm">{t('上游 API Key（留空则保留现有值）', 'Upstream API Key (leave blank to keep the current value)')}<input aria-label={t('上游 API Key', 'Upstream API Key')} name="apiKey" type="password" autoComplete="new-password" maxLength={16384} className={control} /></label>}
             <p className={muted}>{t('保存时不填写 API Key 会保留当前凭据；填写新值会覆盖当前凭据。凭据提交后不会再次显示。', 'Leaving the API Key blank keeps the current credentials; entering a new value replaces them. Submitted credentials will not be shown again.')}</p>
          </> : <>
             <label className="block text-sm">{t('对外暴露名称（模型 ID）', 'Exposed name (model ID)')}<input aria-label={t('模型别名', 'Model alias')} name="alias" required maxLength={editor.value?.alias.length && editor.value.alias.length > 128 ? 200 : 128} pattern="[A-Za-z0-9][A-Za-z0-9._:\/\-]*" defaultValue={editor.value?.alias} className={control} aria-describedby="gateway-alias-help" /></label>
             <p id="gateway-alias-help" className={muted}>{t('客户端使用这个名称调用模型，以字母或数字开头；可包含字母、数字、点、下划线、冒号、斜杠和连字符。', 'Clients use this name to call the model. Start with a letter or number; letters, numbers, periods, underscores, colons, slashes, and hyphens are allowed.')}</p>
            <label className="block text-sm">{t('显示名称（可选）', 'Display name (optional)')}<input name="displayName" maxLength={200} defaultValue={editor.value?.displayName} className={control} /></label>
             {(editor.value?.upstreamId || editor.upstreamId) ? <><input type="hidden" name="upstreamId" value={editor.value?.upstreamId ?? editor.upstreamId} /><p className={muted}>{t('所属上游：', 'Upstream: ')}{snapshot?.upstreams.find((upstream) => upstream.id === (editor.value?.upstreamId ?? editor.upstreamId))?.name ?? t('未知上游', 'Unknown upstream')}</p></> : <label className="block text-sm">{t('映射上游', 'Mapping upstream')}<select name="upstreamId" required defaultValue={snapshot?.upstreams[0]?.id} className={control}>{snapshot?.upstreams.map((upstream) => <option key={upstream.id} value={upstream.id}>{upstream.name}</option>)}</select></label>}
            <label className="block text-sm">{t('远端模型名称', 'Remote model name')}<input name="remoteModel" required maxLength={200} defaultValue={editor.value?.remoteModel ?? editor.remoteModel} className={control} /></label>
          </>}
          <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={editor.value?.enabled ?? true} />{t('保存后启用', 'Enable after saving')}</label>
        </fieldset>
        {actionError && <p id="gateway-editor-error" role="alert" className="break-words">{actionError()}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={Boolean(pending)} onClick={() => { setEditor(null); setActionError('') }}>{t('取消', 'Cancel')}</Button><Button type="submit" disabled={Boolean(pending)}>{pending ? t('正在保存…', 'Saving…') : t('保存配置', 'Save configuration')}</Button></div>
      </form>
    </Dialog>}
  </div>
}
