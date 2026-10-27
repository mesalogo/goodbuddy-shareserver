import { ArrowUpRight, CircleAlert, ClipboardList, History, Router, Server, Share2 } from 'lucide-react'
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
import type { ConsoleSnapshot } from '../../../shared/console'
import { useI18n } from '../lib/i18n'
import { ConsoleRequestError, localizedAuditAction, localizedError, localizedModule } from '../lib/console-i18n'

const panel = 'rounded-xl border border-[var(--border-default)] bg-[var(--panel)] p-4 sm:p-6'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const link = 'rounded-md text-sm text-[var(--accent)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]'

type Topology = { devices: Device[]; publications: Publication[]; gateway: GatewaySnapshot }

function Metric({ icon: Icon, title, value, label, detail }: { icon: LucideIcon; title: string; value: number; label: string; detail: string }) {
  return <article className={`min-w-0 ${panel}`}>
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3><Icon aria-hidden="true" className="size-4 text-[var(--text-muted)]" /></div>
    <p className="mt-4 flex flex-wrap items-baseline gap-2"><span className="text-3xl font-semibold tracking-tight text-[var(--text-strong)] tabular-nums">{value}</span><span className="text-sm text-[var(--text-muted)]">{label}</span></p>
    <p className={`mt-2 ${muted}`}>{detail}</p>
  </article>
}

export function OverviewPage() {
  const { t, formatDate } = useI18n()
  const [topology, setTopology] = useState<Topology | null>(null)
  const [topologyError, setTopologyError] = useState<Error | string>('')
  const [activeTab, setActiveTab] = useState('status')
  const [management, setManagement] = useState<ConsoleSnapshot | null>(null)
  const [managementError, setManagementError] = useState<Error | string>('')
  const [refresh, setRefresh] = useState(0)
  const [metricsRefresh, setMetricsRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    adminFetch('/api/v1/console', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new ConsoleRequestError('无法读取管理记录', response.status)
      return response.json() as Promise<ConsoleSnapshot>
    }).then(data => { if (!controller.signal.aborted) { setManagement(data); setManagementError('') } }).catch((error: unknown) => {
      if (!controller.signal.aborted) setManagementError(error instanceof Error ? error : '加载失败')
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
      if (!controller.signal.aborted) { setTopology({ devices: devices.devices, publications: publications.publications, gateway }); setTopologyError('') }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setTopologyError(error instanceof Error ? error : '拓扑数据加载失败')
    })
    return () => controller.abort()
  }, [metricsRefresh])

  const pending = management?.records.filter(record => record.status === 'pending') ?? []
  const profile = management?.records.filter(r => r.module === 'settings' && r.status === 'approved' && r.fields?.displayName).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const activity = [...(management?.audits ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10)

  return (
    <>
      <PageHeader
        eyebrow={profile?.fields?.displayName ?? 'ShareServer'}
        title={t('运行概览', 'Overview')}
        description={t('当前实例 · 查看设备登记、共享元数据与模型网关配置。', 'Current instance · View device registrations, shared metadata and model gateway configuration.')}
      />
      {profile && <section className={`${panel} mb-5`} aria-label={t('实例公告', 'Instance announcement')}><h2 className="font-semibold">{profile.fields?.displayName}</h2>{profile.fields?.announcement && <p className="mt-2 whitespace-pre-wrap break-words">{profile.fields.announcement}</p>}{profile.fields?.contact && <p className={muted}>{t('管理员联系邮箱', 'Administrator contact')}: {profile.fields.contact}</p>}</section>}
      {activeTab === 'status' && managementError && <p role="alert">{localizedError(managementError)}</p>}
      <PageTabs title={t('运行概览', 'Overview')} active={activeTab} onChange={setActiveTab} tabs={[{ key: 'status', label: t('服务状态', 'Service status') }, { key: 'pending', label: t('待处理事项', 'Pending items') }, { key: 'activity', label: t('最近活动', 'Recent activity') }]} />
      {activeTab !== 'status' && <section className={`${panel} mb-6`} aria-label={activeTab === 'pending' ? t('待处理事项', 'Pending items') : t('最近活动', 'Recent activity')}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-[var(--text-strong)]">{activeTab === 'pending' ? t('待处理事项', 'Pending items') : t('最近活动', 'Recent activity')}</h2><button className={link} onClick={() => setRefresh(v => v + 1)}>{t('刷新', 'Refresh')}</button></div><p className={`mt-2 ${muted}`}>{t('当前实例的管理登记与人工审核记录；审核通过不自动授权或执行。', 'Management registrations and manual reviews for this instance; approval does not automatically grant access or execute requests.')}</p>
        {managementError && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{localizedError(managementError)}{management && t('；下方保留上次读取的记录。', ' Previously loaded records are retained below.')}</p>}
        {!management && !managementError && <p role="status" className={`mt-4 ${muted}`}>{t('正在读取记录…', 'Loading records…')}</p>}
        {management && (activeTab === 'pending' ? <>
          <p className={`mt-4 ${muted}`}>{t('{count} 项待审核登记', '{count} registrations pending review', { count: pending.length })}</p>
          {pending.length === 0 ? <div className="py-8 text-center"><ClipboardList aria-hidden="true" className="mx-auto mb-3 size-5 text-[var(--text-muted)]" /><h3 className="text-sm font-medium text-[var(--text-strong)]">{t('没有待审核的登记。', 'No registrations pending review.')}</h3><p className={`mt-1 ${muted}`}>{t('新提交的待审核登记会显示在这里。', 'Newly submitted registrations will appear here.')}</p></div> : <ul className="mt-2 divide-y divide-[var(--border-default)]">{pending.map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0 flex-1"><Link className={`${link} break-words font-medium`} to={`/${record.module}`}>{record.name}</Link><p className={muted}>{localizedModule(record.module).title} · {t('待审核', 'Pending review')}</p>{record.detail && <p className={`${muted} break-words`}>{record.detail}</p>}<p className={`mt-1 ${muted}`}>{t('更新于 ', 'Updated at ')}<time dateTime={record.updatedAt}>{formatDate(record.updatedAt)}</time></p></div>
            <Link className={link} to={`/${record.module}`} aria-label={t('审核 {name}', 'Review {name}', { name: record.name })}>{t('前往审核', 'Review')} <ArrowUpRight aria-hidden="true" className="inline size-4" /></Link>
          </li>)}</ul>}
        </> : <>
          <p className={`mt-4 ${muted}`}>{t('最近 {count} 条管理操作', 'Latest {count} management actions', { count: activity.length })}</p>
          {activity.length === 0 ? <div className="py-8 text-center"><History aria-hidden="true" className="mx-auto mb-3 size-5 text-[var(--text-muted)]" /><h3 className="text-sm font-medium text-[var(--text-strong)]">{t('尚无管理操作记录。', 'No management actions yet.')}</h3><p className={`mt-1 ${muted}`}>{t('创建或审核登记后，可在这里查看变更。', 'Changes appear here after registrations are created or reviewed.')}</p></div> : <ol className="mt-2 divide-y divide-[var(--border-default)]">{activity.map(audit => <li key={audit.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-[var(--text-primary)]">{localizedModule(audit.module).title} · {localizedAuditAction(audit.action, false)}</p><p className={`${muted} break-words`}>{management.records.find(record => record.id === audit.recordId)?.name ?? audit.recordId} · {t('修订 {revision}', 'Revision {revision}', { revision: audit.revision })}</p><time className={muted} dateTime={audit.at}>{formatDate(audit.at)}</time></div><Link className={link} to="/audit">{t('查看变更', 'View changes')}</Link>
          </li>)}</ol>}
        </>)}
      </section>}
      {activeTab === 'status' && <>
      <section aria-label={t('登记与配置概况', 'Registration and configuration overview')} className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[var(--text-strong)]">{t('登记与配置', 'Registrations and configuration')}</h2><p className={`mt-1 ${muted}`}>{t('当前实例的已保存数据，不代表设备在线或上游可用。', 'Saved data for this instance does not indicate device connectivity or upstream availability.')}</p></div><Link className={link} to="/devices">{t('查看接入设备', 'View registered devices')}</Link></div>
        {topologyError && <div className="mt-4 flex flex-wrap items-center gap-3"><p role="alert" className="flex items-center gap-2 text-sm text-[var(--danger)]"><CircleAlert aria-hidden="true" className="size-4" />{t('概况数据加载失败：', 'Failed to load overview data: ')}{localizedError(topologyError)}</p><button className={link} onClick={() => setMetricsRefresh(v => v + 1)}>{t('重试', 'Retry')}</button></div>}
        {!topology && !topologyError && <p role="status" className={`mt-5 ${muted}`}>{t('正在读取登记与配置…', 'Loading registrations and configuration…')}</p>}
        {topology && <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Metric icon={Share2} title={t('GoodBuddy 设备', 'GoodBuddy devices')} value={topology.devices.length} label={t('台已登记设备', 'registered devices')} detail={t('登记记录不代表在线', 'Registration does not indicate connectivity')} />
          <Metric icon={Server} title="ShareServer" value={topology.publications.filter(item => item.status === 'published').length} label={t('项已发布元数据', 'published metadata entries')} detail={t('共享目录仅保存发布元数据', 'The shared catalog stores publication metadata only')} />
          <Metric icon={Router} title={t('外部模型上游', 'External model upstreams')} value={topology.gateway.upstreams.filter(item => item.enabled).length} label={t('个启用上游', 'enabled upstreams')} detail={t('{count} 个启用模型 · 启用不代表连通', '{count} enabled models · Enabled does not mean connected', { count: topology.gateway.models.filter(item => item.enabled).length })} />
        </div>}
        {topology && <p className={`mt-4 ${muted}`}>{t('共享目录当前只保存发布元数据；模型请求通过 ShareServer 转发到已配置上游，GoodBuddy 不直接读取上游凭据。', 'The shared catalog currently stores publication metadata only. ShareServer forwards model requests to configured upstreams; GoodBuddy does not read upstream credentials directly.')}</p>}
      </section>
      <section aria-label={t('GoodBuddy 联动服务', 'GoodBuddy connected services')} className="mb-6 grid gap-4 md:grid-cols-2">
        {[
          { path: '/model-gateway', title: t('模型网关', 'Model gateway'), copy: t('配置上游与模型别名、测试请求转发并查看调用审计。', 'Configure upstreams and model aliases, test request forwarding and view invocation audits.') },
          { path: '/capabilities', title: t('共享中心', 'Sharing center'), copy: t('查看当前服务登记的设备与发布记录，按设备、类型和发布状态筛选。', 'View devices and publications registered with this service. Filter by device, type and publication status.') }
        ].map((service) => (
          <Link key={service.path} to={service.path} className={`${panel} text-left transition-colors hover:border-[var(--border-control)] hover:bg-[var(--control)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]`}>
            <h2 className="flex items-center justify-between gap-2 font-semibold text-[var(--text-strong)]">{service.title}<ArrowUpRight aria-hidden="true" className="size-4 text-[var(--text-muted)]" /></h2>
            <span className="mt-2 block text-sm leading-6 text-[var(--text-muted)]">{service.copy}</span>
          </Link>
        ))}
      </section>
      </>}
    </>
  )
}
