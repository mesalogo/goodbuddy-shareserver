import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prototypeSnapshot } from '../../../shared/prototype-data'
import App from '../App'
import { sharedItems, sharingAvailability } from '../lib/sharing-fixtures'

describe('sharing center', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/capabilities')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => prototypeSnapshot }))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('keeps synced copies available offline while remote retrieval waits for the device', () => {
    const synced = sharedItems.find((item) => item.id === 'k-1')!
    const remote = sharedItems.find((item) => item.id === 'k-2')!
    expect(sharingAvailability(synced, '离线').available).toBe(true)
    expect(sharingAvailability(remote, '离线').available).toBe(false)
    expect(sharingAvailability(remote, '在线').available).toBe(true)
    expect(sharingAvailability(remote, '未知').available).toBe(false)
    expect(sharingAvailability({ ...synced, paused: true }, '离线').available).toBe(false)
    expect(sharingAvailability(synced, '已撤销').available).toBe(false)
  })

  it('displays independent permissions and source availability without granting content access to admins', async () => {
    window.history.replaceState({}, '', '/capabilities?view=knowledge')
    render(<App />)
    await screen.findByRole('heading', { name: '共享中心' })
    const synced = screen.getByRole('link', { name: '设计规范归档' }).closest('article')!
    expect(within(synced).getByText(/设备状态：离线/)).toBeInTheDocument()
    expect(within(synced).getByText('服务器副本就绪（示例）')).toBeInTheDocument()
    expect(within(synced).getByText('读取原文：允许')).toBeInTheDocument()
    expect(within(synced).getByText('下载：未授权')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '设计项目素材' }))
    const dialog = screen.getByRole('dialog', { name: '设计项目素材详情' })
    expect(within(dialog).getByText('搜索：允许')).toBeInTheDocument()
    expect(within(dialog).getByText('读取原文：未授权')).toBeInTheDocument()
    expect(within(dialog).getByText('下载：允许')).toBeInTheDocument()
    expect(within(dialog).getByText('设备离线，远程取用不可用')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '下载（未接入）' })).toBeDisabled()
    expect(within(dialog).getByText(/管理员身份不会增加这些权限/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('shows metadata-only knowledge even when all content permissions are denied', async () => {
    window.history.replaceState({}, '', '/capabilities?view=knowledge&item=k-4')
    render(<App />)
    const dialog = await screen.findByRole('dialog', { name: '受限研究资料详情' })
    for (const action of ['搜索', '读取原文', '下载']) expect(within(dialog).getByText(`${action}：未授权`)).toBeInTheDocument()
    for (const button of within(dialog).getAllByRole('button', { name: /未接入/ })) expect(button).toBeDisabled()
  })

  it('combines filters, recovers from no results, and restores URL state on remount', async () => {
    window.history.replaceState({}, '', '/capabilities?view=knowledge')
    const app = render(<App />)
    await screen.findByRole('heading', { name: '共享中心' })
    fireEvent.change(screen.getByLabelText('内容来源'), { target: { value: 'synced' } })
    fireEvent.change(screen.getByLabelText('可用状态'), { target: { value: 'ready' } })
    fireEvent.change(screen.getByLabelText('共享对象'), { target: { value: '全组织' } })
    fireEvent.change(screen.getByLabelText('搜索共享元数据'), { target: { value: 'Design-Mac' } })
    expect(screen.getByText('当前结果：1 项共享内容')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '设计规范归档' })).toBeInTheDocument()
    app.unmount()
    render(<App />)
    await screen.findByRole('heading', { name: '共享中心' })
    expect(screen.getByLabelText('搜索共享元数据')).toHaveValue('Design-Mac')
    expect(screen.getByText('当前结果：1 项共享内容')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('可用状态'), { target: { value: 'unavailable' } })
    expect(screen.getByRole('heading', { name: '没有符合条件的结果' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(window.location.search).toBe('?view=knowledge')
    expect(screen.getByText('当前结果：4 项共享内容')).toBeInTheDocument()
  })

  it('navigates from content to publisher and provider with matching details and clears stale filters', async () => {
    window.history.replaceState({}, '', '/capabilities?view=knowledge&q=归档&item=k-1')
    render(<App />)
    const detail = await screen.findByRole('dialog', { name: '设计规范归档详情' })
    fireEvent.click(within(detail).getByRole('link', { name: '发布者：陈汐' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '按用户查看' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('发布用户')).toHaveValue('m-2')
    expect(screen.getByText('当前结果：3 项共享内容')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '图像生成' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: '提供设备：GPU-Worker-02' }))
    expect(screen.getByLabelText('提供设备')).toHaveValue('d-2')
    expect(screen.getByRole('link', { name: '代码安全扫描' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: '代码安全扫描' }))
    expect(within(screen.getByRole('dialog')).getByText('发布已暂停')).toBeInTheDocument()
  })

  it('links the existing device detail to its exact sharing view including empty devices', async () => {
    window.history.replaceState({}, '', '/devices')
    render(<App />)
    await screen.findByRole('heading', { name: 'GoodBuddy 接入' })
    fireEvent.click(screen.getByRole('button', { name: /Design-Mac-07/ }))
    const link = within(screen.getByRole('dialog')).getByRole('link', { name: '查看此设备的共享内容' })
    expect(link).toHaveAttribute('href', '/capabilities?view=devices&device=d-3')
    fireEvent.click(link)
    expect(screen.getByLabelText('提供设备')).toHaveValue('d-3')
    expect(screen.getByText('当前结果：2 项共享内容')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('提供设备'), { target: { value: 'd-4' } })
    expect(screen.getByRole('heading', { name: 'Legacy-Lab · 已撤销 · 0 项' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '没有符合条件的结果' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getByText('当前结果：7 项共享内容')).toBeInTheDocument()
  })

  it('supports keyboard tabs and keeps invalid detail links recoverable', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: '共享中心' })
    fireEvent.keyDown(screen.getByRole('tab', { name: '能力目录' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: '共享知识库' })).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'sharing-tab-knowledge')
    fireEvent.keyDown(screen.getByRole('tab', { name: '共享知识库' }), { key: 'End' })
    expect(screen.getByRole('tab', { name: '按设备查看' })).toHaveFocus()
    cleanup()
    window.history.replaceState({}, '', '/capabilities?view=knowledge&item=missing')
    render(<App />)
    expect(await screen.findByRole('dialog', { name: '共享内容不存在' })).toBeInTheDocument()
  })
})
