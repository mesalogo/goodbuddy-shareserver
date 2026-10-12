import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Device, Publication } from '../../../shared/sharing'
import { sharingRequest } from '../lib/sharing-api'
import { Button } from './ui/button'
import { StatusBadge } from './ui/status-badge'

const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm focus-visible:outline-2'
type Directory = { devices: Device[]; publications: Publication[] }
type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded'; data: Directory }

export function LocalSharing() {
  const [params, setParams] = useSearchParams()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [pending, setPending] = useState('')
  const [actionError, setActionError] = useState('')
  const deviceId = params.get('device') ?? ''
  const kind = params.get('kind') ?? ''
  const status = params.get('status') ?? ''
  const query = params.get('q') ?? ''

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      sharingRequest<Pick<Directory, 'devices'>>('/devices', controller.signal),
      sharingRequest<Pick<Directory, 'publications'>>('/publications', controller.signal)
    ]).then(([devices, publications]) => {
      if (!controller.signal.aborted) setState({ status: 'loaded', data: { ...devices, ...publications } })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '请求失败' })
    })
    return () => controller.abort()
  }, [attempt])

  const reload = () => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  async function revoke(publication: Publication) {
    if (publication.status !== 'published' || pending || !window.confirm(`撤销“${publication.name}”？撤销后会保留记录，但不能继续作为已发布内容使用。`)) return
    setPending(publication.id)
    setActionError('')
    try {
      await sharingRequest(`/publications/${encodeURIComponent(publication.id)}/revoke`, undefined, 'POST')
      reload()
    } catch (error) {
      setActionError(`撤销失败：${error instanceof Error ? error.message : '网络请求失败'}`)
    } finally {
      setPending('')
    }
  }

  return <>
    <div className={panel}>
      <p className={muted}>此页读取当前服务的设备和发布元数据。请在 GoodBuddy 应用中心登记设备、发布或撤销共享内容，再刷新此目录。</p>
      <p className={muted}>登记不代表设备在线；已发布不代表可以调用。来源模式仅为声明，服务器未同步正文。知识权限分别记录声明，尚未执行授权校验；此页不搜索正文、读取原文、下载文件或调用能力。</p>
      <Button variant="secondary" disabled={state.status === 'loading'} onClick={reload}>刷新目录</Button>
      {actionError && <p role="alert" className="text-sm text-rose-300">{actionError}</p>}
    </div>
    {state.status === 'loading' && <p role="status" className={muted}>正在加载本地服务目录…</p>}
    {state.status === 'error' && <div className={panel}>
      <div role="alert"><h2 className="font-semibold">本地服务目录加载失败</h2><p className={`${muted} break-words`}>{state.message}</p><p className={muted}>请确认本地服务可访问后重试。</p></div>
      <Button variant="secondary" onClick={reload}>重试</Button>
    </div>}
    {state.status === 'loaded' && (() => {
      const { devices, publications } = state.data
      const visible = publications.filter((item) => (!deviceId || item.deviceId === deviceId) && (!kind || item.kind === kind) && (!status || item.status === status) &&
        [item.name, item.description, item.id, item.deviceId, devices.find((device) => device.id === item.deviceId)?.name].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
      return <>
        <div className={panel}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">搜索本地元数据<input className={control} value={query} placeholder="名称、描述、设备或标识" onChange={(event) => update('q', event.target.value)} /></label>
            <label className="text-sm">登记设备<select className={control} value={deviceId} onChange={(event) => update('device', event.target.value)}><option value="">全部设备</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}（{device.id}）</option>)}{deviceId && !devices.some((device) => device.id === deviceId) && <option value={deviceId}>未找到设备（{deviceId}）</option>}</select></label>
            <label className="text-sm">共享类型<select className={control} value={kind} onChange={(event) => update('kind', event.target.value)}><option value="">全部类型</option><option value="capability">能力</option><option value="knowledge">知识库</option></select></label>
            <label className="text-sm">发布状态<select className={control} value={status} onChange={(event) => update('status', event.target.value)}><option value="">全部状态</option><option value="published">已发布</option><option value="revoked">已撤销</option></select></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className={muted}>当前结果：{visible.length} 项本地发布记录</p><Button variant="secondary" onClick={() => setParams({ view: 'local' })}>清除筛选</Button></div>
        </div>
        <section className={panel} aria-label="真实登记设备">
          <h2 className="font-semibold">登记设备 · {devices.length}</h2>
          {!devices.length && <p className={muted}>尚无登记设备。请在 GoodBuddy 应用中心连接此服务并登记设备。</p>}
          {devices.filter((device) => !deviceId || device.id === deviceId).map((device) => <div key={device.id} className="space-y-1 break-words">
            <h3 className="font-semibold">{device.name}</h3>
            <p className={muted}>设备标识：{device.id} · 平台：{device.platform} · 应用版本：{device.appVersion}</p>
            <p className={muted}>登记时间：<time dateTime={device.registeredAt}>{device.registeredAt}</time></p>
          </div>)}
        </section>
        {!publications.length ? <div className={panel}><h2 className="font-semibold">尚无发布记录</h2><p className={muted}>请在 GoodBuddy 应用中心发布能力或知识库，再刷新目录。</p></div> : !visible.length && <div className={panel}><h2 className="font-semibold">没有符合条件的本地记录</h2><p className={muted}>请调整条件或清除筛选。</p></div>}
        {visible.map((item) => <article key={item.id} className={`${panel} break-words`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 font-semibold text-[var(--text-strong)]">{item.name}</h2><StatusBadge status={item.status === 'revoked' ? '已撤销' : '已发布'} tone={item.status === 'revoked' ? 'warning' : 'neutral'} /></div>
          <p className={`${muted} whitespace-pre-wrap`}>{item.description || '未提供描述。'}</p>
          <p className={muted}>类型：{item.kind === 'knowledge' ? '知识库' : '能力'} · 提供设备：{devices.find((device) => device.id === item.deviceId)?.name ?? item.deviceId}</p>
          <p className={muted}>发布标识：{item.id} · 设备标识：{item.deviceId}</p>
          <p className={muted}>来源声明：{item.sourceMode === 'server' ? '服务器' : '设备'}（仅描述来源，不代表内容已同步或可取用）</p>
          <p className={muted}>发布时间：<time dateTime={item.createdAt}>{item.createdAt}</time> · 更新时间：<time dateTime={item.updatedAt}>{item.updatedAt}</time></p>
           {item.kind === 'knowledge' && <div className="space-y-2"><h3 className="text-sm font-semibold">知识权限声明（各自独立，未执行授权校验）</h3><div className="flex flex-wrap gap-3 text-sm"><span>搜索：{item.permissions.search ? '声明允许' : '未声明允许'}</span><span>读取原文：{item.permissions.read ? '声明允许' : '未声明允许'}</span><span>下载：{item.permissions.download ? '声明允许' : '未声明允许'}</span></div></div>}
           {item.status === 'published' && <Button variant="danger" size="sm" disabled={Boolean(pending)} onClick={() => void revoke(item)}>{pending === item.id ? '撤销中…' : '撤销发布'}</Button>}
         </article>)}
      </>
    })()}
  </>
}
