import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { officeRequest, type EditorLaunch, type OfficeConfig, type OfficeDocument } from '../lib/office-api'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { installOfficeEditorBridge } from '../lib/office-editor-bridge'

type Editor = { destroyEditor(): void }
declare global {
  interface Window { DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => Editor } }
}
const states: Record<OfficeDocument['state'], string> = {
  saved: '已保存', closed: '编辑已结束', editing: '正在编辑', saving: '正在保存', recovering: '重启后待确认', error: '保存失败'
}

function DocumentEditor({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const [document, setDocument] = useState<OfficeDocument>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('正在加载编辑器…')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    const removeBridge = installOfficeEditorBridge()
    let editor: Editor | undefined
    let script: HTMLScriptElement | undefined
    let timer: ReturnType<typeof setTimeout>
    const state = window.document.documentElement.dataset
    state.officeReady = 'false'
    state.officeDirty = 'false'
    const refresh = async () => {
      try {
        const result = await officeRequest<OfficeDocument>(`/documents/${id}`, { signal: controller.signal })
        setDocument(result)
      } catch (cause) {
        if (!controller.signal.aborted) setError(String(cause))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => { void refresh() }, 2500)
      }
    }
    void refresh()
    void (async () => {
      try {
        const launch = await officeRequest<EditorLaunch>(`/documents/${id}/editor`, { method: 'POST', signal: controller.signal })
        if (window.location.protocol === 'https:' && new URL(launch.scriptUrl).protocol !== 'https:') throw new Error('HTTPS 页面需要配置 HTTPS 的 ONLYOFFICE 地址')
        if (!window.DocsAPI) {
          await new Promise<void>((resolve, reject) => {
            script = window.document.createElement('script')
            script.src = launch.scriptUrl
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('无法加载 ONLYOFFICE，请检查编辑服务地址'))
            window.document.head.appendChild(script)
          })
        }
        if (controller.signal.aborted || !host.current) return
        if (!window.DocsAPI) throw new Error('ONLYOFFICE 编辑器 API 未就绪')
        const target = window.document.createElement('div')
        target.id = 'office-editor'
        host.current.replaceChildren(target)
        editor = new window.DocsAPI.DocEditor(target.id, {
          ...launch.config, width: '100%', height: '100%', events: {
            onDocumentReady: () => { state.officeReady = 'true'; setMessage('编辑器已就绪；服务器保存状态见下方版本记录。') },
            onDocumentStateChange: (event: { data: boolean }) => {
              state.officeDirty = String(event.data)
              setMessage(event.data ? '有编辑修改；请保存到服务器，或关闭编辑器后等待最终保存。' : '修改已交给编辑服务；以服务器版本记录为保存依据。')
            },
            onError: (event: { data?: { errorDescription?: string } }) => setError(event.data?.errorDescription ?? '编辑器发生错误')
          }
        })
      } catch (cause) {
        if (!controller.signal.aborted) setError(String(cause))
      }
    })()
    return () => {
      controller.abort()
      removeBridge()
      clearTimeout(timer)
      editor?.destroyEditor()
      script?.remove()
      delete state.officeReady
      delete state.officeDirty
    }
  }, [id, retry])

  async function save() {
    setBusy(true); setError('')
    try {
      const result = await officeRequest<{ noChanges: boolean }>(`/documents/${id}/save`, { method: 'POST' })
      setMessage(result.noChanges ? '编辑服务报告暂无新修改。' : '已请求服务器保存，正在等待保存回调…')
    } catch (cause) { setError(String(cause)) }
    finally { setBusy(false) }
  }

  return <section className={embedded ? 'flex h-screen flex-col p-2' : undefined}>
    {!embedded && <PageHeader title={document?.name ?? '在线文档'} description="文档主存储：ShareServer。关闭编辑器后，请在文档库确认最终保存状态。" action={<Link to="/documents">关闭编辑器并返回文档库</Link>} />}
    <div className="mb-4 flex flex-wrap items-center gap-4">
      <Button onClick={() => void save()} disabled={busy || document?.state !== 'editing'}>保存到服务器</Button>
      <span role="status">{document ? `${states[document.state]} · 已持久化版本 ${document.revision}` : '正在读取保存状态…'}</span>
    </div>
    <p className="mb-4 text-sm text-[var(--text-muted)]">{message}</p>
    {document?.error && <p role="alert">{document.error}</p>}
    {error && <div role="alert" className="mb-4">{error} <Button variant="secondary" onClick={() => { setError(''); setRetry(retry + 1) }}>重试连接</Button></div>}
    {document?.state === 'recovering' && <Button variant="secondary" onClick={() => {
      void officeRequest(`/documents/${id}/reconcile`, { method: 'POST' }).then(() => setMessage('已请求核对轮次，状态更新后请重试连接。')).catch(cause => setError(String(cause)))
    }}>核对编辑轮次</Button>}
    <div ref={host} className={embedded ? 'min-h-0 flex-1' : 'h-[75vh] min-h-96'} aria-label="ONLYOFFICE 文档编辑器" />
  </section>
}

export function DocumentsPage({ embedded = false }: { embedded?: boolean }) {
  const [search] = useSearchParams()
  const id = search.get('document')
  return id ? <DocumentEditor key={id} id={encodeURIComponent(id)} embedded={embedded} /> : <DocumentLibrary />
}

function DocumentLibrary() {
  const [config, setConfig] = useState<OfficeConfig>()
  const [documents, setDocuments] = useState<OfficeDocument[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [retry, setRetry] = useState(0)
  const uploadController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const next = await officeRequest<OfficeConfig>('/config', { signal: controller.signal })
        setConfig(next)
        if (next.enabled) {
          const result = await officeRequest<{ documents: OfficeDocument[] }>('/documents', { signal: controller.signal })
          setDocuments(result.documents)
        }
        setError('')
      } catch (cause) { if (!controller.signal.aborted) setError(String(cause)) }
      finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          timer = setTimeout(() => { void refresh() }, 5000)
        }
      }
    }
    void refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [retry])
  useEffect(() => () => uploadController.current?.abort(), [])

  async function upload(file?: File) {
    if (!file || !config) return
    if (!file.name.toLowerCase().endsWith('.docx') || file.size > config.maxBytes) {
      setError(`仅支持不超过 ${config.maxBytes / 1024 / 1024} MiB 的 DOCX 文件`); return
    }
    const controller = new AbortController()
    uploadController.current = controller
    setUploading(true); setError('')
    try {
      await officeRequest('/documents?name=' + encodeURIComponent(file.name), { method: 'POST', body: file, signal: controller.signal })
      setRetry(value => value + 1)
    } catch (cause) { if (!controller.signal.aborted) setError(String(cause)) }
    finally { setUploading(false) }
  }

  return <section>
    <PageHeader title="文档与协作" description="上传 DOCX，在 ONLYOFFICE 中编辑并保存到 ShareServer。当前为可信私有网络试用，尚无用户与组织权限隔离。" />
    {loading && <p role="status">正在连接 Office 服务…</p>}
    {error && <div role="alert">{error} <Button variant="secondary" onClick={() => setRetry(retry + 1)}>刷新</Button></div>}
    {config && !config.enabled && <p>Office 尚未启用，请按部署文档配置 FastAPI 和 ONLYOFFICE 服务。</p>}
    {config?.enabled && <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="text-sm">上传 DOCX（最大 {config.maxBytes / 1024 / 1024} MiB）
          <input aria-label="上传 DOCX" className="ml-3" type="file" accept=".docx" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
        </label>
        {uploading && <Button variant="secondary" onClick={() => uploadController.current?.abort()}>取消上传</Button>}
      </div>
      {!documents.length && !loading && <p>暂无文档，上传第一个 DOCX 开始编辑。</p>}
      <ul className="space-y-4">{documents.map(document => <li key={document.id} className="rounded-lg border border-[var(--border-default)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-medium">{document.name}</h2><p className="mt-2 text-sm text-[var(--text-muted)]">{states[document.state]} · 已持久化版本 {document.revision} · {new Date(document.updatedAt * 1000).toLocaleString()}</p></div>
          <div className="flex gap-4"><Link to={`/documents?document=${document.id}`}>打开编辑器</Link><a href={`/api/v1/office/documents/${document.id}/download`}>下载已保存版本</a></div>
        </div>
        {document.error && <p role="alert">{document.error}</p>}
      </li>)}</ul>
    </>}
  </section>
}
