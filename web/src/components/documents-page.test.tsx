import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { DocumentsPage } from './documents-page'
import { setLanguage } from '../lib/i18n'

afterEach(() => { cleanup(); setLanguage('zh-CN'); delete window.DocsAPI; vi.unstubAllGlobals() })

it('shows disabled Office without offering an upload', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false, maxBytes: 1024 }) }))
  render(<MemoryRouter><DocumentsPage /></MemoryRouter>)
  expect(await screen.findByText(/Office 尚未启用/)).toBeInTheDocument()
  expect(screen.queryByLabelText('上传 Office 文件')).not.toBeInTheDocument()
})

it('uploads DOCX and shows persisted documents and download links', async () => {
  let uploaded = false
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      uploaded = true
      return { ok: true, json: async () => ({ id: 'a' }) }
    }
    return { ok: true, json: async () => url.endsWith('/config') ? { enabled: true, formats: ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'], maxBytes: 20971520 } : { documents: uploaded ? [{ id: 'a', name: 'test.docx', revision: 1, state: 'saved', updatedAt: 1000 }] : [] } }
  })
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><DocumentsPage /></MemoryRouter>)
  const input = await screen.findByLabelText('上传 Office 文件')
  const file = new File(['content'], 'test.docx')
  fireEvent.change(input, { target: { files: [file] } })
  expect(await screen.findByText('test.docx')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '打开编辑器' })).toHaveAttribute('href', '/documents?document=a')
  expect(screen.getByRole('link', { name: '下载已保存版本' })).toHaveAttribute('href', '/api/v1/office/documents/a/download')
  expect(fetcher).toHaveBeenCalledWith('/api/v1/office/documents?name=test.docx', expect.objectContaining({ method: 'POST', body: file }))
})

it('embeds only the editor without duplicate title, save toolbar or version messages', async () => {
  window.DocsAPI = { DocEditor: class {
    constructor(_id: string, config: Record<string, unknown>) { (config.events as { onDocumentReady(): void }).onDocumentReady() }
    destroyEditor() {}
  } }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/editor')
    ? { config: {}, scriptUrl: 'http://192.168.0.23:8080/api.js' }
    : { id: 'a', name: 'slides.pptx', state: 'editing', revision: 1 } })))
  render(<MemoryRouter initialEntries={['/office/editor?document=a']}><DocumentsPage embedded /></MemoryRouter>)
  await waitFor(() => expect(document.documentElement.dataset.officeReady).toBe('true'))
  expect(screen.queryByRole('button', { name: '保存到服务器' })).not.toBeInTheDocument()
  expect(screen.queryByText(/已持久化版本/)).not.toBeInTheDocument()
  expect(screen.queryByText('slides.pptx')).not.toBeInTheDocument()
  fireEvent(window, new CustomEvent('gb-office-save-result', { detail: '版本 2 已保存到文件' }))
  expect(screen.getByRole('status')).toHaveTextContent('已保存到文件')
})

it('localizes document status, server errors and upload validation live, preserving filenames', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/config')
    ? { enabled: true, formats: ['docx'], maxBytes: 1024 }
    : { documents: [{ id: 'a', name: '中文.docx', originalName: '中文.doc', state: 'error', error: 'ONLYOFFICE 报告保存失败；保留最近成功版本', revision: 2, updatedAt: 1000 }] } })))
  render(<MemoryRouter><DocumentsPage /></MemoryRouter>)
  await screen.findByText('中文.docx')
  act(() => setLanguage('en'))
  expect(screen.getByText('中文.docx')).toBeInTheDocument()
  expect(screen.getByText(/Save failed · Persisted revision 2/)).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('ONLYOFFICE reported a save failure. The last saved version is retained.')
  fireEvent.change(screen.getByLabelText('Upload an Office file'), { target: { files: [new File(['bad'], '中文.txt')] } })
  expect(screen.getByText(/Supported formats: docx/)).toBeInTheDocument()
  act(() => setLanguage('zh-CN'))
  expect(screen.getByText(/支持 docx/)).toBeInTheDocument()
})

it.each([false, true])('preserves Desktop lifecycle and signed config (signed: %s)', async signed => {
  setLanguage('en')
  const destroy = vi.fn()
  const created = vi.fn()
  const launchConfig = { editorConfig: { lang: 'zh-CN', callbackUrl: 'http://192.168.0.23/callback' }, ...(signed ? { token: 'signed-token' } : {}) }
  window.DocsAPI = { DocEditor: class {
    constructor(_id: string, config: Record<string, unknown>) { created(config); (config.events as { onDocumentReady(): void }).onDocumentReady() }
    destroyEditor = destroy
  } }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/editor')
    ? { config: launchConfig, scriptUrl: 'http://192.168.0.23:8080/api.js' }
    : { id: 'a', name: '中文.pptx', state: 'editing', revision: 1 } })))
  const app = render(<MemoryRouter initialEntries={['/office/editor?document=a']}><DocumentsPage embedded /></MemoryRouter>)
  await waitFor(() => expect(document.documentElement.dataset.officeReady).toBe('true'))
  expect(created).toHaveBeenCalledWith(expect.objectContaining({ editorConfig: { ...launchConfig.editorConfig, lang: signed ? 'zh-CN' : 'en' } }))
  if (signed) expect(created.mock.calls[0][0].token).toBe('signed-token')
  expect(window.goodbuddyOffice).toBeDefined()
  fireEvent(window, new CustomEvent('gb-office-save-result', { detail: '版本 2 已保存到文件' }))
  expect(screen.getByRole('status')).toHaveTextContent('Revision 2 saved to file')
  act(() => setLanguage('zh-CN'))
  expect(screen.getByRole('status')).toHaveTextContent('版本 2 已保存到文件')
  expect(created).toHaveBeenCalledTimes(1)
  expect(destroy).not.toHaveBeenCalled()
  app.unmount()
  expect(destroy).toHaveBeenCalledOnce()
  expect(window.goodbuddyOffice).toBeUndefined()
})
