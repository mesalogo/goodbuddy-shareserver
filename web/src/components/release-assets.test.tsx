import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ReleaseAssets } from './release-assets'
import { setLanguage } from '../lib/i18n'

afterEach(() => { cleanup(); setLanguage('zh-CN'); vi.unstubAllGlobals() })
const sha256 = 'a'.repeat(64)
const asset = { url: `/api/v1/console-assets/${sha256}?name=release.zip`, sha256, name: 'release.zip', size: 3 }
function select(file = new File(['zip'], 'release.zip')) {
  fireEvent.change(screen.getByLabelText('选择发布文件'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: '上传资源' }))
}

it('uploads File FormData with adminFetch, reports progress and attaches structured metadata', async () => {
  let resolve!: (response: unknown) => void
  const fetcher = vi.fn(() => new Promise(done => { resolve = done }))
  vi.stubGlobal('fetch', fetcher)
  const onAttach = vi.fn()
  render(<ReleaseAssets onAttach={onAttach} />)
  select()
  expect(screen.getByRole('progressbar', { name: '正在上传' })).toBeInTheDocument()
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/v1/console-assets')
  expect(init.credentials).toBe('same-origin')
  expect(init.headers).toBeUndefined()
  expect((init.body as FormData).get('file')).toBeInstanceOf(File)
  await act(async () => resolve({ ok: true, json: async () => asset }))
  expect(onAttach).toHaveBeenCalledWith({ url: asset.url, sha256, name: asset.name })
  expect(screen.getByLabelText('资源 URL')).toHaveValue(asset.url)
  expect(screen.getByLabelText('SHA-256')).toHaveValue(sha256)
  expect(screen.getByRole('link', { name: '下载资源' })).toHaveAttribute('href', asset.url)
  act(() => setLanguage('en'))
  expect(screen.getByRole('link', { name: 'Download asset' })).toHaveAttribute('download', asset.name)
  expect(screen.getByText(/Files are stored only/)).toBeInTheDocument()
})

it('rejects oversized files locally and translates errors live', async () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  render(<ReleaseAssets />)
  const file = new File(['x'], 'large.zip')
  Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 + 1 })
  select(file)
  expect(screen.getByRole('alert')).toHaveTextContent('文件最大为 20 MiB')
  act(() => setLanguage('en'))
  expect(screen.getByRole('alert')).toHaveTextContent('Maximum file size is 20 MiB')
  expect(fetcher).not.toHaveBeenCalled()
})

it('dispatches expired-session event and supports retry after server and network errors', async () => {
  const listener = vi.fn()
  window.addEventListener('shareserver-login-required', listener)
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, json: async () => asset })
  vi.stubGlobal('fetch', fetcher)
  render(<ReleaseAssets />)
  select()
  expect(await screen.findByRole('alert')).toHaveTextContent('登录已过期')
  expect(listener).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '上传资源' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('上传失败'))
  fireEvent.click(screen.getByRole('button', { name: '上传资源' }))
  await screen.findByRole('link', { name: '下载资源' })
  window.removeEventListener('shareserver-login-required', listener)
})

it('cancels pending uploads and ignores late results', async () => {
  let resolve!: (response: unknown) => void
  const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>(() => new Promise(done => { resolve = done }))
  vi.stubGlobal('fetch', fetcher)
  const onAttach = vi.fn()
  render(<ReleaseAssets onAttach={onAttach} />)
  select()
  fireEvent.click(screen.getByRole('button', { name: '取消上传' }))
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  await act(async () => resolve({ ok: true, json: async () => asset }))
  expect(onAttach).not.toHaveBeenCalled()
  expect(screen.getByRole('status')).toHaveTextContent('已取消上传')
})

it('rejects unexpected external download URLs', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...asset, url: 'https://example.com/asset' }) })))
  const onAttach = vi.fn()
  render(<ReleaseAssets onAttach={onAttach} />)
  select()
  expect(await screen.findByRole('alert')).toHaveTextContent('上传失败')
  expect(onAttach).not.toHaveBeenCalled()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
