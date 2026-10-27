import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Device, Publication, SharingEvent, SharingHistory } from '../../../shared/sharing'
import { sharingRequest } from '../lib/sharing-api'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { StatusBadge } from './ui/status-badge'
import { PageTabs } from './page-tabs'
import { DeviceRegistration } from './device-registration'
import { useI18n } from '../lib/i18n'
import { localizedError, toError } from '../lib/localized-sharing'

const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm text-[var(--text-primary)] focus-visible:outline-2'

type State = { status: 'loading' } | { status: 'error'; message: Error } | { status: 'loaded'; devices: Device[]; publications: Publication[] }

export function DevicesPage() {
  const { t, formatDate } = useI18n()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [activeTab, setActiveTab] = useState('list')
  const selectedId = params.get('device') ?? ''
  const query = params.get('q') ?? ''
  const selected = state.status === 'loaded' ? state.devices.find((device) => device.id === selectedId) : undefined

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      sharingRequest<{ devices: Device[] }>('/devices', controller.signal),
      sharingRequest<{ publications: Publication[] }>('/publications', controller.signal)
    ]).then(([devices, publications]) => {
      if (!controller.signal.aborted) setState({ status: 'loaded', devices: devices.devices, publications: publications.publications })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', message: toError(error) })
    })
    return () => controller.abort()
  }, [attempt])

  function selectDevice(id: string) {
    const next = new URLSearchParams(params)
    if (id) next.set('device', id)
    else next.delete('device')
    setParams(next)
  }

  return <>
    <PageHeader eyebrow={t('设备与共享', 'Devices and sharing')} title={t('GoodBuddy 接入', 'GoodBuddy connections')} description={t('管理设备注册策略、审批和停用，查看共享目录元数据。登记记录不代表设备在线。', 'Manage device registration policies, approvals and deactivation, and view sharing metadata. Registration does not mean a device is online.')} action={<Button variant="secondary" onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }} disabled={state.status === 'loading'}>{t('刷新目录', 'Refresh directory')}</Button>} />
    <PageTabs title={t('GoodBuddy 接入', 'GoodBuddy connections')} active={activeTab} onChange={setActiveTab} tabs={[{ key: 'list', label: t('设备列表', 'Devices') }, { key: 'registration', label: t('注册设置', 'Registration settings') }, { key: 'connections', label: t('注册与接入记录', 'Registration and access history') }, { key: 'revocations', label: t('撤销记录', 'Revocation history') }]} />
    {activeTab === 'registration' && <DeviceRegistration />}
    {['connections', 'revocations'].includes(activeTab) && <DeviceHistory key={`${activeTab}-${attempt}`} revocations={activeTab === 'revocations'} />}
    {state.status === 'loading' && <p role="status" className={muted}>{t('正在加载登记设备…', 'Loading registered devices…')}</p>}
    {state.status === 'error' && <section className={panel}><h2 className="font-semibold">{t('设备目录加载失败', 'Failed to load device directory')}</h2><p className={`${muted} break-words`}>{localizedError(state.message)}</p><Button variant="secondary" onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }}>{t('重试', 'Retry')}</Button></section>}
    {state.status === 'loaded' && activeTab === 'list' && <>
      <section className={panel}>
        <label className="block text-sm">{t('搜索设备', 'Search devices')}<input className={control} value={query} placeholder={t('名称、平台、版本或设备标识', 'Name, platform, version or device ID')} onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set('q', event.target.value); else next.delete('q'); setParams(next, { replace: true }) }} /></label>
        <p role="status" className={muted}>{t('当前登记设备：{count} 台。登记记录不代表设备在线。', 'Registered devices: {count}. Registration does not mean a device is online.', { count: state.devices.length })}</p>
      </section>
      {!state.devices.length ? <section className={panel}><h2 className="font-semibold">{t('尚无登记设备', 'No registered devices')}</h2><p className={muted}>{t('请在 GoodBuddy 的“设备共享（技术预览）”中开启功能并连接此服务。', 'Enable Device sharing (technical preview) in GoodBuddy and connect to this service.')}</p></section> : <section className="grid gap-4 lg:grid-cols-2" aria-label={t('登记设备列表', 'Registered devices')}>
        {state.devices.filter((device) => [device.name, device.id, device.platform, device.appVersion].join(' ').toLowerCase().includes(query.trim().toLowerCase())).map((device) => {
          const count = state.publications.filter((item) => item.deviceId === device.id).length
          return <article key={device.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[var(--text-strong)]">{device.name}</h2><p className={muted}>{device.platform} · {device.appVersion}</p></div><StatusBadge status={t('已登记', 'Registered')} tone="neutral" /></div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className={muted}>{t('设备标识', 'Device ID')}</dt><dd className="break-all">{device.id}</dd></div><div><dt className={muted}>{t('共享记录', 'Sharing records')}</dt><dd>{t('{count} 项', '{count} items', { count })}</dd></div><div><dt className={muted}>{t('登记时间', 'Registered at')}</dt><dd><time dateTime={device.registeredAt}>{formatDate(device.registeredAt)}</time></dd></div><div><dt className={muted}>{t('最近登记', 'Last registration')}</dt><dd><time dateTime={device.updatedAt}>{formatDate(device.updatedAt)}</time></dd></div></dl>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => selectDevice(device.id)}>{t('查看详情', 'View details')}</Button><Link className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm underline underline-offset-4" to={`/capabilities?view=local&device=${encodeURIComponent(device.id)}`}>{t('查看共享内容', 'View shared content')}</Link></div>
          </article>
        })}
      </section>}
      {query && !state.devices.some((device) => [device.name, device.id, device.platform, device.appVersion].join(' ').toLowerCase().includes(query.trim().toLowerCase())) && <section className={panel}><h2 className="font-semibold">{t('没有符合条件的设备', 'No matching devices')}</h2><p className={muted}>{t('请调整搜索条件。', 'Try adjusting your search.')}</p></section>}
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) selectDevice('') }} title={selected?.name ?? t('设备详情', 'Device details')} description={t('以下信息来自本地登记记录，不代表在线连接或设备所有权。', 'This information comes from local registration records and does not establish an online connection or device ownership.')}>
      {selected && <div className="space-y-4"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className={muted}>{t('设备标识', 'Device ID')}</dt><dd className="break-all">{selected.id}</dd></div><div><dt className={muted}>{t('平台', 'Platform')}</dt><dd>{selected.platform}</dd></div><div><dt className={muted}>{t('应用版本', 'App version')}</dt><dd>{selected.appVersion}</dd></div><div><dt className={muted}>{t('登记时间', 'Registered at')}</dt><dd>{formatDate(selected.registeredAt)}</dd></div></dl><Link className="inline-flex min-h-9 items-center rounded-lg bg-cyan-400 px-3 text-sm font-medium text-slate-950" to={`/capabilities?view=local&device=${encodeURIComponent(selected.id)}`} onClick={() => selectDevice('')}>{t('查看此设备的共享内容', 'View shared content from this device')}</Link></div>}
      {selected && <DeviceAuditDetails deviceId={selected.id} />}
    </Dialog>
  </>
}

function DeviceAuditDetails({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const [revision, setRevision] = useState(0)
  return <div className="mt-4 space-y-4"><Button variant="secondary" onClick={() => setExpanded(value => !value)}>{t('注册状态与设备历史', 'Registration status and device history')}</Button>{expanded && <><DeviceRegistration deviceId={deviceId} onChanged={() => setRevision(value => value + 1)} /><DeviceHistory key={revision} deviceId={deviceId} /></>}</div>
}

function DeviceHistory({ deviceId, revocations = false }: { deviceId?: string; revocations?: boolean }) {
  const { t, formatDate } = useI18n()
  const [history, setHistory] = useState<SharingHistory>()
  const [error, setError] = useState<Error>()
  const [attempt, setAttempt] = useState(0)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    sharingRequest<SharingHistory>(`/history${deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''}`, controller.signal).then(value => {
      if (!controller.signal.aborted) { setHistory(value); setError(undefined) }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(toError(reason)) })
    return () => controller.abort()
  }, [deviceId, attempt])
  const labels: Record<SharingEvent['kind'], string> = { registration: t('收到设备注册', 'Device registration received'), approved: t('批准接入', 'Access approved'), rejected: t('拒绝申请', 'Request rejected'), disabled: t('停用设备', 'Device disabled'), 'publication-revoked': t('撤销共享', 'Publication revoked') }
  const statuses = { approved: t('已接纳', 'Approved'), pending: t('待审批', 'Pending approval'), rejected: t('已拒绝', 'Rejected'), disabled: t('已停用', 'Disabled'), unregistered: t('无设备凭据', 'No device credential') }
  const events = history?.events.filter(event => (!revocations || ['disabled', 'rejected', 'publication-revoked'].includes(event.kind)) && `${event.deviceId} ${event.publicationId ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
  const lastRegistration = history?.events.find(event => event.kind === 'registration')
  return <section className={panel} aria-label={t('设备事件历史', 'Device event history')}>
    <h2 className="font-semibold">{revocations ? t('撤销记录', 'Revocation history') : t('注册与接入记录', 'Registration and access history')}</h2>
    <p className={muted}>{t('记录收到的注册请求、审批、停用和共享撤销，不表示实时在线或心跳。启用历史记录前的事件不会补造。', 'Records received registrations, access decisions, deactivation and publication revocation. These are not live presence or heartbeat signals. Earlier events are not reconstructed.')}</p>
    <Button variant="secondary" onClick={() => { setHistory(undefined); setError(undefined); setAttempt(value => value + 1) }}>{t('刷新历史', 'Refresh history')}</Button>
    <label className="block text-sm">{t('筛选设备或共享标识', 'Filter device or publication ID')}<input className={control} value={filter} onChange={event => setFilter(event.target.value)} /></label>
    {error && <p role="alert">{localizedError(error)}</p>}
    {deviceId && history && <p className={muted}>{t('最近保留的注册事件：', 'Latest retained registration event: ')}{lastRegistration ? <time dateTime={lastRegistration.at}>{formatDate(lastRegistration.at)}</time> : t('暂无记录', 'No record')}</p>}
    {!history && !error && <p role="status">{t('正在加载历史…', 'Loading history…')}</p>}
    {history && <><p className={muted}>{t('全服务最多保留最近 {count} 条事件，以下按时间倒序显示。', 'The service retains up to {count} recent events, shown newest first.', { count: history.retentionLimit })}</p>{events?.length === 0 && <p role="status">{t('暂无符合条件的事件。', 'No matching events.')}</p>}
      <ol className="space-y-3">{events?.map(event => <li key={event.id} className="border-t border-[var(--border-default)] pt-3 text-sm"><p className="font-medium">{labels[event.kind]} · {statuses[event.registrationStatus]}</p><p className="break-all">{event.deviceId}{event.publicationId && ` · ${event.publicationId}`}</p><time dateTime={event.at}>{formatDate(event.at)}</time></li>)}</ol></>}
  </section>
}
