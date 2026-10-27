import { KeyRound, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { localizeAuthError, useAuth } from './auth-boundary'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

export function AccountMenu() {
  const auth = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  if (!auth) return null
  const close = () => {
    if (busy) return
    setEditing(false); setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setError('')
    trigger.current?.focus()
  }
  async function save() {
    setError(''); setSuccess(false)
    if (newPassword !== confirmation) { setError('两次输入的密码不一致。'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/v1/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })
      const result = await response.json()
      if (response.status === 401) window.dispatchEvent(new Event('shareserver-login-required'))
      if (!response.ok) throw new Error(result.message)
      setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setSuccess(true)
    } catch (e) { setError(e instanceof Error ? e.message : '无法连接服务器。') }
    finally { setBusy(false) }
  }
  const control = 'w-full rounded-md border border-[var(--border-control)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'
  return <>
    <div ref={root} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }}>
      <Button ref={trigger} size="icon" variant="ghost" className="rounded-full" aria-label={t('账户菜单', 'Account menu')} aria-expanded={open} aria-controls="account-actions" title={auth.username} onClick={() => setOpen(value => !value)}>
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-[var(--accent-subtle)] text-sm font-semibold text-[var(--accent)]">{auth.username.slice(0, 2).toUpperCase()}</span>
      </Button>
      {open && <div id="account-actions" className="absolute right-0 top-full z-40 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--border-default)] bg-[var(--panel)] p-1 shadow-[var(--shadow-dialog)]">
        <div className="border-b border-[var(--border-default)] px-3 py-3"><p className="truncate text-sm font-medium" title={auth.username}>{auth.username}</p><p className="text-xs text-[var(--text-muted)]">{t('管理员', 'Administrator')}</p></div>
        <Button variant="ghost" className="mt-1 w-full justify-start" onClick={() => { setOpen(false); setError(''); setSuccess(false); setEditing(true) }}><KeyRound aria-hidden="true" className="size-4" />{t('修改密码', 'Change password')}</Button>
        <Button variant="ghost" className="w-full justify-start" disabled={busy} onClick={() => {
          setBusy(true); setError('')
          void auth.logout().catch(() => setError('退出失败，请检查网络后重试。')).finally(() => setBusy(false))
        }}><LogOut aria-hidden="true" className="size-4" />{busy ? t('正在退出…', 'Logging out…') : t('退出登录', 'Log out')}</Button>
        {error && <p role="alert" className="px-3 py-2 text-sm text-[var(--danger)]">{localizeAuthError(error)}</p>}
      </div>}
    </div>
    <Dialog open={editing} onOpenChange={value => { if (!value) close() }} title={t('修改密码', 'Change password')} description={t('新密码至少 12 位。修改成功后，其他登录会话将失效。', 'Use at least 12 characters. Changing your password signs out other sessions.')} width="max-w-md">
      {success ? <div className="space-y-4"><p role="status">{t('密码已修改，当前会话保持登录。', 'Password changed. You remain signed in on this session.')}</p><Button onClick={close}>{t('完成', 'Done')}</Button></div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save() }}>
        <input type="text" autoComplete="username" value={auth.username} readOnly hidden />
        <label className="block space-y-2 text-sm"><span>{t('当前密码', 'Current password')}</span><input className={control} type="password" autoComplete="current-password" required maxLength={1024} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} disabled={busy} /></label>
        <label className="block space-y-2 text-sm"><span>{t('新密码', 'New password')}</span><input className={control} type="password" autoComplete="new-password" required minLength={12} maxLength={1024} value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={busy} /></label>
        <label className="block space-y-2 text-sm"><span>{t('确认新密码', 'Confirm new password')}</span><input className={control} type="password" autoComplete="new-password" required minLength={12} maxLength={1024} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label>
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{localizeAuthError(error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={close}>{t('取消', 'Cancel')}</Button><Button type="submit" disabled={busy}>{busy ? t('正在保存…', 'Saving…') : t('保存密码', 'Save password')}</Button></div>
      </form>}
    </Dialog>
  </>
}
