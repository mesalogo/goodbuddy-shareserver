import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatewayAccessKey, GatewayAccessKeyCreated, GatewayAccessKeyInput, GatewayModel } from '../../../shared/gateway'
import { gatewayRequest } from '../lib/gateway-api'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'
import { useI18n } from '../lib/i18n'

export function GatewayAccessKeys({ models }: { models: GatewayModel[] }) {
  const { t, formatDate } = useI18n()
  const [keys, setKeys] = useState<GatewayAccessKey[] | null>(null)
  const [error, setError] = useState<'' | (() => string)>('')
  const [busy, setBusy] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [created, setCreated] = useState<GatewayAccessKeyCreated | null>(null)
  const [revoking, setRevoking] = useState<GatewayAccessKey | null>(null)
  const active = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    return gatewayRequest<{ accessKeys: GatewayAccessKey[] }>('/access-keys', controller.signal).then(data => {
      if (!controller.signal.aborted) setKeys(data.accessKeys)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(() => () => t('访问密钥加载失败：{error}', 'Failed to load access keys: {error}', { error: cause instanceof Error ? cause.message : t('请稍后重试。', 'Please try again later.') }))
    }).finally(() => {
      if (active.current === controller) active.current = null
      if (!controller.signal.aborted) setBusy(false)
    })
  }, [t])

  async function run(operation: 'create' | 'revoke', input?: GatewayAccessKeyInput, id?: string) {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    try {
      if (operation === 'create') {
        const data = await gatewayRequest<GatewayAccessKeyCreated>('/access-keys', controller.signal, 'POST', input)
        if (!controller.signal.aborted) {
          setKeys(previous => [...(previous ?? []), data.accessKey]); setCreated(data); setCreating(false)
        }
      } else {
        const data = await gatewayRequest<GatewayAccessKey>(`/access-keys/${encodeURIComponent(id!)}/revoke`, controller.signal, 'POST')
        if (!controller.signal.aborted) {
          setKeys(previous => previous?.map(key => key.id === data.id ? data : key) ?? []); setRevoking(null)
          setCreated(previous => previous?.accessKey.id === data.id ? null : previous)
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(() => () => t('{operation}失败：{error}', '{operation} failed: {error}', { operation: operation === 'create' ? t('创建访问密钥', 'Create access key') : t('撤销访问密钥', 'Revoke access key'), error: cause instanceof Error ? cause.message : t('请稍后重试。', 'Please try again later.') }))
    } finally {
      if (active.current === controller) active.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  function start(operation: 'load' | 'create' | 'revoke', input?: GatewayAccessKeyInput, id?: string) {
    if (active.current) return
    setBusy(true); setError('')
    if (operation === 'load') void load()
    else void run(operation, input, id)
  }

  useEffect(() => {
    void load()
    return () => { active.current?.abort(); active.current = null }
  }, [load])

  return <section className="space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5" aria-label={t('访问密钥', 'Access keys')}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t('访问密钥', 'Access keys')}</h2><div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => start('load')}>{t('刷新访问密钥', 'Refresh access keys')}</Button>
      <Button variant="secondary" disabled={busy || keys === null || !models.length || Boolean(created)} onClick={() => { setSelected([]); setError(''); setCreating(true) }}>{t('创建访问密钥', 'Create access key')}</Button>
    </div></div>
    <p className="text-sm leading-6 text-[var(--text-muted)]">{t('每个密钥只允许调用所选模型。原文仅在创建成功时显示一次，关闭后无法再次查看。撤销后使用该密钥的客户端将无法继续调用。', 'Each key can call only the selected models. The secret is shown once after creation and cannot be viewed again after closing. Revoking a key prevents clients using it from making further calls.')}</p>
    {busy && <p role="status">{t('正在处理访问密钥…', 'Processing access keys…')}</p>}
    {error && !creating && !revoking && <p role="alert" className="break-words">{error()}</p>}
    {keys?.length === 0 && <p className="text-sm text-[var(--text-muted)]">{t('暂无访问密钥。配置模型后创建。', 'No access keys yet. Configure models before creating a key.')}</p>}
    {keys?.map(key => <article key={key.id} className="space-y-2 border-t border-white/10 pt-4 text-sm">
      <h3 className="break-all font-semibold">{key.name}</h3>
      <p>{key.revokedAt ? t('已撤销', 'Revoked') : t('有效', 'Active')} · {t('创建于', 'Created')} <time dateTime={key.createdAt}>{formatDate(key.createdAt)}</time></p>
      <p className="break-all">{t('授权模型：', 'Authorized models: ')}{key.modelIds.map(id => models.find(model => model.id === id)?.alias ?? t('模型已不可用', 'Model unavailable')).join(t('、', ', '))}</p>
      {key.revokedAt ? <p>{t('撤销于', 'Revoked')} <time dateTime={key.revokedAt}>{formatDate(key.revokedAt)}</time></p> : <Button variant="secondary" disabled={busy} onClick={() => { setError(''); setRevoking(key) }}>{t('撤销密钥 {name}', 'Revoke key {name}', { name: key.name })}</Button>}
    </article>)}
    {created && <Dialog open title={t('访问密钥已创建', 'Access key created')} description={t('请立即将密钥填入客户端 API Key。关闭后无法再次查看；遗失时请撤销并重新创建。', 'Enter this key as the client API Key now. You cannot view it again after closing. If lost, revoke it and create a new one.')} onOpenChange={open => { if (!open) setCreated(null) }}>
      <label className="block text-sm">{t('新访问密钥', 'New access key')}<input readOnly autoComplete="off" value={created.key} onFocus={event => event.target.select()} className="mt-2 w-full min-w-0 rounded-lg bg-[var(--control)] p-2 font-mono text-sm" /></label>
      <Button variant="secondary" onClick={() => setCreated(null)}>{t('已保存，关闭密钥', 'Saved, close key')}</Button>
    </Dialog>}
    {creating && <Dialog open title={t('创建访问密钥', 'Create access key')} description={t('为客户端命名，并选择允许调用的模型。授权绑定模型记录，修改别名不会丢失授权。', 'Name the client and select the models it may call. Permissions are tied to model records and survive alias changes.')} onOpenChange={open => { if (!open && !busy) { setCreating(false); setError('') } }}>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        start('create', { name: String(form.get('name')).trim(), modelIds: selected })
      }}>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm">{t('密钥名称', 'Key name')}<input name="name" required maxLength={200} className="mt-1 w-full rounded-lg border border-white/10 bg-[var(--control)] p-2" /></label>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm">{t('授权模型（至少选择一个）', 'Authorized models (select at least one)')}</legend>{models.map(model => <label key={model.id} className="flex items-start gap-2 break-all text-sm"><input type="checkbox" checked={selected.includes(model.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, model.id] : previous.filter(id => id !== model.id))} />{model.alias}{model.displayName ? ` · ${model.displayName}` : ''}{!model.enabled ? t('（已停用）', ' (disabled)') : ''}</label>)}</fieldset>
        </fieldset>
        {error && <p role="alert" className="break-words">{error()}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => { setCreating(false); setError('') }}>{t('取消', 'Cancel')}</Button><Button type="submit" disabled={busy || !selected.length}>{busy ? t('正在创建…', 'Creating…') : t('确认创建', 'Confirm creation')}</Button></div>
      </form>
    </Dialog>}
    {revoking && <Dialog open title={t('撤销访问密钥', 'Revoke access key')} description={t('撤销「{name}」后，使用它的客户端将无法调用任何模型。此操作无法恢复。', 'After revoking “{name}”, clients using it cannot call any model. This action cannot be undone.', { name: revoking.name })} onOpenChange={open => { if (!open && !busy) { setRevoking(null); setError('') } }}>
      {error && <p role="alert" className="break-words">{error()}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => { setRevoking(null); setError('') }}>{t('取消', 'Cancel')}</Button><Button disabled={busy} onClick={() => start('revoke', undefined, revoking.id)}>{busy ? t('正在撤销…', 'Revoking…') : t('确认撤销', 'Confirm revocation')}</Button></div>
    </Dialog>}
  </section>
}
