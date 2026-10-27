import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, FileText, History, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react'
import { statusLabels, statusTransitions, type ConsoleModule, type ConsoleRecord, type ConsoleSnapshot, type RecordStatus } from '../../../shared/console'
import { PageHeader } from './page-header'
import { PageTabs } from './page-tabs'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { Sheet } from './ui/sheet'
import { adminFetch } from '../lib/admin-fetch'
import { useI18n } from '../lib/i18n'
import { ConsoleRequestError, localizedAuditAction, localizedError, localizedModule, localizedStatus, localizedTransition } from '../lib/console-i18n'
import { controlFields, taskTransitions, type TaskProgress } from '../../../shared/control-fields'
import { ReleaseAssets } from './release-assets'

const panel = 'overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--panel)]'
const control = 'w-full rounded-lg border border-[var(--border-control)] bg-[var(--control)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]'
const recordGrid = 'grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_minmax(12rem,auto)] md:items-center'
const statusStyle: Record<RecordStatus, string> = {
  draft: 'bg-[var(--control)] text-[var(--text-muted)]',
  pending: 'bg-[var(--warning-subtle)] text-[var(--warning)]',
  approved: 'bg-[var(--success-subtle)] text-[var(--success)]',
  rejected: 'bg-[var(--danger-subtle)] text-[var(--danger)]',
  archived: 'bg-[var(--control)] text-[var(--text-muted)]'
}
function StatusBadge({ status }: { status: RecordStatus }) {
  useI18n()
  return <span className={`inline-flex w-fit items-center rounded-md px-2 py-1 text-xs font-medium ${statusStyle[status]}`}>{localizedStatus(status)}</span>
}

async function request<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await adminFetch(`/api/v1/console${path}`, init)
  const body = await response.json()
  if (!response.ok) throw new ConsoleRequestError(body.message ?? `请求失败 (${response.status})`, body.code ?? response.status ?? 'unknown')
  return body as T
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ConsolePage({ module }: { module: ConsoleModule | 'audit' }) {
  const { t, formatDate } = useI18n()
  const config = module === 'audit' ? null : localizedModule(module)
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null)
  const [error, setError] = useState<Error | string>('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [tab, setTab] = useState('records')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState<ConsoleRecord | 'new' | null>(null)
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [task, setTask] = useState<{ record: ConsoleRecord; progress: TaskProgress } | null>(null)
  const [result, setResult] = useState('')
  const [simulation, setSimulation] = useState({ subject: '', resource: '', action: '' })
  const [evaluation, setEvaluation] = useState<{ decision: string; matchedIds: string[] } | null>(null)
  const progressLabels: Record<TaskProgress, string> = { queued: t('待开始', 'Queued'), in_progress: t('进行中', 'In progress'), completed: t('已完成', 'Completed'), cancelled: t('已取消', 'Cancelled') }
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<Error | string>('')
  const [decision, setDecision] = useState<{ record: ConsoleRecord; status: RecordStatus } | null>(null)
  const [selected, setSelected] = useState<ConsoleRecord | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    request<ConsoleSnapshot>('', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setSnapshot(data); setError('') }
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e : '加载失败') })
    return () => controller.abort()
  }, [reload])

  const records = (snapshot?.records ?? []).filter(r => r.module === module)
   const visible = records.filter(r => (filter === 'all' || r.status === filter) && `${r.name} ${r.detail} ${Object.values(r.fields ?? {}).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const audits = (snapshot?.audits ?? []).filter(a => (module === 'audit' || a.module === module) && `${a.recordId} ${localizedAuditAction(a.action)} ${localizedModule(a.module).title}`.toLowerCase().includes(query.toLowerCase()))

  async function save(record?: ConsoleRecord, status?: RecordStatus) {
    setBusy(true); setFormError(''); setError(''); setNotice('')
    try {
      await request(`/${module}${record ? `/${record.id}` : ''}`, {
        method: record ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name: status ? record!.name : name, detail: status ? record!.detail : detail, fields: status ? record!.fields : fields, ...(record ? { revision: record.revision } : {}), ...(status ? { status } : {}) })
      })
      setEditing(null); setDecision(null); setNotice('已保存到服务器。'); setReload(v => v + 1)
    } catch (e) { setFormError(e instanceof Error ? e : '保存失败') }
    finally { setBusy(false) }
  }
  function edit(record: ConsoleRecord | 'new') {
     setEditing(record); setName(record === 'new' ? '' : record.name); setDetail(record === 'new' ? '' : record.detail); setFields(record === 'new' ? {} : record.fields ?? {}); setFormError('')
  }
  async function taskProgress() {
    if (!task) return
    setBusy(true); setFormError('')
    try { await request(`/tasks/${task.record.id}/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: task.record.revision, progress: task.progress, result }) }); setTask(null); setReload(v => v + 1) }
    catch (e) { setFormError(e instanceof Error ? e : '保存失败') } finally { setBusy(false) }
  }
  async function exportConfig(record: ConsoleRecord) {
    setBusy(true); setError('')
    try { download(await request(`/distribution/${record.id}/config`), `configuration-${record.id}.json`) } catch (e) { setError(e instanceof Error ? e : '加载失败') } finally { setBusy(false) }
  }
  const auditView = module === 'audit' || tab === 'history'
  return <>
    <PageHeader eyebrow={t('当前实例 · 管理登记', 'Current instance · Management register')} title={config?.title ?? t('操作审计', 'Operation audit')} description={config?.boundary ?? t('查询管理登记的真实变更记录，保留最近 1000 条元数据，不保存详细说明正文。', 'View actual changes to management records. The latest 1,000 metadata entries are retained; detailed descriptions are not stored in the audit.')} action={config && <Button onClick={() => edit('new')}><Plus aria-hidden="true" className="size-4" />{t('创建{noun}', 'Create {noun}', { noun: config.noun })}</Button>} />
    {config && <PageTabs title={config.title} active={tab} onChange={value => { setTab(value); setQuery('') }} tabs={[{ key: 'records', label: config.noun }, { key: 'history', label: t('变更记录', 'Change history') }]} />}
    {module === 'policies' && <form className={`${panel} mb-5 space-y-3 p-4`} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(''); setEvaluation(null)
      try { setEvaluation(await request('/policies/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(simulation) })) } catch (error) { setError(error instanceof Error ? error : '加载失败') } finally { setBusy(false) }
    }}><h2 className="font-medium">{t('策略测试', 'Policy simulator')}</h2><p className="text-sm text-[var(--text-muted)]">{t('测试已审核策略的匹配结果；拒绝优先，未匹配默认拒绝。测试不改变运行中的访问权限。', 'Test approved policy matches. Deny takes precedence; unmatched requests are denied. Simulation does not change runtime permissions.')}</p><div className="grid gap-3 sm:grid-cols-3">{(['subject', 'resource', 'action'] as const).map((key, i) => <label key={key}>{[t('主体', 'Subject'), t('资源', 'Resource'), t('动作', 'Action')][i]}<input required maxLength={200} className={control} value={simulation[key]} onChange={e => { setEvaluation(null); setSimulation({ ...simulation, [key]: e.target.value }) }} /></label>)}</div><Button type="submit" disabled={busy}>{t('测试匹配', 'Evaluate')}</Button>{evaluation && <p role="status" className="break-all">{evaluation.decision === 'allow' ? t('允许', 'Allow') : t('拒绝', 'Deny')} · {t('匹配策略', 'Matched policies')}: {evaluation.matchedIds.join(', ') || t('无', 'None')}</p>}</form>}
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <label className="relative min-w-48 flex-1"><span className="sr-only">{t('搜索记录', 'Search records')}</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--text-muted)]" /><input className={`${control} pl-9`} value={query} onChange={e => setQuery(e.target.value)} placeholder={auditView ? t('搜索模块、记录 ID 或操作', 'Search modules, record IDs or actions') : t('搜索名称或详细说明', 'Search names or details')} /></label>
      {!auditView && <label className="relative"><span className="sr-only">{t('记录状态', 'Record status')}</span><SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 size-4 text-[var(--text-muted)]" /><select className={`${control} pl-9`} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t('全部状态', 'All statuses')}</option>{Object.keys(statusLabels).map(value => <option key={value} value={value}>{localizedStatus(value as RecordStatus)}</option>)}</select></label>}
      <Button variant="secondary" disabled={busy} onClick={() => setReload(v => v + 1)}><RefreshCw aria-hidden="true" className="size-4" />{t('刷新', 'Refresh')}</Button>
      <Button variant="secondary" disabled={!snapshot || Boolean(error)} onClick={() => download({ schemaVersion: 1, scope: 'instance-management-register', exportedAt: new Date().toISOString(), records: auditView ? audits : visible }, `shareserver-${module}.json`)}><Download aria-hidden="true" className="size-4" />{t('导出当前结果', 'Export current results')}</Button>
    </div>
    {error && <p role="alert" className="mb-4">{localizedError(error)} {t('请点击刷新重试。', 'Click Refresh to try again.')}</p>}
    {notice && <p role="status" className="mb-4">{t('已保存到服务器。', 'Saved to the server.')}</p>}
    {!snapshot && !error && <p role="status">{t('正在加载服务器记录…', 'Loading server records…')}</p>}
    {snapshot && <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-default)] px-4 py-3"><h2 className="text-sm font-semibold">{auditView ? t('操作记录', 'Operation records') : config?.noun}</h2><span role="status" className="text-xs text-[var(--text-muted)]">{auditView ? t('{count} 条操作记录', '{count} operation records', { count: audits.length }) : t('{visible} / {total} 条记录', '{visible} / {total} records', { visible: visible.length, total: records.length })}</span></div>
      {(auditView ? audits.length === 0 : visible.length === 0) && <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        {auditView ? <History aria-hidden="true" className="size-8 text-[var(--text-muted)]" /> : <FileText aria-hidden="true" className="size-8 text-[var(--text-muted)]" />}
        <h3 className="font-medium">{query || (!auditView && filter !== 'all') ? t('没有匹配结果', 'No matching results') : auditView ? t('暂无操作记录', 'No operations yet') : t('尚无{noun}', 'No {noun} yet', { noun: config?.noun ?? '' })}</h3>
        <p className="text-sm text-[var(--text-muted)]">{query || (!auditView && filter !== 'all') ? t('请调整搜索关键词或状态筛选。', 'Adjust your search or status filter.') : auditView ? t('创建或修改登记后，变更将显示在这里。', 'Changes will appear here after you create or update a registration.') : t('点击“创建{noun}”开始，保存后可跨刷新和服务重启保留。', 'Click “Create {noun}” to start. Saved records persist across refreshes and server restarts.', { noun: config?.noun ?? '' })}</p>
        {(query || (!auditView && filter !== 'all')) && <Button variant="secondary" onClick={() => { setQuery(''); setFilter('all') }}>{t('清除筛选', 'Clear filters')}</Button>}
      </div>}
      {auditView ? <ol className="divide-y divide-[var(--border-default)]">{audits.map(a => <li key={a.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
        <time dateTime={a.at} title={formatDate(a.at)} className="text-xs text-[var(--text-muted)]">{formatDate(a.at)}</time>
        <div className="min-w-0"><p className="font-medium">{localizedModule(a.module).title}</p><p className="mt-1 break-words text-[var(--text-muted)]">{localizedAuditAction(a.action)}</p></div>
        <div className="min-w-0 text-xs text-[var(--text-muted)]"><p className="break-all">{a.recordId} · v{a.revision}</p><p className="mt-1">{t('当前实例 · 本地管理操作', 'Current instance · Local management action')}</p></div>
      </li>)}</ol>
        : <div>
          {visible.length > 0 && <div aria-hidden="true" className={`${recordGrid} hidden border-b border-[var(--border-default)] bg-[var(--control)] px-4 py-2 text-xs text-[var(--text-muted)] md:grid`}><span>{t('名称 / 说明', 'Name / Details')}</span><span>{t('状态', 'Status')}</span><span>{t('更新时间', 'Updated')}</span><span className="text-right">{t('操作', 'Actions')}</span></div>}
          <ul className="divide-y divide-[var(--border-default)]">{visible.map(r => <li key={r.id}>
          <article aria-label={r.name} className={`${recordGrid} px-4 py-4 text-sm hover:bg-[var(--control)] md:py-3`}>
          <div className="min-w-0"><h3 className="truncate font-medium text-[var(--text-strong)]" title={r.name}>{r.name}</h3><p className="mt-1 truncate text-xs text-[var(--text-muted)]">{r.detail || t('未填写详细说明', 'No details provided')}</p></div>
           <div className="space-y-1"><StatusBadge status={r.status} />{r.progress && <p className="text-xs">{progressLabels[r.progress]}</p>}</div>
          <p className="text-xs text-[var(--text-muted)]"><span className="md:sr-only">{t('更新于 ', 'Updated at ')}</span><time dateTime={r.updatedAt} title={formatDate(r.updatedAt)}>{formatDate(r.updatedAt)}</time><span className="ml-2">v{r.revision}</span></p>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>{t('详情', 'Details')}<span className="sr-only">{t('：{name}', ': {name}', { name: r.name })}</span></Button>
            {r.status === 'draft' && <Button size="sm" variant="secondary" onClick={() => edit(r)}>{t('编辑', 'Edit')}</Button>}
            {module === 'distribution' && r.status === 'approved' && r.fields && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void exportConfig(r)}>{t('下载客户端配置', 'Download client config')}</Button>}
            {module === 'tasks' && r.status === 'approved' && taskTransitions[r.progress ?? 'queued'].map(progress => <Button key={progress} size="sm" variant="secondary" onClick={() => { setTask({ record: r, progress }); setResult(''); setFormError('') }}>{progressLabels[progress]}</Button>)}
            {statusTransitions[r.status].map(status => <Button key={status} size="sm" variant="secondary" onClick={() => { setFormError(''); setDecision({ record: r, status }) }}>{localizedTransition(status)}</Button>)}
          </div>
        </article></li>)}</ul></div>}
    </section>}
    {(module === 'distribution' || module === 'audit' || module === 'tasks') && <p className="mt-5 text-sm"><Link className="underline" to="/model-gateway">{t('前往模型网关', 'Go to model gateway')}</Link>{t('，查看实际模型配置、请求测试与调用审计。', ' to view model configuration, request tests and invocation audits.')}</p>}
    {selected && <Sheet title={selected.name} description={t('当前实例 · {noun}', 'Current instance · {noun}', { noun: localizedModule(selected.module).noun })} onClose={() => setSelected(null)}>
      <StatusBadge status={selected.status} />
      <dl className="my-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <dt className="text-[var(--text-muted)]">{t('记录 ID', 'Record ID')}</dt><dd className="break-all">{selected.id}</dd>
        <dt className="text-[var(--text-muted)]">{t('版本', 'Revision')}</dt><dd>v{selected.revision}</dd>
        <dt className="text-[var(--text-muted)]">{t('创建时间', 'Created')}</dt><dd>{formatDate(selected.createdAt)}</dd>
        <dt className="text-[var(--text-muted)]">{t('更新时间', 'Updated')}</dt><dd>{formatDate(selected.updatedAt)}</dd>
      </dl>
      <dl className="space-y-3 text-sm">{controlFields[selected.module].map(field => selected.fields?.[field.key] && <div key={field.key}><dt className="text-[var(--text-muted)]">{t(...field.label)}</dt><dd className="whitespace-pre-wrap break-words">{field.options ? (() => { const option = field.options.find(o => o[0] === selected.fields?.[field.key]); return option ? t(option[1], option[2]) : selected.fields?.[field.key] })() : selected.fields?.[field.key]}</dd></div>)}</dl>
      {selected.module === 'releases' && selected.fields?.url && /^https?:\/\//.test(selected.fields.url) && <a className="my-4 block underline" href={selected.fields.url} target="_blank" rel="noreferrer">{t('下载资源', 'Download resource')}</a>}
      {selected.progress && <p className="my-4 whitespace-pre-wrap break-words">{progressLabels[selected.progress]} · {selected.result}</p>}
      <h3 className="border-t border-[var(--border-default)] pt-6 text-sm font-medium">{localizedModule(selected.module).detail}</h3>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{selected.detail || t('未填写详细说明', 'No details provided')}</p>
    </Sheet>}
    {editing && config && <Dialog open onOpenChange={open => { if (!open && !busy) setEditing(null) }} title={editing === 'new' ? t('创建{noun}', 'Create {noun}', { noun: config.noun }) : t('编辑{noun}', 'Edit {noun}', { noun: config.noun })} description={config.boundary}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void save(editing === 'new' ? undefined : editing) }}>
        <label className="block space-y-2"><span>{t('名称', 'Name')}</span><input autoFocus required maxLength={200} className={control} value={name} ref={input => { if (input?.validity.customError) input.setCustomValidity(t('请输入名称。', 'Enter a name.')) }} onInvalid={e => e.currentTarget.setCustomValidity(t('请输入名称。', 'Enter a name.'))} onChange={e => { e.target.setCustomValidity(''); setName(e.target.value) }} /></label>
        {module !== 'audit' && controlFields[module].map(field => <label key={field.key} className="block space-y-2"><span>{t(...field.label)}{field.required && ' *'}</span>{field.options ? <select className={control} value={fields[field.key] ?? ''} onChange={e => setFields({ ...fields, [field.key]: e.target.value })}><option value="">{t('请选择', 'Select')}</option>{field.options.map(o => <option key={o[0]} value={o[0]}>{t(o[1], o[2])}</option>)}</select> : field.type === 'textarea' ? <textarea className={control} rows={3} maxLength={4000} value={fields[field.key] ?? ''} onChange={e => setFields({ ...fields, [field.key]: e.target.value })} /> : <input type={field.type ?? 'text'} maxLength={4000} className={control} value={fields[field.key] ?? ''} onChange={e => setFields({ ...fields, [field.key]: e.target.value })} />}</label>)}
        {module === 'releases' && <ReleaseAssets onAttach={asset => setFields(current => ({ ...current, url: new URL(asset.url, window.location.origin).href, sha256: asset.sha256 }))} />}
        <label className="block space-y-2"><span>{config.detail}</span><textarea rows={8} maxLength={12000} className={control} value={detail} onChange={e => setDetail(e.target.value)} /></label>
        <p className="text-xs text-[var(--text-muted)]">{t('仅填写管理资料，请勿填写密码、API Key 或任务正文。', 'Enter management information only. Do not enter passwords, API keys or task content.')}</p>
        {formError && <p role="alert">{localizedError(formError)}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>{t('取消', 'Cancel')}</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? t('正在保存…', 'Saving…') : t('保存草稿', 'Save draft')}</Button></div>
      </form>
    </Dialog>}
    {task && <Dialog open onOpenChange={open => { if (!open && !busy) setTask(null) }} title={progressLabels[task.progress]} description={t('更新人工任务进度。完成时填写验收结果，取消时填写原因。', 'Update manual task progress. Provide an acceptance result to complete a task or a reason to cancel it.')}><form className="space-y-4" onSubmit={e => { e.preventDefault(); void taskProgress() }}><label className="block">{t('结果或说明', 'Result or notes')}<textarea className={control} required={task.progress !== 'in_progress'} maxLength={12000} value={result} onChange={e => setResult(e.target.value)} /></label>{formError && <p role="alert">{localizedError(formError)}</p>}<Button type="submit" disabled={busy}>{t('保存进度', 'Save progress')}</Button></form></Dialog>}
    {decision && <Dialog open onOpenChange={open => { if (!open && !busy) setDecision(null) }} title={t('确认：{status}', 'Confirm: {status}', { status: localizedStatus(decision.status) })} description={t('“{name}”将更新为{status}。此操作只更新登记记录，不触发设备执行、下发或权限变更。', '“{name}” will be updated to {status}. This only updates the registration; it does not trigger device execution, distribution or permission changes.', { name: decision.record.name, status: localizedStatus(decision.status) })}>
      {formError && <p role="alert" className="mb-4">{localizedError(formError)}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setDecision(null)}>{t('取消', 'Cancel')}</Button><Button disabled={busy} onClick={() => void save(decision.record, decision.status)}>{busy ? t('正在保存…', 'Saving…') : t('确认并保存', 'Confirm and save')}</Button></div>
    </Dialog>}
  </>
}
