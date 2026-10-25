import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pages } from './app-config'
import App from './App'

describe('ShareServer console', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/v1/gateway/config') {
        return { ok: true, json: async () => ({ upstreams: [], models: [], audits: [], gatewayBaseUrl: null }) }
      }
      if (url === '/api/v1/gateway/access-keys') return { ok: true, json: async () => ({ accessKeys: [] }) }
      if (url === '/api/v1/sharing/devices') return { ok: true, json: async () => ({ devices: [] }) }
      if (url === '/api/v1/sharing/publications') return { ok: true, json: async () => ({ publications: [] }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    window.history.replaceState({}, '', '/')
  })

  it('renders service links without a snapshot request, fabricated metrics or identity', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '运行概览' })).toBeInTheDocument()
    const services = screen.getByRole('region', { name: 'GoodBuddy 联动服务' })
    expect(within(services).getByRole('link', { name: /模型网关/ })).toHaveAttribute('href', '/model-gateway')
    expect(within(services).getByRole('link', { name: /共享中心/ })).toHaveAttribute('href', '/capabilities')
    const nav = screen.getByRole('navigation', { name: '管理控制台' })
    for (const page of pages) expect(within(nav).getByRole('link', { name: page.title })).toHaveAttribute('href', page.path)
    expect(within(nav).getByRole('link', { name: '审批' })).toHaveTextContent(/^审批$/)
    expect(screen.queryByText(/Nebula|MesaLab|林江|在线设备|任务活动|网络脉冲|示例数据/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /通知|搜索|切换到成员|切换到管理/ })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/v1/sharing/devices', expect.anything())
    expect(fetch).toHaveBeenCalledWith('/api/v1/sharing/publications', expect.anything())
    expect(fetch).toHaveBeenCalledWith('/api/v1/gateway/config', expect.anything())
  })

  it.each(pages.filter((page) => !['/', '/capabilities', '/model-gateway', '/distribution', '/devices', '/documents'].includes(page.path)))(
    'shows a boundary state without pretend actions at $path', (page) => {
      window.history.replaceState({}, '', page.path)
      render(<App />)
      const main = screen.getByRole('main')
      expect(within(main).getByRole('heading', { name: page.title })).toBeInTheDocument()
      expect(within(main).getByRole('heading', { name: '当前没有可用的业务数据' })).toBeInTheDocument()
      expect(within(main).queryByRole('button')).not.toBeInTheDocument()
       expect(within(main).getAllByRole('tab').length).toBeGreaterThan(0)
      expect(fetch).not.toHaveBeenCalled()
    }
  )

  it('preserves theme switching and closes mobile navigation after navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '切换到浅色主题' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    fireEvent.click(screen.getByRole('button', { name: '切换到深色主题' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    fireEvent.click(screen.getByRole('button', { name: '打开导航' }))
    const navigation = screen.getAllByRole('navigation', { name: '管理控制台' })
    expect(navigation).toHaveLength(2)
    fireEvent.click(within(navigation[1]).getByRole('link', { name: '组织与成员' }))
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: '组织与成员' })).toBeInTheDocument()
  })

  it('preserves distribution and its link to the real gateway', async () => {
    window.history.replaceState({}, '', '/distribution')
    render(<App />)
    expect(screen.getByText('尚无配置下发服务')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '创建配置草稿' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/org-chat|org-code|工程工作站/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '前往模型网关' }))
    expect(await screen.findByText(/尚无上游服务/)).toBeInTheDocument()
    await screen.findByText(/暂无访问密钥/)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenCalledWith('/api/v1/gateway/config', expect.anything())
  })

  it('renders the real device directory', async () => {
    vi.mocked(fetch).mockImplementation(async (input: string | URL | Request) => {
      const url = input.toString()
      if (url === '/api/v1/sharing/devices') return { ok: true, json: async () => ({ devices: [{ id: 'device-1', name: '本机工作站', platform: 'win32', appVersion: '1.0.0', registeredAt: '2026-10-01', updatedAt: '2026-10-02' }] }) } as Response
      if (url === '/api/v1/sharing/publications') return { ok: true, json: async () => ({ publications: [] }) } as Response
      throw new Error(`Unexpected request: ${url}`)
    })
    window.history.replaceState({}, '', '/devices')
    render(<App />)
    expect(await screen.findByRole('heading', { name: '本机工作站' })).toBeInTheDocument()
    expect(screen.getByText('已登记')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看共享内容' })).toHaveAttribute('href', '/capabilities?view=local&device=device-1')
  })

  it('redirects unknown routes to the overview without requesting a snapshot', () => {
    window.history.replaceState({}, '', '/missing')
    render(<App />)
    expect(screen.getByRole('heading', { name: '运行概览' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
    expect(fetch).toHaveBeenCalledWith('/api/v1/sharing/devices', expect.anything())
    expect(fetch).toHaveBeenCalledWith('/api/v1/sharing/publications', expect.anything())
    expect(fetch).toHaveBeenCalledWith('/api/v1/gateway/config', expect.anything())
  })
})
