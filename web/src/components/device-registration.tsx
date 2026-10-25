import { useEffect, useState } from 'react'
import type { Device } from '../../../shared/sharing'
import { sharingRequest } from '../lib/sharing-api'
import { Button } from './ui/button'

type Status = 'approved' | 'pending' | 'rejected' | 'disabled' | 'unregistered'
type Snapshot = { mode: 'open' | 'approval'; devices: (Device & { registrationStatus: Status })[] }
const labels: Record<Status, string> = { approved: '已接纳', pending: '待审批', rejected: '已拒绝', disabled: '已停用', unregistered: '等待客户端注册凭据' }

export function DeviceRegistration() {
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    sharingRequest<Snapshot>('/registration', controller.signal).then(value => {
      if (!controller.signal.aborted) { setSnapshot(value); setError('') }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(String(reason)) })
    return () => controller.abort()
  }, [attempt])
  async function change(path: string, method: string, body: unknown) {
    setBusy(true); setError('')
    try {
      await sharingRequest(path, undefined, method, body)
      setSnapshot(await sharingRequest<Snapshot>('/registration'))
    } catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--panel)] p-5" aria-label="设备注册设置">
    <h2 className="font-semibold">注册设置与审批</h2>
    <p>免验证自动接纳新设备；需要审批时，由管理员批准后接入。切换模式不改变已有设备和待审批申请。</p>
    {error && <p role="alert">{error}</p>}
    <Button variant="secondary" disabled={busy} onClick={() => setAttempt(v => v + 1)}>刷新注册状态</Button>
    {!snapshot && !error && <p role="status">正在读取注册设置…</p>}
    {snapshot && <>
      <label className="block">设备注册模式<select className="ml-3 rounded border border-[var(--border-default)] bg-[var(--control)] p-2" value={snapshot.mode} disabled={busy} onChange={e => void change('/registration', 'PUT', { mode: e.target.value })}>
        <option value="open">免验证（默认）</option><option value="approval">需要审批</option>
      </select></label>
      {snapshot.devices.length === 0 && <p>暂无设备注册申请。</p>}
      {snapshot.devices.map(device => <article key={device.id} className="space-y-2 border-t border-[var(--border-default)] pt-3">
        <h3>{device.name} · {labels[device.registrationStatus]}</h3><p className="break-all text-sm text-[var(--text-muted)]">{device.id} · {device.platform}</p>
        <div className="flex flex-wrap gap-2">
          {device.registrationStatus !== 'approved' && device.registrationStatus !== 'unregistered' && <Button disabled={busy} onClick={() => void change(`/devices/${encodeURIComponent(device.id)}/decision`, 'POST', { status: 'approved' })}>批准接入</Button>}
          {device.registrationStatus === 'pending' && <Button variant="secondary" disabled={busy} onClick={() => void change(`/devices/${encodeURIComponent(device.id)}/decision`, 'POST', { status: 'rejected' })}>拒绝申请</Button>}
          {device.registrationStatus === 'approved' && <Button variant="secondary" disabled={busy} onClick={() => void change(`/devices/${encodeURIComponent(device.id)}/decision`, 'POST', { status: 'disabled' })}>停用设备</Button>}
        </div>
      </article>)}
    </>}
  </section>
}
