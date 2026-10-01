import { createContext, useContext, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { PrototypeSnapshot } from '../../../shared/prototype-data'
import type { PageConfig } from '../app-config'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { StatusBadge } from './ui/status-badge'

type Upstream = { id: string; name: string; url: string; enabled: boolean }
type Model = { id: string; upstreamId: string; alias: string; remote: string; enabled: boolean; group: string }
type Audit = { id: string; time: string; model: string; upstream: string; group: string; result: string; allowed: boolean }
type Document = { id: string; name: string; owner: 'self' | 'other' | 'organization'; deleted: boolean }
type Office = { id: string; name: string; url: string; checks: number; healthy: boolean }
type Release = { version: string; modelId: string; modelName: string; group: string }
type Device = { id: string; name: string; group: string; online: boolean; applied: Release | null }
type DemoState = {
  upstreams: Upstream[]
  models: Model[]
  audits: Audit[]
  documents: Document[]
  offices: Office[]
  organizationRole: boolean
  draft: Release | null
  releases: Record<string, Release[]>
  devices: Device[]
}

const groups = ['平台工程', '设计中心']
const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-current'
const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const DemoContext = createContext<{ state: DemoState; setState: Dispatch<SetStateAction<DemoState>> } | null>(null)

function initialState(): DemoState {
  return {
    upstreams: [{ id: 'upstream-demo', name: '示例上游', url: 'https://gateway.example/v1', enabled: true }],
    models: [
      { id: 'model-chat', upstreamId: 'upstream-demo', alias: 'org-chat', remote: 'demo-chat', enabled: true, group: '全部用户组' },
      { id: 'model-code', upstreamId: 'upstream-demo', alias: 'org-code', remote: 'demo-code', enabled: true, group: '平台工程' }
    ],
    audits: [],
    documents: [
      { id: 'doc-org', name: '组织入门指南.docx', owner: 'organization', deleted: false },
      { id: 'doc-self', name: '我的项目提案.docx', owner: 'self', deleted: false },
      { id: 'doc-other', name: '其他成员文档（仅归属元数据）', owner: 'other', deleted: false }
    ],
    offices: [{ id: 'office-demo', name: '示例 OnlyOffice', url: 'https://office.example', checks: 0, healthy: true }],
    organizationRole: false,
    draft: null,
    releases: {},
    devices: [
      { id: 'device-1', name: '工程工作站（示例）', group: groups[0], online: true, applied: null },
      { id: 'device-2', name: '工程笔记本（示例）', group: groups[0], online: false, applied: null },
      { id: 'device-3', name: '设计工作站（示例）', group: groups[1], online: true, applied: null },
      { id: 'device-4', name: '设计笔记本（示例）', group: groups[1], online: false, applied: null }
    ]
  }
}

// Mount once above the route switch, never inside a keyed route element.
export function ServicesDemo({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState)
  return <DemoContext.Provider value={{ state, setState }}>{children}</DemoContext.Provider>
}

function useDemo() {
  const value = useContext(DemoContext)
  if (!value) throw new Error('ServiceDemoPage must be rendered inside ServicesDemo')
  return value
}

function availableModels(state: DemoState, group?: string) {
  return state.models.filter((model) => model.enabled &&
    state.upstreams.some((upstream) => upstream.id === model.upstreamId && upstream.enabled) &&
    (!group || model.group === '全部用户组' || model.group === group))
}

function Tabs({ labels, children }: { labels: string[]; children: (index: number) => ReactNode }) {
  const [active, setActive] = useState(0)
  const id = useId()
  return <>
    <div role="tablist" aria-label="服务分类" className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-xl border border-white/10 p-1">
      {labels.map((label, index) => <button
        key={label} id={`${id}-tab-${index}`} role="tab" aria-selected={active === index}
        aria-controls={`${id}-panel`} tabIndex={active === index ? 0 : -1}
        className={`min-h-10 shrink-0 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-current ${active === index ? 'bg-[var(--control)] font-semibold text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
        onClick={() => setActive(index)}
        onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? labels.length - 1 :
            event.key === 'ArrowRight' ? (index + 1) % labels.length :
              event.key === 'ArrowLeft' ? (index + labels.length - 1) % labels.length : null
          if (next === null) return
          event.preventDefault()
          setActive(next)
          event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
        }}
      >{label}</button>)}
    </div>
    <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} tabIndex={0} className="space-y-4 outline-offset-4">
      {children(active)}
    </section>
  </>
}

function EndpointDialog({ title, onClose, onSave }: { title: string; onClose: () => void; onSave: (name: string, url: string) => string | void }) {
  const [error, setError] = useState('')
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }} title={title} description="仅保存内存中的示例配置，不发送网络请求。请勿输入真实凭据。">
    <form className="space-y-4" onSubmit={(event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const name = String(data.get('name') ?? '').trim()
      let url: URL
      try { url = new URL(String(data.get('url') ?? '').trim()) } catch { setError('请输入有效的 HTTPS 地址。'); return }
      if (!name || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        setError('名称不能为空；地址必须使用 HTTPS，且不能包含账号、密码、查询参数或片段。')
        return
      }
      const problem = onSave(name, url.href)
      if (problem) setError(problem)
      else onClose()
    }}>
      <label className="block text-sm">名称<input name="name" required maxLength={60} className={control} /></label>
      <label className="block text-sm">HTTPS 服务地址<input name="url" type="url" required maxLength={300} placeholder="https://service.example" className={control} /></label>
      <p className={muted}>不提供密钥字段，也不会验证连接或保存凭据。</p>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onClose}>取消</Button><Button type="submit">保存示例配置</Button></div>
    </form>
  </Dialog>
}

function GatewayDemo() {
  const { state, setState } = useDemo()
  const [adding, setAdding] = useState(false)
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null)
  const [group, setGroup] = useState(groups[0])
  const [message, setMessage] = useState('')
  return <>
    <p className={`${muted} mb-4`}>ShareServer 不托管模型。此页仅模拟访问策略判断与向上游转发，不运行推理，不发送提示词或真实请求。</p>
    {message && <p role="status" className="mb-4 text-sm">{message}</p>}
    <Tabs labels={['上游服务', '模型映射 / 访问策略', '调用审计']}>{(tab) => <>
      {tab === 0 && <>
        <Button onClick={() => setAdding(true)}>添加上游</Button>
        {state.upstreams.map((upstream) => <article className={panel} key={upstream.id}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{upstream.name}</h2><StatusBadge status={upstream.enabled ? '已启用（模拟）' : '已停用'} tone={upstream.enabled ? 'online' : 'offline'} /></div>
          <p className={`${muted} break-all`}>{upstream.url}</p>
          <Button variant="secondary" onClick={() => setState((current) => ({ ...current, upstreams: current.upstreams.map((item) => item.id === upstream.id ? { ...item, enabled: !item.enabled } : item) }))}>{upstream.enabled ? '停用' : '启用'} {upstream.name}</Button>
        </article>)}
      </>}
      {tab === 1 && <>
        <label className="block max-w-sm text-sm">模拟调用者用户组<select className={control} value={group} onChange={(event) => setGroup(event.target.value)}>{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
        {state.models.map((model) => <article className={panel} key={model.id}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-all font-semibold">{model.alias} → {model.remote}</h2><StatusBadge status={availableModels(state).some((item) => item.id === model.id) ? '映射可用' : '映射不可用'} tone={availableModels(state).some((item) => item.id === model.id) ? 'online' : 'offline'} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">上游服务<select className={control} value={model.upstreamId} onChange={(event) => setState((current) => ({ ...current, models: current.models.map((item) => item.id === model.id ? { ...item, upstreamId: event.target.value } : item) }))}>{state.upstreams.map((item) => <option key={item.id} value={item.id}>{item.name}{item.enabled ? '' : '（已停用）'}</option>)}</select></label>
            <label className="text-sm">允许访问的用户组<select className={control} value={model.group} onChange={(event) => setState((current) => ({ ...current, models: current.models.map((item) => item.id === model.id ? { ...item, group: event.target.value } : item) }))}>{['全部用户组', ...groups].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setState((current) => ({ ...current, models: current.models.map((item) => item.id === model.id ? { ...item, enabled: !item.enabled } : item) }))}>{model.enabled ? '停用映射' : '启用映射'}</Button>
            <Button variant="secondary" onClick={() => {
              const allowed = availableModels(state, group).some((item) => item.id === model.id)
              const audit: Audit = { id: crypto.randomUUID(), time: new Date().toLocaleString('zh-CN'), model: `${model.alias} → ${model.remote}`, upstream: state.upstreams.find((item) => item.id === model.upstreamId)?.name ?? '无上游', group, allowed, result: allowed ? '模拟允许转发，未发送请求' : '模拟拒绝：上游 / 映射停用或用户组不在策略范围' }
              setState((current) => ({ ...current, audits: [audit, ...current.audits].slice(0, 50) }))
              setMessage(`${model.alias}：${audit.result}。已记录调用审计。`)
            }}>模拟调用 {model.alias}</Button>
          </div>
        </article>)}
      </>}
      {tab === 2 && <>
        <p className={muted}>最近 50 条模拟调用；仅记录路由与策略结果，不记录请求或响应正文。</p>
        {!state.audits.length && <p className={panel}>暂无调用。请在模型映射页执行一次模拟调用。</p>}
        {state.audits.map((audit) => <article key={audit.id} className={panel}>
          <h2 className="font-semibold">{audit.model}</h2><p className={muted}>{audit.time} · {audit.group}</p>
          <div className="flex flex-wrap items-center gap-3"><StatusBadge status={audit.allowed ? '模拟允许' : '模拟拒绝'} tone={audit.allowed ? 'online' : 'danger'} /><Button variant="secondary" onClick={() => setSelectedAudit(audit)}>查看审计详情</Button></div>
        </article>)}
      </>}
    </>}</Tabs>
    {adding && <EndpointDialog title="添加上游服务" onClose={() => setAdding(false)} onSave={(name, url) => {
      if (state.upstreams.some((item) => item.name === name || item.url === url)) return '该名称或地址已存在。'
      setState((current) => ({ ...current, upstreams: [...current.upstreams, { id: crypto.randomUUID(), name, url, enabled: true }] }))
      setMessage('已添加示例上游。可在模型映射页将模型关联到此服务。')
    }} />}
    <Dialog open={Boolean(selectedAudit)} onOpenChange={(open) => { if (!open) setSelectedAudit(null) }} title="调用审计详情" description="模拟事实，不代表真实转发或上游可用性。">
      {selectedAudit && <dl className="space-y-3 text-sm">{Object.entries({ 编号: selectedAudit.id, 时间: selectedAudit.time, 模型映射: selectedAudit.model, 上游: selectedAudit.upstream, 调用组: selectedAudit.group, 策略结果: selectedAudit.result }).map(([label, value]) => <div key={label}><dt className={muted}>{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>}
    </Dialog>
  </>
}

function DocumentsDemo({ organization }: { organization: string }) {
  const { state, setState } = useDemo()
  const [adding, setAdding] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const [message, setMessage] = useState('')
  const personal = state.documents.filter((item) => item.owner === 'self' && !item.deleted)
  const canDelete = (document: Document) => document.owner === 'organization' ? state.organizationRole : document.owner === 'self'
  const owner = (document: Document) => document.owner === 'organization' ? `组织：${organization}` : document.owner === 'self' ? '当前演示用户：林江' : '其他成员'
  function setDeleted(document: Document, deleted: boolean) {
    setState((current) => ({ ...current, documents: current.documents.map((item) => item.id === document.id &&
      (item.owner === 'self' || (item.owner === 'organization' && current.organizationRole)) ? { ...item, deleted } : item) }))
    setMessage(`${document.name} 已${deleted ? '移入回收站' : '恢复'}（模拟）。归属保持不变。`)
  }
  return <>
    <div className={`${panel} mb-5`}>
      <p className={muted}>当前演示用户：林江。控制台仅展示归属元数据，不读取个人文档正文。下方角色切换仅用于演示，不是实际授权。</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={state.organizationRole} onChange={(event) => setState((current) => ({ ...current, organizationRole: event.target.checked }))} />模拟授予「组织文档管理员」角色（允许删除 / 恢复组织文档）</label>
      <Button variant="secondary" onClick={() => setTransfer(true)}>打开模拟 GoodBuddy 客户端</Button>
    </div>
    {message && <p role="status" className="mb-4 text-sm">{message}</p>}
    <Tabs labels={['组织文档', '归属元数据', 'OnlyOffice 服务器', '回收站']}>{(tab) => {
      const documents = state.documents.filter((item) => tab === 3 ? item.deleted : !item.deleted && (tab === 1 || item.owner === 'organization'))
      return tab === 2 ? <>
        <Button onClick={() => setAdding(true)}>添加 OnlyOffice 实例</Button>
        <p className={muted}>模拟健康检查只使用下方预设结果，不访问服务器，也不建立编辑会话。</p>
        {state.offices.map((office) => <article className={panel} key={office.id}>
          <h2 className="font-semibold">{office.name}</h2><p className={`${muted} break-all`}>{office.url}</p>
          <StatusBadge status={office.checks ? `模拟${office.healthy ? '健康' : '异常'} · 已检查 ${office.checks} 次` : '尚未模拟检查'} tone={!office.checks ? 'neutral' : office.healthy ? 'online' : 'danger'} />
          <label className="block text-sm">预设检查结果<select className={control} value={office.healthy ? 'healthy' : 'failed'} onChange={(event) => setState((current) => ({ ...current, offices: current.offices.map((item) => item.id === office.id ? { ...item, healthy: event.target.value === 'healthy', checks: 0 } : item) }))}><option value="healthy">模拟健康</option><option value="failed">模拟连接失败</option></select></label>
          <Button variant="secondary" onClick={() => setState((current) => ({ ...current, offices: current.offices.map((item) => item.id === office.id ? { ...item, checks: item.checks + 1 } : item) }))}>执行模拟健康检查</Button>
        </article>)}
      </> : <>
        {tab === 1 && <p className={muted}>个人文档只展示名称与归属，不提供正文预览。个人删除操作仅在模拟客户端提供。</p>}
        {tab === 3 && <p className={muted}>恢复保留原归属与权限；此演示不提供永久删除。</p>}
        {!documents.length && <p className={panel}>此分类暂无文档。</p>}
        {documents.map((document) => <article key={document.id} className={panel}>
          <h2 className="break-words font-semibold">{document.name}</h2><p className={muted}>归属：{owner(document)}</p>
          <StatusBadge status={document.deleted ? '回收站' : document.owner === 'organization' ? '组织资产' : '个人资产 · 仅元数据'} tone={document.deleted ? 'warning' : 'neutral'} />
          <p className={muted}>{document.owner === 'organization' ? '原个人所有者不再具有个人删除权；仅显式组织角色可删除或恢复。' : '仅个人所有者可在客户端转移或删除。'}</p>
          {(document.owner === 'organization' || document.deleted) && <Button variant={document.deleted ? 'secondary' : 'danger'} disabled={!canDelete(document)} onClick={() => setDeleted(document, !document.deleted)}>{document.deleted ? '恢复文档' : '移入回收站'}</Button>}
        </article>)}
      </>
    }}</Tabs>
    {adding && <EndpointDialog title="添加 OnlyOffice 实例" onClose={() => setAdding(false)} onSave={(name, url) => {
      if (state.offices.some((item) => item.name === name || item.url === url)) return '该名称或地址已存在。'
      setState((current) => ({ ...current, offices: [...current.offices, { id: crypto.randomUUID(), name, url, checks: 0, healthy: true }] }))
    }} />}
    <Dialog open={transfer} onOpenChange={setTransfer} title="GoodBuddy 客户端（模拟）" description={`以林江身份操作自己的示例文档；转移目标：${organization}。不会打开真实客户端或上传文件。`}>
      <p className={`${muted} mb-4`}>确认转移后，文档所有者变为组织，并从个人列表移除。原个人删除权立即失效；删除或恢复需要显式组织文档管理员角色。</p>
      {!personal.length && <p className={muted}>没有可转移的个人文档。已转移的文档请到组织文档查看。</p>}
      {personal.map((document) => <article key={document.id} className={panel}>
        <h2 className="font-semibold">{document.name}</h2><p className={muted}>所有者：当前演示用户林江；仅展示元数据。</p>
        <div className="flex flex-wrap gap-2"><Button onClick={() => {
          setState((current) => ({ ...current, documents: current.documents.map((item) => item.id === document.id && item.owner === 'self' && !item.deleted ? { ...item, owner: 'organization' } : item) }))
          setTransfer(false)
          setMessage('已模拟转移到组织。原个人删除权已移除；组织文档操作取决于显式组织角色。')
        }}>确认转移给组织</Button><Button variant="danger" onClick={() => { setDeleted(document, true); setTransfer(false) }}>删除我的文档</Button></div>
      </article>)}
      <div className="mt-4 flex justify-end"><Button variant="ghost" onClick={() => setTransfer(false)}>关闭客户端模拟</Button></div>
    </Dialog>
  </>
}

function DistributionDemo() {
  const { state, setState } = useDemo()
  const [creating, setCreating] = useState(false)
  const [group, setGroup] = useState(groups[0])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const models = availableModels(state, group)
  const draftAllowed = state.draft && availableModels(state, state.draft.group).some((model) => model.id === state.draft?.modelId)
  function releaseToDevices(current: DemoState, release: Release): Device[] {
    return current.devices.map((device) => device.group === release.group && device.online ? { ...device, applied: release } : device)
  }
  return <div className="space-y-5">
    <p className={muted}>仅模拟配置发布，不执行真实设备下发。每个用户组独立保留发布历史；离线设备保持待下发，已应用版本不会被假装更新。</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    <Button disabled={Boolean(state.draft)} onClick={() => { setError(''); setGroup(groups[0]); setCreating(true) }}>创建配置草稿</Button>
    {state.draft && <section className={panel}>
      <h2 className="font-semibold">草稿 {state.draft.version}</h2><p className={muted}>{state.draft.group} · 默认模型：{state.draft.modelName}</p>
      {!draftAllowed && <p role="alert" className="text-sm text-rose-300">默认模型已停用或不允许目标组访问。请调整网关策略，或丢弃草稿后重新选择。</p>}
      <div className="flex flex-wrap gap-2"><Button disabled={!draftAllowed} onClick={() => {
        setState((current) => {
          const draft = current.draft
          if (!draft || !availableModels(current, draft.group).some((item) => item.id === draft.modelId)) return current
          return { ...current, draft: null, releases: { ...current.releases, [draft.group]: [...(current.releases[draft.group] ?? []), draft] }, devices: releaseToDevices(current, draft) }
        })
        setMessage('已模拟发布：目标组在线设备更新，离线设备保持待下发。')
      }}>模拟发布</Button><Button variant="ghost" onClick={() => setState((current) => ({ ...current, draft: null }))}>丢弃草稿</Button></div>
    </section>}
    {groups.map((target) => {
      const history = state.releases[target] ?? []
      const active = history.at(-1)
      const previous = history.at(-2)
      const rollbackAllowed = previous && availableModels(state, target).some((item) => item.id === previous.modelId)
      return <section key={target} className={panel}>
        <h2 className="font-semibold">{target}</h2>
        <p className={muted}>当前发布：{active ? `${active.version} · 默认模型 ${active.modelName}` : '尚未发布'}</p>
        <p className={muted}>可回退版本：{previous ? `${previous.version} · 默认模型 ${previous.modelName}` : '无历史版本'}</p>
        {previous && !rollbackAllowed && <p className="text-sm text-rose-300">历史版本模型不可用或策略不允许，暂不能回退。</p>}
        <Button variant="secondary" disabled={!rollbackAllowed} onClick={() => {
          setState((current) => {
            const versions = current.releases[target] ?? []
            const prior = versions.at(-2)
            if (!prior || !availableModels(current, target).some((item) => item.id === prior.modelId)) return current
            return { ...current, releases: { ...current.releases, [target]: versions.slice(0, -1) }, devices: releaseToDevices(current, prior) }
          })
          setMessage(`${target} 已模拟回退到 ${previous?.version}，同时恢复该版本默认模型；离线设备等待该版本。`)
        }}>模拟回退{previous ? `到 ${previous.version}` : ''}</Button>
        <ul className="space-y-3">{state.devices.filter((device) => device.group === target).map((device) => <li key={device.id} className="flex flex-col justify-between gap-2 border-t border-white/10 pt-3 sm:flex-row sm:items-center">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{device.name} · {device.online ? '在线' : '离线'}</p><p className={muted}>已应用：{device.applied ? `${device.applied.version} / ${device.applied.modelName}` : '无'} · 目标：{active?.version ?? '无'}</p></div>
          <StatusBadge status={!active ? '尚未下发' : device.online ? '模拟已应用' : '离线 · 待下发（模拟）'} tone={!active ? 'neutral' : device.online ? 'online' : 'warning'} />
        </li>)}</ul>
      </section>
    })}
    <Dialog open={creating} onOpenChange={setCreating} title="创建配置草稿" description="默认模型来自当前启用的网关模型，并受目标组访问策略约束。">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const version = String(data.get('version') ?? '').trim()
        const model = models.find((item) => item.id === data.get('model'))
        if (!/^\d+\.\d+\.\d+$/.test(version)) { setError('版本格式应为三个数字段，例如 1.0.0。'); return }
        if (!model) { setError('请选择目标组可访问的启用模型。'); return }
        if (state.releases[group]?.some((item) => item.version === version)) { setError('该用户组的发布历史中已存在此版本。'); return }
        setState((current) => ({ ...current, draft: { version, group, modelId: model.id, modelName: model.alias } }))
        setCreating(false)
        setMessage('草稿已保存到内存，尚未模拟发布。')
      }}>
        <label className="block text-sm">目标用户组<select value={group} className={control} onChange={(event) => setGroup(event.target.value)}>{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="block text-sm">默认模型<select key={group} name="model" required className={control} defaultValue={models[0]?.id ?? ''} disabled={!models.length}>{!models.length && <option value="">无可用模型</option>}{models.map((model) => <option key={model.id} value={model.id}>{model.alias}</option>)}</select></label>
        {!models.length && <p className={muted}>请先在模型网关启用上游与模型，并允许目标组访问。</p>}
        <label className="block text-sm">版本<input name="version" required maxLength={30} placeholder="1.0.0" className={control} /></label>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>取消</Button><Button type="submit" disabled={!models.length}>保存草稿</Button></div>
      </form>
    </Dialog>
  </div>
}

export function ServiceDemoPage({ page, snapshot }: { page: PageConfig; snapshot: PrototypeSnapshot }) {
  useDemo()
  return <div className="min-w-0 text-[var(--text-primary)]">
    <PageHeader eyebrow={`组织 · ${snapshot.instance.organization}`} title={page.title} description={page.description} />
    <aside className={`${panel} mb-5 text-sm leading-6`} aria-label="原型说明">
      交互原型：所有操作均为模拟，仅保存在当前页面会话内存中。三个服务页面间导航保留状态，刷新页面后重置。不调用网络，不写入本地存储，不代表真实授权、健康检查或设备下发。
    </aside>
    {page.path === '/model-gateway' ? <GatewayDemo /> : page.path === '/documents' ? <DocumentsDemo organization={snapshot.instance.organization} /> : page.path === '/distribution' ? <DistributionDemo /> : <p role="alert">此页面不属于服务演示。</p>}
  </div>
}
