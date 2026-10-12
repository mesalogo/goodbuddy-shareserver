import { createContext, useContext, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { PrototypeSnapshot } from '../../../shared/prototype-data'
import type { PageConfig } from '../app-config'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { StatusBadge } from './ui/status-badge'

type Document = { id: string; name: string; owner: 'self' | 'other' | 'organization'; deleted: boolean }
type Office = { id: string; name: string; url: string; checks: number; healthy: boolean }
type DemoState = {
  documents: Document[]
  offices: Office[]
  organizationRole: boolean
}

const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-current'
const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const DemoContext = createContext<{ state: DemoState; setState: Dispatch<SetStateAction<DemoState>> } | null>(null)

function initialState(): DemoState {
  return {
    documents: [
      { id: 'doc-org', name: '组织入门指南.docx', owner: 'organization', deleted: false },
      { id: 'doc-self', name: '我的项目提案.docx', owner: 'self', deleted: false },
      { id: 'doc-other', name: '其他成员文档（仅归属元数据）', owner: 'other', deleted: false }
    ],
    offices: [{ id: 'office-demo', name: '示例 OnlyOffice', url: 'https://office.example', checks: 0, healthy: true }],
    organizationRole: false
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

export function ServiceDemoPage({ page, snapshot }: { page: PageConfig; snapshot: PrototypeSnapshot }) {
  useDemo()
  return <div className="min-w-0 text-[var(--text-primary)]">
    <PageHeader eyebrow={`组织 · ${snapshot.instance.organization}`} title={page.title} description={page.description} />
    <aside className={`${panel} mb-5 text-sm leading-6`} aria-label="原型说明">
      文档交互原型：此页所有操作均为模拟，仅保存在当前页面会话内存中。导航后保留文档状态，刷新页面后重置。不调用网络，不写入本地存储，不代表真实授权或健康检查。与真实模型网关独立。
    </aside>
    {page.path === '/documents' ? <DocumentsDemo organization={snapshot.instance.organization} /> : <p role="alert">此页面不属于文档演示。</p>}
  </div>
}
