import { useEffect, useState } from 'react'
import type { Device, RegistrationStatus } from '../../../shared/sharing'
import { sharingRequest } from '../lib/sharing-api'
import { Button } from './ui/button'
import { useI18n } from '../lib/i18n'
import { localizedError, toError } from '../lib/localized-sharing'

type Status = RegistrationStatus
type Snapshot = { mode: 'open' | 'approval'; devices: (Device & { registrationStatus: Status })[] }

export function DeviceRegistration({ deviceId, onChanged }: { deviceId?: string; onChanged?: () => void } = {}) {
  const { t } = useI18n()
  const labels: Record<Status, string> = { approved: t('已接纳', 'Approved'), pending: t('待审批', 'Pending approval'), rejected: t('已拒绝', 'Rejected'), disabled: t('已停用', 'Disabled'), unregistered: t('等待客户端注册凭据', 'Waiting for client registration credentials') }
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [error, setError] = useState<string | Error>('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    sharingRequest<Snapshot>('/registration', controller.signal).then(value => {
      if (!controller.signal.aborted) { setSnapshot(value); setError('') }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(toError(reason)) })
    return () => controller.abort()
  }, [attempt])
  async function change(path: string, method: string, body: unknown) {
    setBusy(true); setError('')
    try {
      await sharingRequest(path, undefined, method, body)
      setSnapshot(await sharingRequest<Snapshot>('/registration'))
      onChanged?.()
    } catch (reason) { setError(toError(reason)) }
    finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--panel)] p-5" aria-label={t('设备注册设置', 'Device registration settings')}>
    <h2 className="font-semibold">{t('注册设置与审批', 'Registration settings and approvals')}</h2>
    <p>{t('免验证自动接纳新设备；需要审批时，由管理员批准后接入。切换模式不改变已有设备和待审批申请。', 'Open registration automatically accepts new devices. Approval mode requires administrator approval. Switching modes does not change existing devices or pending requests.')}</p>
    {error && <p role="alert">{localizedError(error)}</p>}
    <Button variant="secondary" disabled={busy} onClick={() => setAttempt(v => v + 1)}>{t('刷新注册状态', 'Refresh registration status')}</Button>
    {!snapshot && !error && <p role="status">{t('正在读取注册设置…', 'Loading registration settings…')}</p>}
    {snapshot && <>
      {!deviceId && <label className="block">{t('设备注册模式', 'Device registration mode')}<select className="ml-3 rounded border border-[var(--border-default)] bg-[var(--control)] p-2" value={snapshot.mode} disabled={busy} onChange={e => void change('/registration', 'PUT', { mode: e.target.value })}>
        <option value="open">{t('免验证（默认）', 'Open (default)')}</option><option value="approval">{t('需要审批', 'Approval required')}</option>
      </select></label>}
      {snapshot.devices.length === 0 && <p>{t('暂无设备注册申请。', 'No device registration requests.')}</p>}
      {snapshot.devices.filter(device => !deviceId || device.id === deviceId).map(device => <article key={device.id} className="space-y-2 border-t border-[var(--border-default)] pt-3">
        <h3>{device.name} · {labels[device.registrationStatus]}</h3><p className="break-all text-sm text-[var(--text-muted)]">{device.id} · {device.platform}</p>
        <div className="flex flex-wrap gap-2">
          {device.registrationStatus !== 'approved' && device.registrationStatus !== 'unregistered' && <Button disabled={busy} onClick={() => void change(`/devices/${encodeURIComponent(device.id)}/decision`, 'POST', { status: 'approved' })}>{t('批准接入', 'Approve access')}</Button>}
          {device.registrationStatus === 'pending' && <Button variant="secondary" disabled={busy} onClick={() => void change(`/devices/${encodeURIComponent(device.id)}/decision`, 'POST', { status: 'rejected' })}>{t('拒绝申请', 'Reject request')}</Button>}
          {device.registrationStatus === 'approved' && <Button variant="secondary" disabled={busy} onClick={() => void change(`/devices/${encodeURIComponent(device.id)}/decision`, 'POST', { status: 'disabled' })}>{t('停用设备', 'Disable device')}</Button>}
        </div>
      </article>)}
    </>}
  </section>
}
