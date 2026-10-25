import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { DocumentsPage } from './documents-page'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('shows disabled Office without offering an upload', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false, maxBytes: 1024 }) }))
  render(<MemoryRouter><DocumentsPage /></MemoryRouter>)
  expect(await screen.findByText(/Office 尚未启用/)).toBeInTheDocument()
  expect(screen.queryByLabelText('上传 DOCX')).not.toBeInTheDocument()
})

it('uploads DOCX and shows persisted documents and download links', async () => {
  let uploaded = false
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      uploaded = true
      return { ok: true, json: async () => ({ id: 'a' }) }
    }
    return { ok: true, json: async () => url.endsWith('/config') ? { enabled: true, maxBytes: 20971520 } : { documents: uploaded ? [{ id: 'a', name: 'test.docx', revision: 1, state: 'saved', updatedAt: 1000 }] : [] } }
  })
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><DocumentsPage /></MemoryRouter>)
  const input = await screen.findByLabelText('上传 DOCX')
  const file = new File(['content'], 'test.docx')
  fireEvent.change(input, { target: { files: [file] } })
  expect(await screen.findByText('test.docx')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '打开编辑器' })).toHaveAttribute('href', '/documents?document=a')
  expect(screen.getByRole('link', { name: '下载已保存版本' })).toHaveAttribute('href', '/api/v1/office/documents/a/download')
  expect(fetcher).toHaveBeenCalledWith('/api/v1/office/documents?name=test.docx', expect.objectContaining({ method: 'POST', body: file }))
})
