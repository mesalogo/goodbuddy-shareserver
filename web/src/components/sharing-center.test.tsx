import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

function emptyDirectory() {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url === '/api/v1/sharing/devices') return { ok: true, json: async () => ({ devices: [] }) }
    if (url === '/api/v1/sharing/publications') return { ok: true, json: async () => ({ publications: [] }) }
    throw new Error(`Unexpected request: ${url}`)
  })
}

describe('sharing center', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/capabilities')
    vi.stubGlobal('fetch', emptyDirectory())
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it.each(['', '?view=local', '?view=knowledge&item=k-1'])('loads the real directory without fixture tabs at /capabilities%s', async (search) => {
    window.history.replaceState({}, '', `/capabilities${search}`)
    render(<App />)
    expect(screen.getByRole('heading', { name: '共享中心' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '尚无发布记录' })).toBeInTheDocument()
    expect(screen.getByText(/尚无登记设备/)).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/设计规范归档|设计项目素材|GPU-Worker|MesaLab|当前示例访问者/)).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
    for (const resource of ['devices', 'publications']) {
      expect(fetch).toHaveBeenCalledWith(`/api/v1/sharing/${resource}`, { signal: expect.any(AbortSignal) })
    }
  })

  it('preserves local URL filters across mounting and editing', async () => {
    window.history.replaceState({}, '', '/capabilities?view=local&tab=knowledge&device=registered-device&status=revoked&q=manual')
    const app = render(<App />)
    await screen.findByRole('heading', { name: '尚无发布记录' })
    expect(screen.getByLabelText('登记设备')).toHaveValue('registered-device')
    expect(screen.getByLabelText('共享类型')).toHaveValue('knowledge')
    expect(screen.getByLabelText('共享类型')).toBeDisabled()
    expect(screen.getByRole('tab', { name: '共享知识库' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('发布状态')).toHaveValue('revoked')
    expect(screen.getByLabelText('搜索本地元数据')).toHaveValue('manual')
    fireEvent.change(screen.getByLabelText('搜索本地元数据'), { target: { value: 'updated' } })
    const params = new URLSearchParams(window.location.search)
    expect(params.get('device')).toBe('registered-device')
    expect(params.get('tab')).toBe('knowledge')
    expect(params.get('status')).toBe('revoked')
    expect(params.get('q')).toBe('updated')
    app.unmount()
    render(<App />)
    expect(await screen.findByLabelText('搜索本地元数据')).toHaveValue('updated')
    expect(screen.getByLabelText('登记设备')).toHaveValue('registered-device')
    expect(screen.getByLabelText('发布状态')).toHaveValue('revoked')
    expect(screen.getByLabelText('共享类型')).toHaveValue('knowledge')
    fireEvent.click(screen.getByRole('tab', { name: '能力目录' }))
    expect(await screen.findByLabelText('共享类型')).toHaveValue('capability')
    expect(screen.getByLabelText('共享类型')).toBeDisabled()
    expect(screen.getByLabelText('登记设备')).toHaveValue('registered-device')
    expect(screen.getByLabelText('发布状态')).toHaveValue('revoked')
    expect(screen.getByLabelText('搜索本地元数据')).toHaveValue('updated')
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('capabilities')
  })

  it('shows API errors without substituting examples and recovers on retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503,
      json: async () => ({ code: 'STORAGE_UNAVAILABLE', requestId: 'sharing-request' })
    }))
    render(<App />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('HTTP 503')
    expect(alert).toHaveTextContent('STORAGE_UNAVAILABLE')
    expect(alert).toHaveTextContent('sharing-request')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '尚无发布记录' })).not.toBeInTheDocument()
    vi.stubGlobal('fetch', emptyDirectory())
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '尚无发布记录' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('aborts directory requests when navigating away', () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }) => {
      signals.push(signal)
      return new Promise(() => {})
    }))
    const app = render(<App />)
    fireEvent.click(screen.getByRole('link', { name: '运行概览' }))
    expect(signals).toHaveLength(6)
    expect(signals.slice(0, 2).every((signal) => signal.aborted)).toBe(true)
    expect(signals.slice(2).every((signal) => !signal.aborted)).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/api/v1/console', { signal: expect.any(AbortSignal) })
    expect(screen.getByRole('heading', { name: '运行概览' })).toBeInTheDocument()
    app.unmount()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })
})
