import { useEffect, useRef, useState } from 'react'
import type { GatewayAccessKey, GatewayAccessKeyCreated, GatewayAccessKeyInput, GatewayModel } from '../../../shared/gateway'
import { gatewayRequest } from '../lib/gateway-api'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

export function GatewayAccessKeys({ models }: { models: GatewayModel[] }) {
  const [keys, setKeys] = useState<GatewayAccessKey[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [created, setCreated] = useState<GatewayAccessKeyCreated | null>(null)
  const [revoking, setRevoking] = useState<GatewayAccessKey | null>(null)
  const active = useRef<AbortController | null>(null)

  function load() {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    return gatewayRequest<{ accessKeys: GatewayAccessKey[] }>('/access-keys', controller.signal).then(data => {
      if (!controller.signal.aborted) setKeys(data.accessKeys)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(`访问密钥加载失败：${cause instanceof Error ? cause.message : '请稍后重试。'}`)
    }).finally(() => {
      if (active.current === controller) active.current = null
      if (!controller.signal.aborted) setBusy(false)
    })
  }

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
      if (!controller.signal.aborted) setError(`${{ load: '访问密钥加载', create: '创建访问密钥', revoke: '撤销访问密钥' }[operation]}失败：${cause instanceof Error ? cause.message : '请稍后重试。'}`)
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
  }, [])

  return <section className="space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5" aria-label="访问密钥">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">访问密钥</h2><div className="flex flex-wrap gap-2">
      <Button variant="secondary" disabled={busy} onClick={() => start('load')}>刷新访问密钥</Button>
      <Button variant="secondary" disabled={busy || keys === null || !models.length || Boolean(created)} onClick={() => { setSelected([]); setError(''); setCreating(true) }}>创建访问密钥</Button>
    </div></div>
    <p className="text-sm leading-6 text-[var(--text-muted)]">每个密钥只允许调用所选模型。原文仅在创建成功时显示一次，关闭后无法再次查看。撤销后使用该密钥的客户端将无法继续调用。</p>
    {busy && <p role="status">正在处理访问密钥…</p>}
    {error && !creating && !revoking && <p role="alert" className="break-words">{error}</p>}
    {keys?.length === 0 && <p className="text-sm text-[var(--text-muted)]">暂无访问密钥。配置模型后创建。</p>}
    {keys?.map(key => <article key={key.id} className="space-y-2 border-t border-white/10 pt-4 text-sm">
      <h3 className="break-all font-semibold">{key.name}</h3>
      <p>{key.revokedAt ? '已撤销' : '有效'} · 创建于 <time dateTime={key.createdAt}>{key.createdAt}</time></p>
      <p className="break-all">授权模型：{key.modelIds.map(id => models.find(model => model.id === id)?.alias ?? '模型已不可用').join('、')}</p>
      {key.revokedAt ? <p>撤销于 <time dateTime={key.revokedAt}>{key.revokedAt}</time></p> : <Button variant="secondary" disabled={busy} onClick={() => { setError(''); setRevoking(key) }}>撤销密钥 {key.name}</Button>}
    </article>)}
    {created && <Dialog open title="访问密钥已创建" description="请立即将密钥填入客户端 API Key。关闭后无法再次查看；遗失时请撤销并重新创建。" onOpenChange={open => { if (!open) setCreated(null) }}>
      <label className="block text-sm">新访问密钥<input readOnly autoComplete="off" value={created.key} onFocus={event => event.target.select()} className="mt-2 w-full min-w-0 rounded-lg bg-[var(--control)] p-2 font-mono text-sm" /></label>
      <Button variant="secondary" onClick={() => setCreated(null)}>已保存，关闭密钥</Button>
    </Dialog>}
    {creating && <Dialog open title="创建访问密钥" description="为客户端命名，并选择允许调用的模型。授权绑定模型记录，修改别名不会丢失授权。" onOpenChange={open => { if (!open && !busy) { setCreating(false); setError('') } }}>
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        start('create', { name: String(form.get('name')).trim(), modelIds: selected })
      }}>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm">密钥名称<input name="name" required maxLength={200} className="mt-1 w-full rounded-lg border border-white/10 bg-[var(--control)] p-2" /></label>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm">授权模型（至少选择一个）</legend>{models.map(model => <label key={model.id} className="flex items-start gap-2 break-all text-sm"><input type="checkbox" checked={selected.includes(model.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, model.id] : previous.filter(id => id !== model.id))} />{model.alias}{model.displayName ? ` · ${model.displayName}` : ''}{!model.enabled ? '（已停用）' : ''}</label>)}</fieldset>
        </fieldset>
        {error && <p role="alert" className="break-words">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => { setCreating(false); setError('') }}>取消</Button><Button type="submit" disabled={busy || !selected.length}>{busy ? '正在创建…' : '确认创建'}</Button></div>
      </form>
    </Dialog>}
    {revoking && <Dialog open title="撤销访问密钥" description={`撤销「${revoking.name}」后，使用它的客户端将无法调用任何模型。此操作无法恢复。`} onOpenChange={open => { if (!open && !busy) { setRevoking(null); setError('') } }}>
      {error && <p role="alert" className="break-words">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={() => { setRevoking(null); setError('') }}>取消</Button><Button disabled={busy} onClick={() => start('revoke', undefined, revoking.id)}>{busy ? '正在撤销…' : '确认撤销'}</Button></div>
    </Dialog>}
  </section>
}
