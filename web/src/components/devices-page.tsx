import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Device, Publication } from '../../../shared/sharing'
import { sharingRequest } from '../lib/sharing-api'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { StatusBadge } from './ui/status-badge'
import { PageTabs } from './page-tabs'

const panel = 'space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5'
const muted = 'text-sm leading-6 text-[var(--text-muted)]'
const control = 'mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-[var(--control)] p-2 text-sm text-[var(--text-primary)] focus-visible:outline-2'

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'loaded'; devices: Device[]; publications: Publication[] }

export function DevicesPage() {
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
      if (!controller.signal.aborted) setState({ status: 'error', message: error instanceof Error ? error.message : '网络请求失败' })
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
    <PageHeader eyebrow="本地服务目录 · 只读" title="GoodBuddy 接入" description="查看已登记的 GoodBuddy 设备及其发布的共享目录元数据。当前没有在线状态、身份认证或设备管理 API。" action={<Button variant="secondary" onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }} disabled={state.status === 'loading'}>刷新目录</Button>} />
    <PageTabs title="GoodBuddy 接入" active={activeTab} onChange={setActiveTab} tabs={[{ key: 'list', label: '设备列表' }, { key: 'detail', label: '设备详情' }, { key: 'connections', label: '连接记录' }, { key: 'revocations', label: '撤销记录' }]} />
    {activeTab !== 'list' && <section className={panel}><h2 className="font-semibold">{activeTab === 'detail' ? '设备详情' : activeTab === 'connections' ? '连接记录' : '撤销记录'}</h2><p className={muted}>该 Tab 的生产接口尚未接入。当前服务只提供设备登记元数据，暂不显示在线状态、连接心跳或撤销结果。</p></section>}
    {state.status === 'loading' && <p role="status" className={muted}>正在加载登记设备…</p>}
    {state.status === 'error' && <section className={panel}><h2 className="font-semibold">设备目录加载失败</h2><p className={`${muted} break-words`}>{state.message}</p><Button variant="secondary" onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }}>重试</Button></section>}
    {state.status === 'loaded' && activeTab === 'list' && <>
      <section className={panel}>
        <label className="block text-sm">搜索设备<input className={control} value={query} placeholder="名称、平台、版本或设备标识" onChange={(event) => { const next = new URLSearchParams(params); if (event.target.value) next.set('q', event.target.value); else next.delete('q'); setParams(next, { replace: true }) }} /></label>
        <p role="status" className={muted}>当前登记设备：{state.devices.length} 台。登记记录不代表设备在线。</p>
      </section>
      {!state.devices.length ? <section className={panel}><h2 className="font-semibold">尚无登记设备</h2><p className={muted}>请在 GoodBuddy 的“设备共享（技术预览）”中开启功能并连接此服务。</p></section> : <section className="grid gap-4 lg:grid-cols-2" aria-label="登记设备列表">
        {state.devices.filter((device) => [device.name, device.id, device.platform, device.appVersion].join(' ').toLowerCase().includes(query.trim().toLowerCase())).map((device) => {
          const count = state.publications.filter((item) => item.deviceId === device.id).length
          return <article key={device.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[var(--text-strong)]">{device.name}</h2><p className={muted}>{device.platform} · {device.appVersion}</p></div><StatusBadge status="已登记" tone="neutral" /></div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className={muted}>设备标识</dt><dd className="break-all">{device.id}</dd></div><div><dt className={muted}>共享记录</dt><dd>{count} 项</dd></div><div><dt className={muted}>登记时间</dt><dd><time dateTime={device.registeredAt}>{device.registeredAt}</time></dd></div><div><dt className={muted}>最近登记</dt><dd><time dateTime={device.updatedAt}>{device.updatedAt}</time></dd></div></dl>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => selectDevice(device.id)}>查看详情</Button><Link className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm underline underline-offset-4" to={`/capabilities?view=local&device=${encodeURIComponent(device.id)}`}>查看共享内容</Link></div>
          </article>
        })}
      </section>}
      {query && !state.devices.some((device) => [device.name, device.id, device.platform, device.appVersion].join(' ').toLowerCase().includes(query.trim().toLowerCase())) && <section className={panel}><h2 className="font-semibold">没有符合条件的设备</h2><p className={muted}>请调整搜索条件。</p></section>}
    </>}
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) selectDevice('') }} title={selected?.name ?? '设备详情'} description="以下信息来自本地登记记录，不代表在线连接或设备所有权。">
      {selected && <div className="space-y-4"><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className={muted}>设备标识</dt><dd className="break-all">{selected.id}</dd></div><div><dt className={muted}>平台</dt><dd>{selected.platform}</dd></div><div><dt className={muted}>应用版本</dt><dd>{selected.appVersion}</dd></div><div><dt className={muted}>登记时间</dt><dd>{selected.registeredAt}</dd></div></dl><Link className="inline-flex min-h-9 items-center rounded-lg bg-cyan-400 px-3 text-sm font-medium text-slate-950" to={`/capabilities?view=local&device=${encodeURIComponent(selected.id)}`} onClick={() => selectDevice('')}>查看此设备的共享内容</Link></div>}
    </Dialog>
  </>
}
