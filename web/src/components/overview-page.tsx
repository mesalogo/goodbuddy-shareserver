import { ArrowUpRight, CircleAlert, Router, Server, Share2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Device, Publication } from '../../../shared/sharing'
import type { GatewaySnapshot } from '../../../shared/gateway'
import { sharingRequest } from '../lib/sharing-api'
import { gatewayRequest } from '../lib/gateway-api'
import { adminFetch } from '../lib/admin-fetch'
import { PageHeader } from './page-header'
import { PageTabs } from './page-tabs'
import { consoleModules, type ConsoleSnapshot } from '../../../shared/console'

const panel = 'rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'

type Topology = { devices: Device[]; publications: Publication[]; gateway: GatewaySnapshot }

function TopologyNode({ icon: Icon, title, detail, tone = 'cyan' }: { icon: LucideIcon; title: string; detail: string; tone?: 'cyan' | 'violet' | 'slate' }) {
  const colors = { cyan: 'border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-100', violet: 'border-violet-300/25 bg-violet-300/[0.08] text-violet-100', slate: 'border-white/10 bg-white/[0.04] text-slate-200' }
  return <div className={`min-w-0 rounded-xl border p-4 ${colors[tone]}`}><Icon aria-hidden="true" className="mb-3 size-5" /><p className="font-medium">{title}</p><p className="mt-1 break-words text-xs leading-5 text-[var(--text-muted)]">{detail}</p></div>
}

export function OverviewPage() {
  const [topology, setTopology] = useState<Topology | null>(null)
  const [topologyError, setTopologyError] = useState('')
  const [activeTab, setActiveTab] = useState('status')
  const [management, setManagement] = useState<ConsoleSnapshot | null>(null)
  const [managementError, setManagementError] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (activeTab === 'status') return
    const controller = new AbortController()
    adminFetch('/api/v1/console', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('无法读取管理记录')
      return response.json() as Promise<ConsoleSnapshot>
    }).then(data => { if (!controller.signal.aborted) { setManagement(data); setManagementError('') } }).catch((error: unknown) => {
      if (!controller.signal.aborted) setManagementError(error instanceof Error ? error.message : '加载失败')
    })
    return () => controller.abort()
  }, [activeTab, refresh])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      sharingRequest<{ devices: Device[] }>('/devices', controller.signal),
      sharingRequest<{ publications: Publication[] }>('/publications', controller.signal),
      gatewayRequest<GatewaySnapshot>('/config', controller.signal)
    ]).then(([devices, publications, gateway]) => {
      if (!controller.signal.aborted) setTopology({ devices: devices.devices, publications: publications.publications, gateway })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setTopologyError(error instanceof Error ? error.message : '拓扑数据加载失败')
    })
    return () => controller.abort()
  }, [])

  return (
    <>
      <PageHeader
        eyebrow="ShareServer"
        title="运行概览"
        description="管理当前服务的模型网关与本地共享目录。"
      />
      <PageTabs title="运行概览" active={activeTab} onChange={setActiveTab} tabs={[{ key: 'status', label: '服务状态' }, { key: 'pending', label: '待处理事项' }, { key: 'activity', label: '最近活动' }]} />
      {activeTab !== 'status' && <section className={`${panel} mb-6`}><div className="flex justify-between gap-3"><h2 className="font-semibold">{activeTab === 'pending' ? '待处理事项' : '最近活动'}</h2><button className="text-sm underline" onClick={() => setRefresh(v => v + 1)}>刷新</button></div><p className={`mt-2 ${muted}`}>当前实例的管理登记与人工审核记录。</p>
        {managementError && <p role="alert">{managementError}</p>}
        {!management && !managementError && <p role="status">正在读取记录…</p>}
        {management && (activeTab === 'pending' ? <div className="mt-4 space-y-3">{management.records.filter(r => r.status === 'pending').length === 0 && <p className={muted}>没有待审核的登记。</p>}{management.records.filter(r => r.status === 'pending').map(r => <Link className="block text-sm underline" key={r.id} to={`/${r.module}`}>{consoleModules[r.module].title} · {r.name}</Link>)}</div> : <div className="mt-4 space-y-3">{management.audits.length === 0 && <p className={muted}>尚无管理操作记录。</p>}{management.audits.slice(0, 10).map(a => <p key={a.id} className={muted}>{new Date(a.at).toLocaleString()} · {consoleModules[a.module].title} · <Link className="underline" to="/audit">查看变更</Link></p>)}</div>)}
      </section>}
      {activeTab === 'status' && <>
      <section aria-label="服务拓扑" className={`${panel} mb-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[var(--text-strong)]">服务拓扑</h2><p className={`mt-1 ${muted}`}>根据当前登记设备、共享目录和模型网关配置展示实际连接关系。</p></div><Link className="text-sm underline underline-offset-4" to="/devices">查看接入设备</Link></div>
        {topologyError && <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-rose-300"><CircleAlert aria-hidden="true" className="size-4" />拓扑数据加载失败：{topologyError}</p>}
        {!topology && !topologyError && <p role="status" className={`mt-5 ${muted}`}>正在读取服务拓扑…</p>}
        {topology && <div className="mt-5 grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <TopologyNode icon={Share2} title="GoodBuddy 设备" detail={`${topology.devices.length} 台已登记设备；登记记录不代表在线`} />
          <div aria-hidden="true" className="hidden h-px bg-cyan-300/30 lg:block" />
          <TopologyNode icon={Server} title="ShareServer" detail={`${topology.publications.filter((item) => item.status === 'published').length} 项已发布目录；负责网关转发与目录管理`} tone="violet" />
          <div aria-hidden="true" className="hidden h-px bg-violet-300/30 lg:block" />
          <TopologyNode icon={Router} title="外部模型上游" detail={`${topology.gateway.upstreams.filter((item) => item.enabled).length} 个启用上游，${topology.gateway.models.filter((item) => item.enabled).length} 个启用模型`} tone="slate" />
        </div>}
        {topology && <p className={`mt-4 ${muted}`}>共享目录当前只保存发布元数据；模型请求通过 ShareServer 转发到已配置上游，GoodBuddy 不直接读取上游凭据。</p>}
      </section>
      <section aria-label="GoodBuddy 联动服务" className="mb-6 grid gap-4 md:grid-cols-2">
        {[
          { path: '/model-gateway', title: '模型网关', copy: '配置上游与模型别名、测试请求转发并查看调用审计。' },
          { path: '/capabilities', title: '共享中心', copy: '查看当前服务登记的设备与发布记录，按设备、类型和发布状态筛选。' }
        ].map((service) => (
          <Link key={service.path} to={service.path} className="rounded-2xl border border-white/10 bg-[var(--panel)] p-5 text-left outline-none transition hover:bg-[var(--control)] focus-visible:ring-2 focus-visible:ring-cyan-400/70">
            <span className="flex items-center justify-between gap-2 font-semibold text-[var(--text-strong)]">{service.title}<ArrowUpRight aria-hidden="true" className="size-4" /></span>
            <span className="mt-2 block text-sm leading-6 text-[var(--text-muted)]">{service.copy}</span>
          </Link>
        ))}
      </section>
      </>}
    </>
  )
}
