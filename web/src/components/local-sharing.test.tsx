import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Device, Publication } from '../../../shared/sharing'
import { SharingCenter } from './sharing-center'

const devices: Device[] = [
  { id: 'real-a', name: '本机工作站', platform: 'win32', appVersion: '1.2.3', registeredAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z' },
  { id: 'real-b', name: '资料设备', platform: 'linux', appVersion: '1.2.4', registeredAt: '2026-10-01T08:30:00.000Z', updatedAt: '2026-10-01T08:30:00.000Z' }
]
const publications: Publication[] = [
  { id: 'pub-a', deviceId: 'real-a', name: '本地分析能力', kind: 'capability', description: '处理 CSV 元数据', sourceMode: 'device', status: 'published', permissions: { search: false, read: false, download: false }, createdAt: devices[0].registeredAt, updatedAt: devices[0].updatedAt },
  { id: 'pub-b', deviceId: 'real-b', name: '已撤销资料', kind: 'knowledge', description: '预算说明', sourceMode: 'server', status: 'revoked', permissions: { search: true, read: false, download: true }, createdAt: devices[1].registeredAt, updatedAt: devices[1].updatedAt },
  { id: 'pub-c', deviceId: 'real-a', name: '本地手册', kind: 'knowledge', description: '操作参考', sourceMode: 'device', status: 'published', permissions: { search: false, read: true, download: false }, createdAt: devices[0].registeredAt, updatedAt: devices[0].updatedAt }
]
const response = (data: unknown) => ({ ok: true, json: async () => data })
function mockDirectory(deviceRows = devices, publicationRows = publications) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url === '/api/v1/sharing/devices') return response({ devices: deviceRows })
    if (url === '/api/v1/sharing/publications') return response({ publications: publicationRows })
    throw new Error(`Unexpected request: ${url}`)
  })
}
function mount() { return render(<BrowserRouter><SharingCenter /></BrowserRouter>) }

describe('local sharing directory', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/capabilities?view=local')
    vi.stubGlobal('fetch', mockDirectory())
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('loads real metadata, registration times, revoked records and independent permission declarations', async () => {
    mount()
    expect(screen.getByRole('status')).toHaveTextContent('正在加载')
    expect(screen.getByRole('button', { name: '刷新目录' })).toBeDisabled()
    await screen.findByRole('heading', { name: '本机工作站' })
    expect(fetch).toHaveBeenCalledTimes(2)
    for (const resource of ['devices', 'publications']) expect(fetch).toHaveBeenCalledWith(`/api/v1/sharing/${resource}`, { signal: expect.any(AbortSignal) })
    const deviceList = screen.getByRole('region', { name: '真实登记设备' })
    expect(within(deviceList).getByText('2026-10-01T08:00:00.000Z')).toHaveAttribute('datetime', devices[0].registeredAt)
    expect(within(deviceList).queryByText(/在线|离线/)).not.toBeInTheDocument()
    const revoked = screen.getByRole('heading', { name: '已撤销资料' }).closest('article')!
    for (const text of ['已撤销', '预算说明', '搜索：声明允许', '读取原文：未声明允许', '下载：声明允许']) expect(within(revoked).getByText(text)).toBeInTheDocument()
    expect(within(revoked).getByText(/来源声明：服务器/)).toBeInTheDocument()
    expect(screen.queryByText(/当前示例访问者/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '撤销发布' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^(发布|登记|下载)/ })).not.toBeInTheDocument()
  })

  it('combines device, kind, search and status filters, restores URL state and clears no results', async () => {
    const app = mount()
    await screen.findByRole('heading', { name: '本机工作站' })
    fireEvent.change(screen.getByLabelText('登记设备'), { target: { value: 'real-a' } })
    fireEvent.change(screen.getByLabelText('共享类型'), { target: { value: 'knowledge' } })
    fireEvent.change(screen.getByLabelText('搜索本地元数据'), { target: { value: ' 操作参考 ' } })
    expect(screen.getByRole('status')).toHaveTextContent('1 项本地发布记录')
    expect(screen.getByRole('heading', { name: '本地手册' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '本地分析能力' })).not.toBeInTheDocument()
    app.unmount()
    mount()
    await screen.findByRole('heading', { name: '本地手册' })
    expect(screen.getByLabelText('登记设备')).toHaveValue('real-a')
    expect(screen.getByLabelText('共享类型')).toHaveValue('knowledge')
    expect(screen.getByLabelText('搜索本地元数据')).toHaveValue(' 操作参考 ')
    fireEvent.change(screen.getByLabelText('发布状态'), { target: { value: 'revoked' } })
    expect(screen.getByRole('heading', { name: '没有符合条件的本地记录' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(window.location.search).toBe('?view=local')
    expect(screen.getByRole('status')).toHaveTextContent('3 项本地发布记录')
    fireEvent.change(screen.getByLabelText('发布状态'), { target: { value: 'revoked' } })
    expect(screen.getByRole('status')).toHaveTextContent('1 项本地发布记录')
    expect(screen.getByRole('heading', { name: '已撤销资料' })).toBeInTheDocument()
  })

  it.each(['devices', 'publications'])('shows %s API error context and recovers on retry', async (resource) => {
    const fetchMock = mockDirectory()
    fetchMock.mockImplementationOnce(async (url: string) => url.endsWith(resource)
      ? { ok: false, status: 503, json: async () => ({ code: 'STORAGE_UNAVAILABLE', requestId: 'req-local' }) }
      : response({ devices }))
    if (resource === 'publications') fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 503, json: async () => ({ code: 'STORAGE_UNAVAILABLE', requestId: 'req-local' }) }))
    vi.stubGlobal('fetch', fetchMock)
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503')
    expect(screen.getByRole('alert')).toHaveTextContent('req-local')
    expect(screen.queryByRole('heading', { name: '本地分析能力' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '本地分析能力' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('handles network failure and an empty directory, then refreshes newly registered data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch')
    vi.stubGlobal('fetch', mockDirectory([], []))
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText(/尚无登记设备/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '尚无发布记录' })).toBeInTheDocument()
    vi.stubGlobal('fetch', mockDirectory())
    fireEvent.click(screen.getByRole('button', { name: '刷新目录' }))
    expect(await screen.findByRole('heading', { name: '本机工作站' })).toBeInTheDocument()
  })

  it('ignores obsolete fixture links and aborts pending loads when leaving', () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) => { signals.push(signal); return new Promise(() => {}) }))
    window.history.replaceState({}, '', '/capabilities?view=local&item=k-1')
    const app = mount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.queryByRole('link', { name: '设计规范归档' })).not.toBeInTheDocument()
    app.unmount()
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })
})
