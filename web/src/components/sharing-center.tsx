import { Link, useSearchParams } from 'react-router-dom'
import type { PrototypeSnapshot } from '../../../shared/prototype-data'
import { sharedItems, sharingAvailability, type SharedItem } from '../lib/sharing-fixtures'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { StatusBadge } from './ui/status-badge'
import { LocalSharing } from './local-sharing'

const tabs = [ ['local', '本地服务目录'], ['catalog', '能力目录'], ['knowledge', '共享知识库'], ['users', '按用户查看'], ['devices', '按设备查看'] ] as const
const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm focus-visible:outline-2'
const link = 'rounded text-sm underline underline-offset-4 focus-visible:outline-2'
const sourceLabels = { synced: '服务器同步副本', remote: '远程设备取用' }

export function SharingCenter({ snapshot }: { snapshot: PrototypeSnapshot }) {
  const [params, setParams] = useSearchParams()
  const view = tabs.some(([key]) => key === params.get('view')) ? params.get('view')! : 'catalog'
  const query = params.get('q') ?? ''
  const status = params.get('status') ?? ''
  const source = params.get('source') ?? ''
  const audience = params.get('audience') ?? ''
  const scopeKey = view === 'users' ? 'user' : 'device'
  const scope = params.get(scopeKey) ?? ''
  const entities = snapshot.pages[view === 'users' ? 'members' : 'devices'] ?? []
  const device = (item: SharedItem) => snapshot.pages.devices.find((entry) => entry.id === item.device)
  const publisher = (item: SharedItem) => snapshot.pages.members.find((entry) => entry.id === item.publisher)
  const availability = (item: SharedItem) => sharingAvailability(item, device(item)?.status ?? '未知')
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('item')
    setParams(next, { replace: true })
  }
  const itemHref = (item: SharedItem) => {
    const next = new URLSearchParams(params)
    next.set('item', item.id)
    return `/capabilities?${next}`
  }
  const visible = sharedItems.filter((item) => {
    if (view === 'catalog' && item.kind !== 'capability') return false
    if (view === 'knowledge' && item.kind !== 'knowledge') return false
    if (view === 'users' && scope && item.publisher !== scope) return false
    if (view === 'devices' && scope && item.device !== scope) return false
    return (!query.trim() || [item.name, item.version, publisher(item)?.primary, device(item)?.primary, item.audience].join(' ').toLowerCase().includes(query.trim().toLowerCase())) &&
      (!status || (status === 'ready' ? availability(item).available : !availability(item).available)) &&
      (!source || item.source === source) && (!audience || item.audience === audience)
  })
  const selected = sharedItems.find((item) => item.id === params.get('item'))
  const grouped = view === 'users' || view === 'devices'
  const permissionSummary = (item: SharedItem) => <div className="space-y-2">
    <p className={muted}>当前示例访问者的显式权限（独立判断）</p>
    <div className="flex flex-wrap gap-3 text-sm">
      <span>搜索：{item.permissions.search ? '允许' : '未授权'}</span>
      <span>读取原文：{item.permissions.read ? '允许' : '未授权'}</span>
      <span>下载：{item.permissions.download ? '允许' : '未授权'}</span>
    </div>
  </div>
  const metadata = (item: SharedItem) => <>
    <div className="flex flex-wrap gap-4">
      <Link className={link} to={`/capabilities?view=users&user=${item.publisher}`}>发布者：{publisher(item)?.primary ?? item.publisher}</Link>
      <Link className={link} to={`/capabilities?view=devices&device=${item.device}`}>提供设备：{device(item)?.primary ?? item.device}</Link>
    </div>
    <p className={muted}>版本：{item.version} · 设备状态：{device(item)?.status ?? '未知'} · 共享对象：{item.audience}</p>
    <p className={muted}>来源：{sourceLabels[item.source]} · 发布状态：{item.paused ? '已暂停' : '已发布'}</p>
    {item.kind === 'knowledge' && permissionSummary(item)}
  </>
  const cards = (items: SharedItem[]) => items.map((item) => <article key={item.id} className={panel}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold text-[var(--text-strong)]"><Link className={link} to={itemHref(item)}>{item.name}</Link></h3>
      <StatusBadge status={availability(item).label} tone={availability(item).available ? 'online' : 'warning'} />
    </div>
    {metadata(item)}
  </article>)

  return <>
    <PageHeader eyebrow={view === 'local' ? '当前本地服务 · 真实元数据' : `示例组织 · ${snapshot.instance.organization}`} title="共享中心" description={view === 'local' ? '查看当前服务登记的设备与发布记录。其他页签为示例数据。' : '查看示例共享内容、发布用户和提供设备的关联。'} />
    <div role="tablist" aria-label="共享中心分类" className="mb-5 flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-xl border border-white/10 p-1">
      {tabs.map(([key, label], index) => <button key={key} id={`sharing-tab-${key}`} role="tab" aria-selected={view === key} aria-controls="sharing-panel" tabIndex={view === key ? 0 : -1}
        className={`min-h-10 shrink-0 rounded-lg px-3 text-sm focus-visible:outline-2 ${view === key ? 'bg-[var(--control)] font-semibold text-[var(--text-strong)]' : 'text-[var(--text-muted)]'}`}
        onClick={() => setParams({ view: key })} onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null
          if (next === null) return
          event.preventDefault()
          setParams({ view: tabs[next][0] })
          document.getElementById(`sharing-tab-${tabs[next][0]}`)?.focus()
        }}>{label}</button>)}
    </div>
    <section id="sharing-panel" role="tabpanel" aria-labelledby={`sharing-tab-${view}`} className="space-y-4">
      {view === 'local' ? <LocalSharing /> : <>
      <p className={muted}>交互原型：仅展示示例元数据。管理员可见元数据不代表获得内容权限；本页不搜索正文、读取原文、下载文件或调用能力。</p>
      <div className={panel}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">搜索共享元数据<input className={control} value={query} placeholder="名称、发布者、设备或版本" onChange={(event) => update('q', event.target.value)} /></label>
          <label className="text-sm">可用状态<select className={control} value={status} onChange={(event) => update('status', event.target.value)}><option value="">全部状态</option><option value="ready">就绪</option><option value="unavailable">不可用</option></select></label>
          <label className="text-sm">内容来源<select className={control} value={source} onChange={(event) => update('source', event.target.value)}><option value="">全部来源</option><option value="synced">服务器同步副本</option><option value="remote">远程设备取用</option></select></label>
          <label className="text-sm">共享对象<select className={control} value={audience} onChange={(event) => update('audience', event.target.value)}><option value="">全部对象</option>{[...new Set(sharedItems.map((item) => item.audience))].map((value) => <option key={value}>{value}</option>)}</select></label>
          {grouped && <label className="text-sm">{view === 'users' ? '发布用户' : '提供设备'}<select className={control} value={scope} onChange={(event) => update(scopeKey, event.target.value)}><option value="">全部</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.primary}</option>)}</select></label>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className={muted} role="status">当前结果：{visible.length} 项共享内容</p><Button variant="secondary" onClick={() => setParams({ view })}>清除筛选</Button></div>
      </div>
      {grouped ? entities.filter((entity) => !scope || entity.id === scope).map((entity) => {
        const items = visible.filter((item) => (view === 'users' ? item.publisher : item.device) === entity.id)
        return <section key={entity.id} className="space-y-4" aria-label={`${entity.primary}的共享内容`}>
          <h2 className="font-semibold">{entity.primary} · {entity.status} · {items.length} 项</h2>
          {cards(items)}
          {!items.length && <p className={muted}>当前条件下没有共享内容。</p>}
        </section>
      }) : cards(visible)}
      {!visible.length && <div className={panel}><h2 className="font-semibold">没有符合条件的结果</h2><p className={muted}>请修改关键词或使用“清除筛选”恢复当前页签的全部示例。</p></div>}
      </>}
    </section>
    <Dialog open={view !== 'local' && params.has('item')} onOpenChange={(open) => { if (!open) { const next = new URLSearchParams(params); next.delete('item'); setParams(next) } }} title={selected ? `${selected.name}详情` : '共享内容不存在'} description="仅查看示例元数据，不访问真实内容。">
      {selected ? <div className="space-y-4">
        {metadata(selected)}
        <StatusBadge status={availability(selected).label} tone={availability(selected).available ? 'online' : 'warning'} />
        {selected.kind === 'knowledge' && <>
          <p className={muted}>{selected.source === 'synced' ? '示例副本已同步到服务器；来源设备离线不影响该版本副本。更新仍需设备重新连接。' : '内容保留在提供设备，取用依赖该设备在线；服务器未保存内容副本。'}</p>
          <p className={muted}>授权与来源可用性分别判断，允许搜索不代表允许读取原文或下载。管理员身份不会增加这些权限。</p>
          <div className="flex flex-wrap gap-2"><Button disabled variant="secondary">搜索正文（未接入）</Button><Button disabled variant="secondary">读取原文（未接入）</Button><Button disabled variant="secondary">下载（未接入）</Button></div>
        </>}
        {selected.kind === 'capability' && <p className={muted}>就绪仅表示示例设备在线且发布未暂停，不代表当前访问者获准调用。能力执行未接入。</p>}
      </div> : <p className={muted}>该链接没有对应的示例条目，请关闭详情并重新选择。</p>}
    </Dialog>
  </>
}
