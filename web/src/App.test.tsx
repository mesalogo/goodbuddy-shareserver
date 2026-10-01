import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prototypeSnapshot } from '../../shared/prototype-data'
import App from './App'

describe('ShareServer console', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => prototypeSnapshot
      })
    )
    window.history.replaceState({}, '', '/')
  })

  it('renders the organization overview from the API snapshot', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '运行概览' })).toBeInTheDocument()
    expect(screen.getByText('Nebula ShareServer')).toBeInTheDocument()
    expect(screen.getByText('在线设备')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '管理控制台' })).toBeInTheDocument()
  })

  it('opens global search with the keyboard shortcut', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '运行概览' })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    expect(await screen.findByRole('dialog', { name: '全局搜索' })).toBeInTheDocument()
  })

  it('changes list data when navigating between existing console routes', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '运行概览' })
    fireEvent.click(screen.getByRole('link', { name: 'GoodBuddy 接入' }))
    expect(screen.getByText('Jiang-PC')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '组织与成员' }))
    expect(screen.getByText('jiang@mesalab.internal')).toBeInTheDocument()
    expect(screen.queryByText('Jiang-PC')).not.toBeInTheDocument()
  })

  it('retains gateway state across navigation and blocks publishing against a disabled upstream', async () => {
    window.history.replaceState({}, '', '/distribution')
    render(<App />)
    await screen.findByRole('heading', { name: '配置下发' })
    fireEvent.click(screen.getByRole('button', { name: '创建配置草稿' }))
    fireEvent.change(screen.getByLabelText('版本'), { target: { value: '1.0.0' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    fireEvent.click(screen.getByRole('link', { name: '模型网关' }))
    fireEvent.click(screen.getByRole('button', { name: '停用 示例上游' }))
    fireEvent.click(screen.getByRole('link', { name: '配置下发' }))
    expect(screen.getByRole('button', { name: '模拟发布' })).toBeDisabled()
    fireEvent.click(screen.getByRole('link', { name: '模型网关' }))
    fireEvent.click(screen.getByRole('button', { name: '启用 示例上游' }))
    fireEvent.click(screen.getByRole('link', { name: '配置下发' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟发布' }))
    expect(screen.getByText('模拟已应用')).toBeInTheDocument()
    expect(screen.getByText('离线 · 待下发（模拟）')).toBeInTheDocument()
    expect(screen.getByText('已应用：1.0.0 / org-chat · 目标：1.0.0')).toBeInTheDocument()
    expect(screen.getByText('已应用：无 · 目标：1.0.0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '创建配置草稿' }))
    fireEvent.change(screen.getByLabelText('版本'), { target: { value: '1.1.0' } })
    fireEvent.change(screen.getByLabelText('默认模型'), { target: { value: 'model-code' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    fireEvent.click(screen.getByRole('button', { name: '模拟发布' }))
    expect(screen.getByText('已应用：1.1.0 / org-code · 目标：1.1.0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '模拟回退到 1.0.0' }))
    expect(screen.getByText('已应用：1.0.0 / org-chat · 目标：1.0.0')).toBeInTheDocument()
    expect(screen.getByText('已应用：无 · 目标：1.0.0')).toBeInTheDocument()
  })

  it('removes personal delete authority after document transfer and preserves ownership through restore', async () => {
    window.history.replaceState({}, '', '/documents')
    render(<App />)
    await screen.findByRole('heading', { name: '文档与协作' })
    fireEvent.click(screen.getByRole('button', { name: '打开模拟 GoodBuddy 客户端' }))
    fireEvent.click(screen.getByRole('button', { name: '确认转移给组织' }))
    const document = screen.getByRole('heading', { name: '我的项目提案.docx' }).closest('article')!
    expect(within(document).getByText('归属：组织：MesaLab')).toBeInTheDocument()
    expect(within(document).getByRole('button', { name: '移入回收站' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(within(document).getByRole('button', { name: '移入回收站' }))
    fireEvent.click(screen.getByRole('tab', { name: '回收站' }))
    expect(screen.getByText('归属：组织：MesaLab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '恢复文档' }))
    fireEvent.click(screen.getByRole('tab', { name: '组织文档' }))
    expect(screen.getByRole('heading', { name: '我的项目提案.docx' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开模拟 GoodBuddy 客户端' }))
    expect(screen.queryByRole('button', { name: '删除我的文档' })).not.toBeInTheDocument()
  })

  it('records denied gateway calls and hides administration from member navigation', async () => {
    window.history.replaceState({}, '', '/model-gateway')
    render(<App />)
    await screen.findByRole('heading', { name: '模型网关' })
    fireEvent.click(screen.getByRole('tab', { name: '模型映射 / 访问策略' }))
    fireEvent.change(screen.getByLabelText('模拟调用者用户组'), { target: { value: '设计中心' } })
    fireEvent.click(screen.getByRole('button', { name: '模拟调用 org-code' }))
    fireEvent.click(screen.getByRole('tab', { name: '调用审计' }))
    expect(screen.getByText('模拟拒绝')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /切换到成员自助/ }))
    expect(screen.getByRole('heading', { name: '我的设备' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '模型网关' })).not.toBeInTheDocument()
  })
})
