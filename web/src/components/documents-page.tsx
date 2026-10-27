import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { officeRequest, type EditorLaunch, type OfficeConfig, type OfficeDocument } from '../lib/office-api'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { installOfficeEditorBridge } from '../lib/office-editor-bridge'
import { useI18n } from '../lib/i18n'
import { localizedEditorConfig, localizedError, toError } from '../lib/localized-sharing'
import { OfficeAiDialog } from './office-ai-dialog'

type Editor = { destroyEditor(): void }
declare global {
  interface Window { DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => Editor } }
}
const states: Record<OfficeDocument['state'], [string, string]> = {
  saved: ['已保存', 'Saved'], closed: ['编辑已结束', 'Editing ended'], editing: ['正在编辑', 'Editing'], saving: ['正在保存', 'Saving'], recovering: ['重启后待确认', 'Awaiting confirmation after restart'], error: ['保存失败', 'Save failed']
}
const notices = {
  loading: ['正在加载编辑器…', 'Loading editor…'],
  ready: ['编辑器已就绪；服务器保存状态见下方版本记录。', 'The editor is ready. Check the revision record below for server save status.'],
  dirty: ['有编辑修改；请保存到服务器，或关闭编辑器后等待最终保存。', 'There are edits. Save to the server, or close the editor and wait for the final save.'],
  submitted: ['修改已交给编辑服务；以服务器版本记录为保存依据。', 'Changes were sent to the editor service. Check the server revision record to confirm saving.'],
  unchanged: ['编辑服务报告暂无新修改。', 'The editor service reports no new changes.'],
  saving: ['已请求服务器保存，正在等待保存回调…', 'Server save requested. Waiting for the save callback…'],
  reconcile: ['已请求核对轮次，状态更新后请重试连接。', 'Session reconciliation requested. Retry the connection after the status updates.']
} satisfies Record<string, [string, string]>

function DocumentEditor({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { t, language } = useI18n()
  // A locale change must not tear down an active Desktop editing session.
  const editorLanguage = useRef(language)
  const [document, setDocument] = useState<OfficeDocument>()
  const [error, setError] = useState<string | Error>('')
  const [message, setMessage] = useState<keyof typeof notices>('loading')
  const [retry, setRetry] = useState(0)
  const [desktopNotice, setDesktopNotice] = useState('')
  const [ready, setReady] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const focus = () => host.current?.querySelector('iframe')?.contentWindow?.focus()
    window.addEventListener('gb-office-focus-editor', focus)
    return () => window.removeEventListener('gb-office-focus-editor', focus)
  }, [])

  useEffect(() => {
    if (!embedded) return
    let timer: ReturnType<typeof setTimeout>
    const saved = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail
      if (typeof detail !== 'string') return
      setDesktopNotice(detail); clearTimeout(timer)
      timer = setTimeout(() => setDesktopNotice(''), 4000)
    }
    window.addEventListener('gb-office-save-result', saved)
    return () => { clearTimeout(timer); window.removeEventListener('gb-office-save-result', saved) }
  }, [embedded])

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
        if (embedded && !controller.signal.aborted) await window.goodbuddyOfficeSave?.persisted(result.revision)
      } catch (cause) {
        if (!controller.signal.aborted) setError(toError(cause))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => { void refresh() }, 2500)
      }
    }
    void refresh()
    void (async () => {
      try {
        const launch = await officeRequest<EditorLaunch>(`/documents/${id}/editor`, { method: 'POST', headers: { 'Accept-Language': editorLanguage.current }, signal: controller.signal })
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
          ...localizedEditorConfig(launch.config, editorLanguage.current), width: '100%', height: '100%', events: {
            onDocumentReady: () => { state.officeReady = 'true'; setReady(true); setMessage('ready') },
            onDocumentStateChange: (event: { data: boolean }) => {
              state.officeDirty = String(event.data)
              setMessage(event.data ? 'dirty' : 'submitted')
            },
            onError: (event: { data?: { errorDescription?: string } }) => setError(event.data?.errorDescription ?? '编辑器发生错误')
          }
        })
      } catch (cause) {
        if (!controller.signal.aborted) setError(toError(cause))
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
  }, [id, retry, embedded])

  return <section className={embedded ? 'relative flex h-screen w-full flex-col overflow-hidden' : undefined}>
    {!embedded && <PageHeader title={document?.name ?? t('在线文档', 'Online document')} description={t('文档主存储：ShareServer。关闭编辑器后，请在文档库确认最终保存状态。', 'Documents are stored on ShareServer. After closing the editor, confirm the final save status in the document library.')} action={<Link to="/documents">{t('关闭编辑器并返回文档库', 'Close editor and return to library')}</Link>} />}
    {!embedded && <><div className="mb-4 flex flex-wrap items-center gap-4">
      <span role="status">{document ? `${t(...states[document.state])} · ${t('已持久化版本 {revision}', 'Persisted revision {revision}', { revision: document.revision })}` : t('正在读取保存状态…', 'Loading save status…')}</span>
    </div>
    <p className="mb-4 text-sm text-[var(--text-muted)]">{t(...notices[message])}</p>
    {document?.originalName && <p>{t('由 {original} 转换为 {name}；下载的是转换后格式，原文件不会更新。请核对版式、公式和嵌入对象，宏不保留。', 'Converted from {original} to {name}. Downloads use the converted format; the original file is unchanged. Check layout, formulas and embedded objects. Macros are not preserved.', { original: document.originalName, name: document.name })}</p>}</>}
    {embedded && !ready && !error && <p role="status">{t(...notices.loading)}</p>}
    {embedded && desktopNotice && <p role="status" className="absolute bottom-3 right-3 z-10 rounded bg-[var(--panel)] px-3 py-2 text-sm shadow">{t(desktopNotice, /^版本 (\d+) 已保存到文件$/.test(desktopNotice) ? `Revision ${desktopNotice.match(/\d+/)?.[0]} saved to file` : 'Desktop reported a save result. Check the saved file and server revision status.')}</p>}
    {document?.error && <p role="alert">{localizedError(document.error)}</p>}
    {error && <div role="alert" className="mb-4">{localizedError(error)} <Button variant="secondary" onClick={() => { editorLanguage.current = language; setError(''); setReady(false); setRetry(retry + 1) }}>{t('重试连接', 'Retry connection')}</Button></div>}
    {document?.state === 'recovering' && <Button variant="secondary" onClick={() => {
      void officeRequest(`/documents/${id}/reconcile`, { method: 'POST' }).then(() => setMessage('reconcile')).catch(cause => setError(toError(cause)))
    }}>{t('核对编辑轮次', 'Reconcile editing session')}</Button>}
    <div ref={host} className={embedded ? 'min-h-0 flex-1' : 'h-[75vh] min-h-96'} aria-label={t('ONLYOFFICE 文档编辑器', 'ONLYOFFICE document editor')} />
    <OfficeAiDialog />
  </section>
}

export function DocumentsPage({ embedded = false }: { embedded?: boolean }) {
  const [search] = useSearchParams()
  const id = search.get('document')
  return id ? <DocumentEditor key={id} id={encodeURIComponent(id)} embedded={embedded} /> : <DocumentLibrary />
}

function DocumentLibrary() {
  const { t, formatDate } = useI18n()
  const [config, setConfig] = useState<OfficeConfig>()
  const [documents, setDocuments] = useState<OfficeDocument[]>([])
  const [error, setError] = useState<string | Error>('')
  const [invalidUpload, setInvalidUpload] = useState(false)
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
      } catch (cause) { if (!controller.signal.aborted) setError(toError(cause)) }
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
    if (!config.formats.includes(file.name.split('.').pop()!.toLowerCase()) || file.size > config.maxBytes) {
      setInvalidUpload(true); return
    }
    const controller = new AbortController()
    uploadController.current = controller
    setUploading(true); setError(''); setInvalidUpload(false)
    try {
      await officeRequest('/documents?name=' + encodeURIComponent(file.name), { method: 'POST', body: file, signal: controller.signal })
      setRetry(value => value + 1)
    } catch (cause) { if (!controller.signal.aborted) setError(toError(cause)) }
    finally { setUploading(false) }
  }

  return <section>
    <PageHeader title={t('文档与协作', 'Documents and collaboration')} description={t('上传 Office 文件在线编辑。DOC、XLS、PPT 转换为现代格式，原文件保持不变；请核对转换结果，宏不保留。当前适用于可信私有网络。', 'Upload Office files to edit online. DOC, XLS and PPT are converted to modern formats; originals remain unchanged. Check conversion results; macros are not preserved. Currently intended for trusted private networks.')} />
    {loading && <p role="status">{t('正在连接 Office 服务…', 'Connecting to the Office service…')}</p>}
    {error && <div role="alert">{localizedError(error)} <Button variant="secondary" onClick={() => setRetry(retry + 1)}>{t('刷新', 'Refresh')}</Button></div>}
    {invalidUpload && config && <p role="alert">{t('支持 {formats}，文件不得超过 {size} MiB', 'Supported formats: {formats}. Files must not exceed {size} MiB.', { formats: config.formats.join(', '), size: config.maxBytes / 1024 / 1024 })}</p>}
    {config && !config.enabled && <p>{t('Office 尚未启用，请按部署文档配置 ShareServer 和 ONLYOFFICE 服务。', 'Office is disabled. Follow the deployment guide to configure ShareServer and ONLYOFFICE.')}</p>}
    {config?.enabled && <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <label className="text-sm">{t('上传 Office 文件（最大 {size} MiB）', 'Upload an Office file (maximum {size} MiB)', { size: config.maxBytes / 1024 / 1024 })}
          <input aria-label={t('上传 Office 文件', 'Upload an Office file')} className="ml-3" type="file" accept={config.formats.map(format => `.${format}`).join(',')} disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} />
        </label>
        {uploading && <Button variant="secondary" onClick={() => uploadController.current?.abort()}>{t('取消上传', 'Cancel upload')}</Button>}
      </div>
      {!documents.length && !loading && <p>{t('暂无文档，上传 Office 文件开始编辑。', 'No documents yet. Upload an Office file to start editing.')}</p>}
      <ul className="space-y-4">{documents.map(document => <li key={document.id} className="rounded-lg border border-[var(--border-default)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="font-medium">{document.name}</h2><p className="mt-2 text-sm text-[var(--text-muted)]">{t(...states[document.state])} · {t('已持久化版本 {revision}', 'Persisted revision {revision}', { revision: document.revision })} · {formatDate(document.updatedAt * 1000)}</p></div>
          <div className="flex gap-4"><Link to={`/documents?document=${document.id}`}>{t('打开编辑器', 'Open editor')}</Link><a href={`/api/v1/office/documents/${document.id}/download`}>{t('下载已保存版本', 'Download saved version')}</a></div>
        </div>
        {document.error && <p role="alert">{localizedError(document.error)}</p>}
        {document.originalName && <p>{t('转换来源：{original}；下载为 {name}', 'Converted from: {original}; downloads as {name}', { original: document.originalName, name: document.name })}</p>}
      </li>)}</ul>
    </>}
  </section>
}
