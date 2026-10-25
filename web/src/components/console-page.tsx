import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { consoleModules, statusLabels, statusTransitions, type ConsoleModule, type ConsoleRecord, type ConsoleSnapshot, type RecordStatus } from '../../../shared/console'
import { PageHeader } from './page-header'
import { PageTabs } from './page-tabs'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { adminFetch } from '../lib/admin-fetch'

const panel = 'rounded-2xl border border-[var(--border-default)] bg-[var(--panel)] p-5'
const control = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--control)] p-3 text-sm'

async function request<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await adminFetch(`/api/v1/console${path}`, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? `请求失败 (${response.status})`)
  return body as T
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ConsolePage({ module }: { module: ConsoleModule | 'audit' }) {
  const config = module === 'audit' ? null : consoleModules[module]
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState('records')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<ConsoleRecord | 'new' | null>(null)
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [decision, setDecision] = useState<{ record: ConsoleRecord; status: RecordStatus } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    request<ConsoleSnapshot>('', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setSnapshot(data); setError('') }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '加载失败') })
    return () => controller.abort()
  }, [reload])

  const records = (snapshot?.records ?? []).filter(r => r.module === module)
  const visible = records.filter(r => (filter === 'all' || r.status === filter) && `${r.name} ${r.detail}`.toLowerCase().includes(query.toLowerCase()))
  const audits = (snapshot?.audits ?? []).filter(a => (module === 'audit' || a.module === module) && `${a.recordId} ${a.action} ${consoleModules[a.module].title}`.toLowerCase().includes(query.toLowerCase()))

  async function save(record?: ConsoleRecord, status?: RecordStatus) {
    setBusy(true); setFormError(''); setError(''); setNotice('')
    try {
      await request(`/${module}${record ? `/${record.id}` : ''}`, {
        method: record ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: status ? record!.name : name, detail: status ? record!.detail : detail, ...(record ? { revision: record.revision } : {}), ...(status ? { status } : {}) })
      })
      setEditing(null); setDecision(null); setNotice('已保存到服务器。'); setReload(v => v + 1)
    } catch (e) { setFormError(e instanceof Error ? e.message : '保存失败') }
    finally { setBusy(false) }
  }
  function edit(record: ConsoleRecord | 'new') {
    setEditing(record); setName(record === 'new' ? '' : record.name); setDetail(record === 'new' ? '' : record.detail); setFormError('')
  }
  const auditView = module === 'audit' || tab === 'history'
  return <>
    <PageHeader eyebrow="当前实例 · 管理登记" title={config?.title ?? '操作审计'} description={config?.boundary ?? '查询管理登记的真实变更记录，保留最近 1000 条元数据，不保存详细说明正文。'} action={config && <Button onClick={() => edit('new')}>创建{config.noun}</Button>} />
    {config && <PageTabs title={config.title} active={tab} onChange={value => { setTab(value); setQuery('') }} tabs={[{ key: 'records', label: config.noun }, { key: 'history', label: '变更记录' }]} />}
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <label className="min-w-48 flex-1"><span className="sr-only">搜索记录</span><input className={control} value={query} onChange={e => setQuery(e.target.value)} placeholder={auditView ? '搜索模块、记录 ID 或操作' : '搜索名称或详细说明'} /></label>
      {!auditView && <label><span className="sr-only">记录状态</span><select className={control} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <Button variant="secondary" disabled={busy} onClick={() => setReload(v => v + 1)}>刷新</Button>
      <Button variant="secondary" disabled={!snapshot || Boolean(error)} onClick={() => download({ schemaVersion: 1, scope: 'instance-management-register', exportedAt: new Date().toISOString(), records: auditView ? audits : visible }, `shareserver-${module}.json`)}>导出当前结果</Button>
    </div>
    {error && <p role="alert" className="mb-4">{error} 请点击刷新重试。</p>}
    {notice && <p role="status" className="mb-4">{notice}</p>}
    {!snapshot && !error && <p role="status">正在加载服务器记录…</p>}
    {snapshot && <section className={panel}>
      <div className="mb-4 flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{auditView ? '操作记录' : config?.noun}</h2><span className="text-sm text-[var(--text-muted)]">{auditView ? audits.length : visible.length} 条</span></div>
      {auditView ? <div className="space-y-3">{audits.length === 0 && <p>暂无匹配的操作记录。创建或修改登记后，变更将显示在这里。</p>}{audits.map(a => <article key={a.id} className="border-t border-[var(--border-default)] pt-3 text-sm"><p>{consoleModules[a.module].title} · {a.action.split(' → ').map(s => statusLabels[s as RecordStatus] ?? s).join(' → ')}</p><p className="mt-1 break-all text-[var(--text-muted)]">{new Date(a.at).toLocaleString()} · {a.recordId} · v{a.revision} · 本地管理操作</p></article>)}</div>
        : <div className="space-y-4">{visible.length === 0 && <p className="text-sm text-[var(--text-muted)]">{records.length ? '没有匹配结果，请调整搜索或状态筛选。' : `尚无${config?.noun}。点击“创建${config?.noun}”开始，保存后可跨刷新和服务重启保留。`}</p>}{visible.map(r => <article key={r.id} className="rounded-xl border border-[var(--border-default)] p-4">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{r.name}</h3><span className="text-sm">{statusLabels[r.status]}</span></div>
          <p className="my-3 whitespace-pre-wrap break-words text-sm text-[var(--text-muted)]">{r.detail || '未填写详细说明'}</p>
          <p className="mb-3 text-xs text-[var(--text-muted)]">更新于 {new Date(r.updatedAt).toLocaleString()} · v{r.revision}</p>
          <div className="flex flex-wrap gap-2">
            {r.status === 'draft' && <Button size="sm" variant="secondary" onClick={() => edit(r)}>编辑</Button>}
            {statusTransitions[r.status].map(status => <Button key={status} size="sm" variant="secondary" onClick={() => { setFormError(''); setDecision({ record: r, status }) }}>{({ pending: '提交审核', approved: '记录通过', rejected: '驳回', archived: '归档', draft: '恢复草稿' })[status]}</Button>)}
          </div>
        </article>)}</div>}
    </section>}
    {(module === 'distribution' || module === 'audit' || module === 'tasks') && <p className="mt-5 text-sm"><Link className="underline" to="/model-gateway">前往模型网关</Link>，查看实际模型配置、请求测试与调用审计。</p>}
    {editing && config && <Dialog open onOpenChange={open => { if (!open && !busy) setEditing(null) }} title={`${editing === 'new' ? '创建' : '编辑'}${config.noun}`} description={config.boundary}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(editing === 'new' ? undefined : editing) }}>
        <label className="block space-y-2"><span>名称</span><input autoFocus required maxLength={200} className={control} value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="block space-y-2"><span>{config.detail}</span><textarea rows={8} maxLength={12000} className={control} value={detail} onChange={e => setDetail(e.target.value)} /></label>
        <p className="text-xs text-[var(--text-muted)]">仅填写管理资料，请勿填写密码、API Key 或任务正文。</p>
        {formError && <p role="alert">{formError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>取消</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? '正在保存…' : '保存草稿'}</Button></div>
      </form>
    </Dialog>}
    {decision && <Dialog open onOpenChange={open => { if (!open && !busy) setDecision(null) }} title={`确认：${statusLabels[decision.status]}`} description={`“${decision.record.name}”将更新为${statusLabels[decision.status]}。此操作只更新登记记录，不触发设备执行、下发或权限变更。`}>
      {formError && <p role="alert" className="mb-4">{formError}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setDecision(null)}>取消</Button><Button disabled={busy} onClick={() => void save(decision.record, decision.status)}>{busy ? '正在保存…' : '确认并保存'}</Button></div>
    </Dialog>}
  </>
}
