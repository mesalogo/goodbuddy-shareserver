import { useEffect, useRef, useState } from 'react'
import type { Selection } from '../lib/office-editor-bridge'
import { Dialog } from './ui/dialog'
import { Button } from './ui/button'

const control = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--control)] p-2 text-[var(--text-primary)]'
const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
function CellGrid({ value, onChange, disabled = false }: { value: string; onChange?: (value: string) => void; disabled?: boolean }) {
  let cells: (string | number | boolean | null)[][]
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed) || !parsed.length || !parsed.every(row => Array.isArray(row) && row.length === parsed[0].length && row.every(cell => cell === null || ['string', 'number', 'boolean'].includes(typeof cell))) || !parsed[0].length || parsed.length * parsed[0].length > 400) throw new Error()
    cells = parsed
  } catch {
    return <div><p role="alert">表格回复格式无效，请重新生成或修正原始回复。</p>{onChange && <textarea aria-label="原始表格回复" className={control} value={value} maxLength={32000} onChange={e => onChange(e.target.value)} />}</div>
  }
  return <div className="max-h-64 overflow-auto rounded border border-[var(--border-default)]"><table className="w-full border-collapse text-sm" aria-label={onChange ? '修改结果' : '原单元格'}><tbody>{cells.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="border border-[var(--border-default)] p-1">{onChange ? <input className={`${control} min-w-28`} aria-label={`第 ${r + 1} 行第 ${c + 1} 列`} disabled={disabled} value={String(cell ?? '')} onChange={e => {
    const text = e.target.value
    cells[r][c] = typeof cell === 'number' && text.trim() && Number.isFinite(Number(text)) ? Number(text) : typeof cell === 'boolean' && /^(true|false)$/.test(text) ? text === 'true' : text
    onChange(JSON.stringify(cells))
  }} /> : <span className="whitespace-pre-wrap">{String(cell ?? '')}</span>}</td>)}</tr>)}</tbody></table></div>
}

function EditDialog({ selection, initialError, onClose }: { selection?: Selection; initialError?: string; onClose(): void }) {
  const cell = selection?.kind === 'cell'
  const [instruction, setInstruction] = useState(cell ? '整理所选单元格的文字，保持行列数及公式不变。' : '保持原意，优化选中文字的表达。')
  const [original, setOriginal] = useState(selection?.text ?? '')
  const [reply, setReply] = useState('')
  const [conversation, setConversation] = useState('')
  const [error, setError] = useState(initialError ?? '')
  const [working, setWorking] = useState(false)
  const [allowFormulas, setAllowFormulas] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [applying, setApplying] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    if (!window.goodbuddyOfficeAi) return
    void window.goodbuddyOfficeAi.request({ action: 'context' }).then(value => {
      if (alive.current) setConversation(value.conversationTitle ?? '')
    }).catch(cause => { if (alive.current) setError(message(cause)) })
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    if (!working || !requestId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await window.goodbuddyOfficeAi!.request({ action: 'result', requestId })
        if (cancelled) return
        if (result.state === 'error') throw new Error(result.text ?? '生成失败，请在对话中查看原因')
        if (result.state === 'complete') { setReply(result.text ?? ''); setWorking(false); return }
        timer = setTimeout(() => void poll(), 1000)
      } catch (cause) { if (!cancelled) { setError(message(cause)); setWorking(false) } }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [working, requestId])
  async function generate() {
    setWorking(true); setError(''); setReply(''); setRequestId('')
    try {
      const result = await window.goodbuddyOfficeAi!.request({ action: 'ask', instruction, allowFormulas })
      if (!alive.current) return
      if (!result.requestId) throw new Error('未收到生成请求编号')
      setRequestId(result.requestId); setOriginal(result.selectedText ?? original); setConversation(result.conversationTitle ?? conversation)
    } catch (cause) { if (alive.current) { setError(message(cause)); setWorking(false) } }
  }
  async function apply() {
    setApplying(true); setError('')
    try {
      const result = await window.goodbuddyOfficeAi!.request({ action: 'apply', requestId, text: reply, allowFormulas })
      if (result.applied !== true) throw new Error('编辑器未确认修改')
      if (alive.current) onClose()
    } catch (cause) { if (alive.current) setError(message(cause)) }
    finally { if (alive.current) setApplying(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !applying) onClose() }} title={cell ? 'AI 处理所选单元格' : 'AI 润色'} description="检查修改结果后应用；原文或选区改变时会拒绝覆盖，应用后可在编辑器中撤销。">
    <div className="space-y-3">
      {!window.goodbuddyOfficeAi && <p role="alert">请使用支持右键 AI 编辑的新版 GoodBuddy 打开此文档。</p>}
      {conversation && <p>对话：{conversation} · 使用此对话的 Runtime 和模型</p>}
      <details><summary>{cell ? '原单元格' : '原选区'}</summary>{cell ? <CellGrid value={original} /> : <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-sm">{original}</pre>}</details>
      <label className="block">修改要求<textarea aria-label="修改要求" className={control} value={instruction} rows={3} maxLength={4000} disabled={working || applying} onChange={e => setInstruction(e.target.value)} /></label>
      {cell && <label className="flex items-center gap-2"><input type="checkbox" checked={allowFormulas} disabled={working || applying} onChange={e => setAllowFormulas(e.target.checked)} />允许修改公式</label>}
      {working && <p role="status">正在当前对话中生成修改…</p>}
      {error && <p role="alert" className="break-words">{error}</p>}
      {reply && (cell ? <div><p className="mb-2">修改结果 · 可逐格调整</p><CellGrid value={reply} onChange={setReply} disabled={applying} /></div> : <label className="block">修改结果<textarea aria-label="修改结果" className={`${control} max-h-64`} rows={8} maxLength={32000} disabled={applying} value={reply} onChange={e => setReply(e.target.value)} /></label>)}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={applying} onClick={onClose}>关闭</Button>
        <Button variant="secondary" disabled={working || applying || !selection || !window.goodbuddyOfficeAi || !instruction.trim()} onClick={() => void generate()}>{reply ? '重新生成' : '开始润色'}</Button>
        {reply && <Button disabled={working || applying || !reply.trim()} onClick={() => void apply()}>{applying ? '正在应用…' : '应用到原选区'}</Button>}
      </div>
      {working && <p className="text-sm text-[var(--text-muted)]">关闭窗口后生成会在原对话中继续，可在对话中取消。</p>}
    </div>
  </Dialog>
}

export function OfficeAiDialog() {
  const [request, setRequest] = useState<{ key: number; selection?: Selection; error?: string }>()
  const sequence = useRef(0)
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (!detail || typeof detail !== 'object') return
      const selection = detail.selection
      if (selection && (typeof selection.text !== 'string' || selection.text.length > 32000 || !Number.isSafeInteger(selection.epoch))) return
      setRequest({ key: ++sequence.current, selection, error: typeof detail.error === 'string' ? detail.error : undefined })
    }
    window.addEventListener('gb-office-ai-open', open)
    return () => window.removeEventListener('gb-office-ai-open', open)
  }, [])
  return request ? <EditDialog key={request.key} selection={request.selection} initialError={request.error} onClose={() => {
    setRequest(undefined)
    requestAnimationFrame(() => window.dispatchEvent(new Event('gb-office-focus-editor')))
  }} /> : null
}
