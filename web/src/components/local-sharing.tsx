import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Device, Publication } from '../../../shared/sharing'
import type { ConsoleRecord, ConsoleSnapshot } from '../../../shared/console'
import { adminFetch } from '../lib/admin-fetch'
import { sharingRequest } from '../lib/sharing-api'
import { Button } from './ui/button'
import { StatusBadge } from './ui/status-badge'
import { useI18n } from '../lib/i18n'
import { localizedError, ServiceError, toError } from '../lib/localized-sharing'

const panel = 'space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const control = 'mt-1 w-full min-w-0 rounded-lg border border-[var(--border-control)] bg-[var(--control)] p-2 text-sm text-[var(--text-primary)] focus-visible:outline-2'
type MemberRecord = ConsoleRecord & { fields?: Record<string, string> }
type Directory = { devices: Device[]; publications: Publication[]; members?: MemberRecord[] }
const memberDeviceIds = (member: MemberRecord) => [...new Set((member.fields?.deviceIds ?? '').split(',').map(id => id.trim()).filter(Boolean))]

async function loadMembers(signal: AbortSignal): Promise<MemberRecord[]> {
  const response = await adminFetch('/api/v1/console', { signal })
  const body = await response.json()
  if (!response.ok) throw new ServiceError(body.message ?? '请求失败', response.status, body.code, body.requestId)
  return (body as ConsoleSnapshot).records.filter(record => record.module === 'members' && record.status === 'approved')
}

function GroupedPublications({ view, devices, members, publications, deviceId, query, filtered, renderPublication }: {
  view?: string; devices: Device[]; members: MemberRecord[]; publications: Publication[]
  deviceId: string; query: string; filtered: boolean; renderPublication: (publication: Publication) => ReactNode
}) {
  const { t, formatDate } = useI18n()
  if (view !== 'devices' && view !== 'members') return <>{publications.map(renderPublication)}</>
  const search = query.trim().toLowerCase()
  const ids = [...new Set([...devices.map(device => device.id), ...publications.map(item => item.deviceId)])]
    .filter(id => {
      if (deviceId && id !== deviceId) return false
      if (!filtered || publications.some(item => item.deviceId === id)) return true
      const device = devices.find(row => row.id === id)
      return Boolean(search && device && [device.id, device.name, device.platform, device.appVersion].join(' ').toLowerCase().includes(search))
    })
  function renderDevice(id: string) {
    const device = devices.find(row => row.id === id)
    const items = publications.filter(item => item.deviceId === id)
    return <section key={id} aria-label={device?.name ?? id} className={panel}>
      <h3 className="font-semibold break-words">{device?.name ?? t('未找到设备（{id}）', 'Device not found ({id})', { id })}</h3>
      <p className={`${muted} break-words`}>{t('设备标识：{id}', 'Device ID: {id}', { id })}</p>
      {device && <><p className={muted}>{t('平台：{platform} · 应用版本：{version}', 'Platform: {platform} · App version: {version}', { platform: device.platform, version: device.appVersion })}</p><p className={muted}>{t('登记时间：', 'Registered at: ')}<time dateTime={device.registeredAt}>{formatDate(device.registeredAt)}</time> · {t('更新时间：', 'Updated at: ')}<time dateTime={device.updatedAt}>{formatDate(device.updatedAt)}</time></p><Link className="inline-flex min-h-9 items-center text-sm underline underline-offset-4" to={`/devices?device=${encodeURIComponent(id)}`}>{t('查看设备详情', 'View device details')}</Link></>}
      <p className={muted}>{t('当前筛选下：能力 {capabilities} 项 · 知识库 {knowledge} 项', 'Current filters: {capabilities} capabilities · {knowledge} knowledge bases', { capabilities: items.filter(item => item.kind === 'capability').length, knowledge: items.filter(item => item.kind === 'knowledge').length })}</p>
      {!items.length && <p className={muted}>{t('此设备暂无符合条件的发布记录。', 'This device has no matching publication records.')}</p>}
      {items.map(renderPublication)}
    </section>
  }
  if (view === 'devices') return <>{!ids.length && <p className={muted}>{t('没有符合条件的设备。', 'No matching devices.')}</p>}{ids.map(renderDevice)}</>
  const assigned = new Set(members.flatMap(memberDeviceIds))
  const unassigned = ids.filter(id => !assigned.has(id))
  return <>
    <p className={muted}>{t('仅使用审核通过的成员登记中明确填写的设备标识关联目录；此关联不证明身份、设备所有权或访问权限。同一设备可出现在多个成员登记下。', 'Only explicit device IDs in approved member registrations associate this directory. These associations do not prove identity, device ownership or access rights. A device may appear under multiple member registrations.')}</p>
    {!members.length && <p className={muted}>{t('暂无审核通过的成员登记。', 'No approved member registrations.')}</p>}
    {members.map(member => {
      const associated = memberDeviceIds(member)
      const matching = ids.filter(id => associated.includes(id))
      const missing = associated.filter(id => !devices.some(device => device.id === id) && !ids.includes(id))
      if ((deviceId || filtered) && !matching.length) return null
      return <section key={member.id} aria-label={member.name} className={panel}>
        <h2 className="font-semibold break-words">{member.name}</h2>
        <p className={`${muted} break-words`}>{t('成员登记标识：{id}', 'Member registration ID: {id}', { id: member.id })}</p>
        {member.fields?.email && <p className={`${muted} break-words`}>{t('邮箱：', 'Email: ')}{member.fields.email}</p>}
        {member.fields?.group && <p className={`${muted} break-words`}>{t('用户组：', 'Group: ')}{member.fields.group}</p>}
        {member.fields?.role && <p className={`${muted} break-words`}>{t('登记角色：', 'Registered role: ')}{member.fields.role}</p>}
        {!associated.length && <p className={muted}>{t('此成员登记未关联设备。', 'This member registration has no associated devices.')}</p>}
        {missing.map(id => <p key={id} className={`${muted} break-words`}>{t('关联的设备标识未在设备目录中找到：{id}', 'Associated device ID not found in the device directory: {id}', { id })}</p>)}
        {matching.map(renderDevice)}
      </section>
    })}
    <section aria-label={t('未关联成员的设备', 'Devices without member associations')} className={panel}>
      <h2 className="font-semibold">{t('未关联成员的设备', 'Devices without member associations')}</h2>
      {!unassigned.length && <p className={muted}>{t('当前筛选下没有未关联的设备。', 'No unassigned devices match the current filters.')}</p>}
      {unassigned.map(renderDevice)}
    </section>
  </>
}
type LoadState = { status: 'loading' } | { status: 'error'; message: Error } | { status: 'loaded'; data: Directory }

export function LocalSharing({ view }: { view?: 'capabilities' | 'knowledge' | 'devices' | 'members' }) {
  const { t, formatDate } = useI18n()
  const [params, setParams] = useSearchParams()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [pending, setPending] = useState('')
  const [actionError, setActionError] = useState<string | Error>('')
  const deviceId = params.get('device') ?? ''
  const fixedKind = view === 'capabilities' ? 'capability' : view === 'knowledge' ? 'knowledge' : ''
  const kind = fixedKind || (params.get('kind') ?? '')
  const status = params.get('status') ?? ''
  const query = params.get('q') ?? ''

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      sharingRequest<Pick<Directory, 'devices'>>('/devices', controller.signal),
      sharingRequest<Pick<Directory, 'publications'>>('/publications', controller.signal),
      view === 'members' ? loadMembers(controller.signal) : Promise.resolve(undefined)
    ]).then(([devices, publications, members]) => {
      if (!controller.signal.aborted) setState({ status: 'loaded', data: { ...devices, ...publications, members } })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', message: toError(error) })
    })
    return () => controller.abort()
  }, [attempt, view])

  const reload = () => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  async function revoke(publication: Publication) {
    if (publication.status !== 'published' || pending || !window.confirm(t('撤销“{name}”？撤销后会保留记录，但不能继续作为已发布内容使用。', 'Revoke “{name}”? The record will be retained, but it can no longer be used as published content.', { name: publication.name }))) return
    setPending(publication.id)
    setActionError('')
    try {
      await sharingRequest(`/publications/${encodeURIComponent(publication.id)}/revoke`, undefined, 'POST')
      reload()
    } catch (error) {
      setActionError(toError(error))
    } finally {
      setPending('')
    }
  }

  return <>
    <div className={panel}>
      <p className={muted}>{t('此页读取当前服务的设备和发布元数据。请在 GoodBuddy 应用中心登记设备、发布或撤销共享内容，再刷新此目录。', 'This page reads device and publication metadata from this service. Register devices and publish or revoke shared content in the GoodBuddy app center, then refresh this directory.')}</p>
      <p className={muted}>{t('登记不代表设备在线；已发布不代表可以调用。来源模式仅为声明，服务器未同步正文。知识权限分别记录声明，尚未执行授权校验；此页不搜索正文、读取原文、下载文件或调用能力。', 'Registration does not mean a device is online, and publication does not mean a capability can be invoked. Source modes are declarations; content is not synchronized to the server. Knowledge permissions are independent declarations without authorization enforcement. This page does not search or read content, download files or invoke capabilities.')}</p>
      <Button variant="secondary" disabled={state.status === 'loading'} onClick={reload}>{t('刷新目录', 'Refresh directory')}</Button>
      {actionError && <p role="alert" className="text-sm text-rose-300">{t('撤销失败：', 'Revocation failed: ')}{localizedError(actionError)}</p>}
    </div>
    {state.status === 'loading' && <p role="status" className={muted}>{t('正在加载本地服务目录…', 'Loading local service directory…')}</p>}
    {state.status === 'error' && <div className={panel}>
      <div role="alert"><h2 className="font-semibold">{t('本地服务目录加载失败', 'Failed to load local service directory')}</h2><p className={`${muted} break-words`}>{localizedError(state.message)}</p><p className={muted}>{t('请确认本地服务可访问后重试。', 'Check that the local service is reachable and try again.')}</p></div>
      <Button variant="secondary" onClick={reload}>{t('重试', 'Retry')}</Button>
    </div>}
    {state.status === 'loaded' && (() => {
      const { devices, publications } = state.data
      const visible = publications.filter((item) => {
        const device = devices.find(row => row.id === item.deviceId)
        return (!deviceId || item.deviceId === deviceId) && (!kind || item.kind === kind) && (!status || item.status === status) &&
          [item.name, item.description, item.id, item.deviceId, device?.name, device?.platform, device?.appVersion].join(' ').toLowerCase().includes(query.trim().toLowerCase())
      })
      return <>
        <div className={panel}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">{t('搜索本地元数据', 'Search local metadata')}<input className={control} value={query} placeholder={t('名称、描述、设备或标识', 'Name, description, device or ID')} onChange={(event) => update('q', event.target.value)} /></label>
            <label className="text-sm">{t('登记设备', 'Registered devices')}<select className={control} value={deviceId} onChange={(event) => update('device', event.target.value)}><option value="">{t('全部设备', 'All devices')}</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.id})</option>)}{deviceId && !devices.some((device) => device.id === deviceId) && <option value={deviceId}>{t('未找到设备（{id}）', 'Device not found ({id})', { id: deviceId })}</option>}</select></label>
             <label className="text-sm">{t('共享类型', 'Sharing type')}<select className={control} value={kind} disabled={Boolean(fixedKind)} onChange={(event) => update('kind', event.target.value)}><option value="">{t('全部类型', 'All types')}</option><option value="capability">{t('能力', 'Capability')}</option><option value="knowledge">{t('知识库', 'Knowledge base')}</option></select></label>
            <label className="text-sm">{t('发布状态', 'Publication status')}<select className={control} value={status} onChange={(event) => update('status', event.target.value)}><option value="">{t('全部状态', 'All statuses')}</option><option value="published">{t('已发布', 'Published')}</option><option value="revoked">{t('已撤销', 'Revoked')}</option></select></label>
          </div>
           <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className={muted}>{t('当前结果：{count} 项本地发布记录', 'Results: {count} local publication records', { count: visible.length })}</p><Button variant="secondary" onClick={() => { const next = new URLSearchParams(params); for (const key of ['device', 'kind', 'status', 'q']) next.delete(key); setParams(next) }}>{t('清除筛选', 'Clear filters')}</Button></div>
        </div>
         {view !== 'devices' && view !== 'members' && <section className={panel} aria-label={t('真实登记设备', 'Registered devices')}>
          <h2 className="font-semibold">{t('登记设备', 'Registered devices')} · {devices.length}</h2>
          {!devices.length && <p className={muted}>{t('尚无登记设备。请在 GoodBuddy 应用中心连接此服务并登记设备。', 'No registered devices. Connect to this service in the GoodBuddy app center and register a device.')}</p>}
          {devices.filter((device) => !deviceId || device.id === deviceId).map((device) => <div key={device.id} className="space-y-1 break-words">
            <h3 className="font-semibold">{device.name}</h3>
            <p className={muted}>{t('设备标识：{id} · 平台：{platform} · 应用版本：{version}', 'Device ID: {id} · Platform: {platform} · App version: {version}', { id: device.id, platform: device.platform, version: device.appVersion })}</p>
            <p className={muted}>{t('登记时间：', 'Registered at: ')}<time dateTime={device.registeredAt}>{formatDate(device.registeredAt)}</time></p>
          </div>)}
         </section>}
        {!publications.length ? <div className={panel}><h2 className="font-semibold">{t('尚无发布记录', 'No publication records')}</h2><p className={muted}>{t('请在 GoodBuddy 应用中心发布能力或知识库，再刷新目录。', 'Publish a capability or knowledge base in the GoodBuddy app center, then refresh the directory.')}</p></div> : !visible.length && <div className={panel}><h2 className="font-semibold">{t('没有符合条件的本地记录', 'No matching local records')}</h2><p className={muted}>{t('请调整条件或清除筛选。', 'Adjust or clear your filters.')}</p></div>}
         <GroupedPublications view={view} devices={devices} members={state.data.members ?? []} publications={visible} deviceId={deviceId} query={query} filtered={Boolean(kind || status || query)} renderPublication={(item) => <article key={item.id} className={`${panel} break-words`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 font-semibold text-[var(--text-strong)]">{item.name}</h2><StatusBadge status={item.status === 'revoked' ? t('已撤销', 'Revoked') : t('已发布', 'Published')} tone={item.status === 'revoked' ? 'warning' : 'neutral'} /></div>
          <p className={`${muted} whitespace-pre-wrap`}>{item.description || t('未提供描述。', 'No description provided.')}</p>
          <p className={muted}>{t('类型：', 'Type: ')}{item.kind === 'knowledge' ? t('知识库', 'Knowledge base') : t('能力', 'Capability')} · {t('提供设备：', 'Provider device: ')}{devices.find((device) => device.id === item.deviceId)?.name ?? item.deviceId}</p>
          <p className={muted}>{t('发布标识：{id} · 设备标识：{device}', 'Publication ID: {id} · Device ID: {device}', { id: item.id, device: item.deviceId })}</p>
          <p className={muted}>{t('来源声明：', 'Declared source: ')}{item.sourceMode === 'server' ? t('服务器', 'Server') : t('设备', 'Device')}{t('（仅描述来源，不代表内容已同步或可取用）', ' (source declaration only; content may not be synchronized or accessible)')}</p>
          <p className={muted}>{t('发布时间：', 'Published at: ')}<time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time> · {t('更新时间：', 'Updated at: ')}<time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></p>
           {item.kind === 'knowledge' && <div className="space-y-2"><h3 className="text-sm font-semibold">{t('知识权限声明（各自独立，未执行授权校验）', 'Knowledge permission declarations (independent; authorization not enforced)')}</h3><div className="flex flex-wrap gap-3 text-sm"><span>{t('搜索：', 'Search: ')}{item.permissions.search ? t('声明允许', 'Declared allowed') : t('未声明允许', 'Not declared allowed')}</span><span>{t('读取原文：', 'Read original: ')}{item.permissions.read ? t('声明允许', 'Declared allowed') : t('未声明允许', 'Not declared allowed')}</span><span>{t('下载：', 'Download: ')}{item.permissions.download ? t('声明允许', 'Declared allowed') : t('未声明允许', 'Not declared allowed')}</span></div></div>}
           {item.status === 'published' && <Button variant="danger" size="sm" disabled={Boolean(pending)} onClick={() => void revoke(item)}>{pending === item.id ? t('撤销中…', 'Revoking…') : t('撤销发布', 'Revoke publication')}</Button>}
          </article>} />
      </>
    })()}
  </>
}
