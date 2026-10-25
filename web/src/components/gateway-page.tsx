import { useEffect, useRef, useState } from 'react'
import type { GatewayModel, GatewayModelInput, GatewaySnapshot, GatewayUpstream, GatewayUpstreamInput } from '../../../shared/gateway'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { StatusBadge } from './ui/status-badge'
import { gatewayRequest as request } from '../lib/gateway-api'
import { GatewayAccessKeys } from './gateway-access-keys'
import { PageTabs } from './page-tabs'
const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-current'

type Editor = { kind: 'upstream'; value?: GatewayUpstream } | { kind: 'model'; value?: GatewayModel; upstreamId?: string; remoteModel?: string }

export function GatewayPage() {
  const [snapshot, setSnapshot] = useState<GatewaySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pending, setPending] = useState('')
  const [message, setMessage] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [authentication, setAuthentication] = useState<GatewayUpstreamInput['authentication']>('api-key')
  const [discovery, setDiscovery] = useState<{ upstreamId: string; models: string[] } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testMessage, setTestMessage] = useState('')
  const [testError, setTestError] = useState('')
  const [result, setResult] = useState('')
  const [testAlias, setTestAlias] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const requests = useRef(new Set<AbortController>())
  const testRequest = useRef<AbortController | null>(null)
  const loadRequest = useRef<AbortController | null>(null)
  const actionRequest = useRef<AbortController | null>(null)

  function loadConfig() {
    loadRequest.current?.abort()
    const controller = new AbortController()
    loadRequest.current = controller
    requests.current.add(controller)
    return request<GatewaySnapshot>('/config', controller.signal).then((data) => {
      if (!controller.signal.aborted) { setSnapshot(data); setLoadError('') }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError(`网关配置加载失败：${error instanceof Error ? error.message : '网络请求失败'}`)
    }).finally(() => {
      requests.current.delete(controller)
      if (!controller.signal.aborted) setLoading(false)
    })
  }

  function refresh() {
    setLoading(true)
    return loadConfig()
  }

  useEffect(() => {
    void loadConfig()
    const active = requests.current
    return () => { active.forEach((controller) => controller.abort()) }
  }, [])

  async function act(label: string, path: string, method: string, body?: unknown, discoverId?: string) {
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
      setMessage(`${label}完成。${discoverId ? '请选择模型添加映射，也可手动填写。' : '配置已保存到服务器。'}`)
    } catch (error) {
      if (!controller.signal.aborted) setActionError(`${label}失败：${error instanceof Error ? error.message : '网络请求失败'}`)
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
    setTesting(true); setResult(''); setTestError(''); setTestMessage('正在请求上游…')
    try {
      const data = await request<{ choices?: { message?: { content?: string | null } }[] }>('/test', controller.signal, 'POST', { model: alias, messages: [{ role: 'user', content: prompt }], stream: false })
      if (!controller.signal.aborted) {
        setResult(data.choices?.[0]?.message?.content ?? '上游未返回文本内容。')
        setTestMessage('请求完成。')
      }
    } catch (error) {
      if (!controller.signal.aborted) setTestError(`测试失败：${error instanceof Error ? error.message : '网络请求失败'}`)
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
    <PageHeader eyebrow="当前服务器 · 本地技术预览" title="模型网关" description="真实保存上游与模型别名，向上游转发请求并查看调用元数据。ShareServer 不运行模型。" action={<Button disabled={busy} onClick={() => { setActionError(''); setAuthentication('api-key'); setEditor({ kind: 'upstream' }) }}>添加上游</Button>} />
    <aside className={panel} aria-label="网关使用说明">
      <p className={muted}>管理操作受实例访问控制保护。客户端通过访问密钥调用获授权的模型；组织成员授权和配额控制尚未接入。</p>
      <p className={muted}>先添加上游，再发现或手动添加模型，完成测试后创建客户端访问密钥。上游 API Key 加密保存在服务器，编辑时不会返回原文。</p>
      <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>{loading ? '正在刷新…' : '刷新配置与审计'}</Button>
    </aside>
    {loading && <p role="status">正在加载网关配置…</p>}
    {loadError && <div className={panel}><p role="alert" className="break-words">{loadError}{snapshot ? '。当前显示上次读取的数据。' : ''}</p><Button variant="secondary" disabled={busy} onClick={() => void refresh()}>重试加载</Button></div>}
    {actionError && !editor && <p role="alert" className="break-words">{actionError}</p>}
    {pending && <p role="status">{pending}中…</p>}
    {message && <p role="status">{message}</p>}
     {snapshot && <>
       <PageTabs title="模型网关" active={activeTab} onChange={setActiveTab} tabs={[{ key: 'overview', label: '概览' }, { key: 'upstreams', label: '上游服务' }, { key: 'models', label: '模型目录' }, { key: 'keys', label: '访问密钥' }, { key: 'test', label: '请求测试' }, { key: 'audits', label: '调用审计' }, { key: 'client', label: '客户端接入' }]} />
       <section className={`${panel} ${activeTab === 'overview' ? '' : 'hidden'}`} aria-label="网关概览"><h2 className="font-semibold">网关概览</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>上游服务</p><p className="mt-1 text-2xl font-semibold">{snapshot.upstreams.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>模型映射</p><p className="mt-1 text-2xl font-semibold">{snapshot.models.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>调用记录</p><p className="mt-1 text-2xl font-semibold">{snapshot.audits.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className={muted}>客户端地址</p><p className="mt-1 break-all text-sm">{snapshot.gatewayBaseUrl ?? '未配置'}</p></div></div><p className={muted}>客户端通过访问密钥调用已授权模型；上游凭据只保存在服务器，网关不执行模型返回的工具调用。</p></section>
       <section className={`${panel} ${activeTab === 'upstreams' ? '' : 'hidden'}`} aria-label="上游服务"><h2 className="font-semibold">上游服务</h2>
        {!snapshot.upstreams.length && <p className={muted}>尚无上游服务。添加上游后，再配置模型映射。</p>}
        {snapshot.upstreams.map((upstream) => <article key={upstream.id} className="space-y-3 border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center gap-3"><h3 className="break-all font-semibold">{upstream.name}</h3><StatusBadge status={upstream.enabled ? '已启用' : '已停用'} tone={upstream.enabled ? 'online' : 'offline'} /></div>
          <p className={`${muted} break-all`}>{upstream.baseUrl}</p><p className={`${muted} break-all`}>OpenAI Chat Completions · {upstream.authentication === 'none' ? '无需认证' : upstream.credentialConfigured ? '凭据已配置' : '凭据未配置'}（不代表连接已验证）</p>
           <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setActionError(''); setAuthentication(upstream.authentication); setEditor({ kind: 'upstream', value: upstream }) }}>编辑上游 {upstream.name}</Button><Button variant="secondary" disabled={busy} onClick={() => void act('更新上游', `/upstreams/${encodeURIComponent(upstream.id)}`, 'PUT', { name: upstream.name, baseUrl: upstream.baseUrl, protocol: upstream.protocol, authentication: upstream.authentication, credentialAction: 'keep', enabled: !upstream.enabled } satisfies GatewayUpstreamInput)}>{upstream.enabled ? '停用' : '启用'}上游 {upstream.name}</Button><Button variant="secondary" disabled={busy || !upstream.enabled || (upstream.authentication === 'api-key' && !upstream.credentialConfigured)} onClick={() => { setDiscovery(null); void act('发现模型', `/upstreams/${encodeURIComponent(upstream.id)}/discover`, 'POST', undefined, upstream.id) }}>发现模型 {upstream.name}</Button></div>
        </article>)}
        {discovery && <div className="min-w-0 space-y-3"><h3 className="break-all font-semibold">发现结果 · {snapshot.upstreams.find((item) => item.id === discovery.upstreamId)?.name}</h3>{!discovery.models.length && <p className={muted}>上游未返回模型，可手动添加映射。</p>}<div className="flex flex-wrap gap-2">{discovery.models.map((remoteModel) => <Button key={remoteModel} className="h-auto min-w-0 max-w-full whitespace-normal break-all py-2 text-left" variant="secondary" disabled={busy} onClick={() => { setActionError(''); setEditor({ kind: 'model', upstreamId: discovery.upstreamId, remoteModel }) }}>添加映射 {remoteModel}</Button>)}</div></div>}
       </section>
       <section className={`${panel} ${activeTab === 'models' ? '' : 'hidden'}`} aria-label="模型映射"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">模型映射</h2><Button variant="secondary" disabled={busy || !snapshot.upstreams.length} onClick={() => { setActionError(''); setEditor({ kind: 'model' }) }}>手动添加映射</Button></div>
        {!snapshot.models.length && <p className={muted}>尚无模型映射。先添加上游，再发现模型或手动填写远端模型名称与别名。</p>}
        {snapshot.models.map((model) => <article key={model.id} className="space-y-3 border-t border-white/10 pt-4"><h3 className="break-all font-semibold">{model.alias} → {model.remoteModel}</h3>{model.displayName && <p className="break-all">{model.displayName}</p>}<p className={muted}>上游：{snapshot.upstreams.find((item) => item.id === model.upstreamId)?.name ?? model.upstreamId} · {model.enabled ? '映射已启用' : '映射已停用'}</p><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={() => { setActionError(''); setEditor({ kind: 'model', value: model }) }}>编辑映射 {model.alias}</Button><Button variant="secondary" disabled={busy} onClick={() => void act('更新映射', `/models/${encodeURIComponent(model.id)}`, 'PUT', { alias: model.alias, upstreamId: model.upstreamId, remoteModel: model.remoteModel, ...(model.displayName ? { displayName: model.displayName } : {}), enabled: !model.enabled } satisfies GatewayModelInput)}>{model.enabled ? '停用' : '启用'}映射 {model.alias}</Button></div></article>)}
       </section>
       <div className={activeTab === 'keys' ? '' : 'hidden'}><GatewayAccessKeys models={snapshot.models} /></div>
       <section className={`${panel} ${activeTab === 'client' ? '' : 'hidden'}`} aria-label="客户端设置"><h2 className="font-semibold">客户端设置</h2>
        <p className={muted}>在 GoodBuddy 或兼容客户端中添加服务：协议选择 OpenAI Chat Completions（openai-chat-completions）。</p>
        {snapshot.gatewayBaseUrl ? <p className="break-all text-sm">baseURL：<code>{snapshot.gatewayBaseUrl}</code></p> : <p className={muted}>尚未配置客户端 baseURL。请管理员设置 SHARESERVER_GATEWAY_BASE_URL 为客户端可达的完整网关 API 基础地址并重启服务。</p>}
        <p className={muted}>模型 ID 填写下方模型别名，不填远端模型名称或显示名称。API Key 使用新建的访问密钥，并确保它已授权该模型。</p>
        <ul className="space-y-2 text-sm">{snapshot.models.map(model => <li key={model.id} className="break-all">模型 ID：<code>{model.alias}</code>{model.displayName ? ` · ${model.displayName}` : ''}</li>)}</ul>
       </section>
       <section className={`${panel} ${activeTab === 'test' ? '' : 'hidden'}`} aria-label="真实请求测试"><h2 className="font-semibold">真实请求测试</h2><p id="gateway-test-help" className={muted}>选择模型并发送一条真实请求。提示词和结果仅保留在当前页面，失败后可以直接修改并重试。</p>
         <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void test(String(form.get('alias')), String(form.get('prompt'))) }}>
           <fieldset disabled={testing || busy || !available.length} className="space-y-4"><label className="block text-sm">测试模型<select name="alias" required value={testAlias || (available.length === 1 ? available[0].alias : '')} onChange={event => setTestAlias(event.target.value)} className={control}><option value="">请选择模型别名</option>{available.map((model) => <option key={model.id} value={model.alias}>{model.alias}</option>)}</select></label><label className="block text-sm">测试提示词<textarea name="prompt" required rows={3} aria-describedby="gateway-test-help" className={control} /></label><Button type="submit" variant="secondary">{testing ? '请求中…' : '发送真实请求'}</Button></fieldset>
           {!available.length && <p className={muted}>请先启用模型与上游。</p>}
          {testing && <Button variant="secondary" onClick={() => { testRequest.current?.abort(); testRequest.current = null; setTesting(false); setTestMessage('已取消测试；服务器审计可能稍后更新，请刷新查看。') }}>取消测试</Button>}
        </form>
        {testMessage && <p role="status">{testMessage}</p>}{testError && <p role="alert" className="break-words">{testError}</p>}{result && <div><h3 className="font-semibold">测试结果</h3><pre className="mt-2 whitespace-pre-wrap break-words text-sm">{result}</pre><Button variant="ghost" onClick={() => setResult('')}>清除结果</Button></div>}
       </section>
       <section className={`${panel} ${activeTab === 'audits' ? '' : 'hidden'}`} aria-label="调用审计"><h2 className="font-semibold">调用审计</h2><p className={muted}>服务器返回的调用元数据；不含提示词或响应正文。用量未返回时显示「未知」，不按零计算。</p>
        {!snapshot.audits.length ? <p className={muted}>暂无调用审计。完成真实请求后刷新查看。</p> : <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="调用审计表格"><table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">真实网关调用元数据</caption><thead><tr>{['时间 / 编号', '模型 / 上游', '方式', '结果 / HTTP', '耗时 ms', '输入 Token', '输出 Token', '错误码', '访问密钥 ID'].map((heading, index) => <th key={heading} scope="col" className={`p-2 ${index >= 4 && index <= 6 ? 'text-right' : ''}`}>{heading}</th>)}</tr></thead><tbody>{snapshot.audits.map((audit) => <tr key={audit.id} className="border-t border-white/10"><td className="p-2"><time dateTime={audit.time}>{audit.time}</time><div>{audit.id}</div></td><td className="break-all p-2">{audit.model}<div>{audit.upstreamId ?? '未知'}</div></td><td className="p-2">{audit.stream ? '流式' : '非流式'}</td><td className="p-2">{{ success: '成功', failed: '失败', cancelled: '已取消' }[audit.status]} / {audit.httpStatus}</td><td className="p-2 text-right">{audit.durationMs}</td><td className="p-2 text-right">{audit.inputTokens ?? '未知'}</td><td className="p-2 text-right">{audit.outputTokens ?? '未知'}</td><td className="p-2">{audit.errorCode ?? '无'}</td><td className="break-all p-2">{audit.accessKeyId ?? '未关联密钥'}</td></tr>)}</tbody></table></div>}
       </section>
    </>}
    {editor && <Dialog open title={`${editor.value ? '编辑' : '添加'}${editor.kind === 'upstream' ? '上游服务' : '模型映射'}`} description="保存到当前服务器。失败后保留普通字段；密钥提交后清空，重试时需重新输入。" onOpenChange={(open) => { if (!open && !pending) { setEditor(null); setActionError('') } }}>
      <form className="space-y-4" aria-describedby={actionError ? 'gateway-editor-error' : undefined} onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const text = (key: string) => String(form.get(key) ?? '').trim()
         const apiKey = text('apiKey')
         const body = editor.kind === 'upstream' ? { name: text('name'), baseUrl: text('baseUrl'), protocol: 'openai-chat-completions', authentication, credentialAction: apiKey ? 'replace' : 'keep', ...(apiKey ? { apiKey } : {}), enabled: form.has('enabled') } satisfies GatewayUpstreamInput : { alias: text('alias'), upstreamId: text('upstreamId'), remoteModel: text('remoteModel'), ...(text('displayName') ? { displayName: text('displayName') } : {}), enabled: form.has('enabled') } satisfies GatewayModelInput
        const secret = event.currentTarget.elements.namedItem('apiKey')
        if (secret instanceof HTMLInputElement) secret.value = ''
        void act('保存配置', `/${editor.kind === 'upstream' ? 'upstreams' : 'models'}${editor.value ? `/${encodeURIComponent(editor.value.id)}` : ''}`, editor.value ? 'PUT' : 'POST', body)
      }}>
        <fieldset disabled={Boolean(pending)} className="space-y-4">
          {editor.kind === 'upstream' ? <>
            <label className="block text-sm">上游名称<input name="name" required maxLength={200} defaultValue={editor.value?.name} className={control} /></label>
            <label className="block text-sm">上游 Base URL<input name="baseUrl" type="url" required maxLength={2048} defaultValue={editor.value?.baseUrl} placeholder="https://api.deepseek.com/v1" className={control} /></label>
            <label className="block text-sm">上游协议<select className={control} defaultValue="openai-chat-completions"><option value="openai-chat-completions">OpenAI Chat Completions</option></select></label>
             <label className="block text-sm">认证方式<select value={authentication} className={control} onChange={event => setAuthentication(event.target.value as typeof authentication)}><option value="api-key">API Key</option><option value="none">无需认证</option></select></label>
             {authentication === 'api-key' && <label className="block text-sm">上游 API Key（留空则保留现有值）<input aria-label="上游 API Key" name="apiKey" type="password" autoComplete="new-password" maxLength={16384} className={control} /></label>}
             <p className={muted}>保存时不填写 API Key 会保留当前凭据；填写新值会覆盖当前凭据。凭据提交后不会再次显示。</p>
          </> : <>
             <label className="block text-sm">对外暴露名称（模型 ID）<input aria-label="模型别名" name="alias" required maxLength={editor.value?.alias.length && editor.value.alias.length > 128 ? 200 : 128} pattern="[A-Za-z0-9][A-Za-z0-9._:\/\-]*" defaultValue={editor.value?.alias} className={control} aria-describedby="gateway-alias-help" /></label>
             <p id="gateway-alias-help" className={muted}>客户端使用这个名称调用模型，以字母或数字开头；可包含字母、数字、点、下划线、冒号、斜杠和连字符。</p>
            <label className="block text-sm">显示名称（可选）<input name="displayName" maxLength={200} defaultValue={editor.value?.displayName} className={control} /></label>
             {(editor.value?.upstreamId || editor.upstreamId) ? <><input type="hidden" name="upstreamId" value={editor.value?.upstreamId ?? editor.upstreamId} /><p className={muted}>所属上游：{snapshot?.upstreams.find((upstream) => upstream.id === (editor.value?.upstreamId ?? editor.upstreamId))?.name ?? '未知上游'}</p></> : <label className="block text-sm">映射上游<select name="upstreamId" required defaultValue={snapshot?.upstreams[0]?.id} className={control}>{snapshot?.upstreams.map((upstream) => <option key={upstream.id} value={upstream.id}>{upstream.name}</option>)}</select></label>}
            <label className="block text-sm">远端模型名称<input name="remoteModel" required maxLength={200} defaultValue={editor.value?.remoteModel ?? editor.remoteModel} className={control} /></label>
          </>}
          <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={editor.value?.enabled ?? true} />保存后启用</label>
        </fieldset>
        {actionError && <p id="gateway-editor-error" role="alert" className="break-words">{actionError}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={Boolean(pending)} onClick={() => { setEditor(null); setActionError('') }}>取消</Button><Button type="submit" disabled={Boolean(pending)}>{pending ? '正在保存…' : '保存配置'}</Button></div>
      </form>
    </Dialog>}
  </div>
}
