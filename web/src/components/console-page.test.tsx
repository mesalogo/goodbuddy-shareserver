import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsolePage } from './console-page'
import type { ConsoleRecord } from '../../../shared/console'
import { formatDate, setLanguage } from '../lib/i18n'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); setLanguage('zh-CN') })

const record: ConsoleRecord = { id: 'r1', module: 'members', name: '成员 A', detail: '第一行说明\n第二行完整资料', status: 'draft', revision: 3, createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-02T10:00:00Z' }

it('submits policy simulation from the evaluate button and clears obsolete results on edits', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method ? { decision: 'deny', matchedIds: [] } : { records: [], audits: [] } }))
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><ConsolePage module="policies" /></MemoryRouter>)
  for (const label of ['主体', '资源', '动作']) fireEvent.change(screen.getByLabelText(label), { target: { value: label } })
  fireEvent.click(screen.getByRole('button', { name: '测试匹配' }))
  expect(await screen.findByText('拒绝 · 匹配策略: 无')).toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledWith('/api/v1/console/policies/evaluate', expect.objectContaining({ method: 'POST' }))
  fireEvent.change(screen.getByLabelText('动作'), { target: { value: 'read' } })
  expect(screen.queryByText('拒绝 · 匹配策略: 无')).not.toBeInTheDocument()
})

it('sends revision and result when starting an approved manual task', async () => {
  const task: ConsoleRecord = { ...record, module: 'tasks', status: 'approved', progress: 'queued' }
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method ? { ...task, progress: 'in_progress' } : { records: [task], audits: [] } }))
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><ConsolePage module="tasks" /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: '进行中' }))
  fireEvent.change(screen.getByLabelText('结果或说明'), { target: { value: 'Started review' } })
  fireEvent.click(screen.getByRole('button', { name: '保存进度' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(fetcher).toHaveBeenCalledWith('/api/v1/console/tasks/r1/progress', expect.objectContaining({ method: 'POST', body: JSON.stringify({ revision: 3, progress: 'in_progress', result: 'Started review' }) }))
})

it('opens full details with metadata, restores focus and clears empty search results', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ records: [record], audits: [] }) })))
  render(<MemoryRouter><ConsolePage module="members" /></MemoryRouter>)
  const trigger = await screen.findByRole('button', { name: '详情：成员 A' })
  expect(screen.getByText('1 / 1 条记录')).toBeInTheDocument()
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: '成员 A' })
  expect(within(dialog).getByText('r1')).toBeInTheDocument()
  expect(within(dialog).getByText('第一行说明 第二行完整资料')).toBeInTheDocument()
  fireEvent.keyDown(dialog, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
  fireEvent.change(screen.getByLabelText('搜索记录'), { target: { value: '不存在' } })
  expect(screen.getByText('没有匹配结果')).toBeInTheDocument()
  expect(screen.getByText('0 / 1 条记录')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
  expect(screen.getByRole('heading', { name: '成员 A' })).toBeInTheDocument()
})

it('retains revision conflict context and the edit draft', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => init?.method
    ? { ok: false, json: async () => ({ message: '记录已更新，请刷新后重试' }) }
    : { ok: true, json: async () => ({ records: [record], audits: [] }) })
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><ConsolePage module="members" /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '成员 B' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('记录已更新，请刷新后重试')
  expect(screen.getByLabelText('名称')).toHaveValue('成员 B')
  expect(fetcher).toHaveBeenLastCalledWith('/api/v1/console/members/r1', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: '成员 B', detail: record.detail, fields: {}, revision: 3 }) }))
})

it('shows fetch failures with retry and preserves audit metadata', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ message: '暂时无法读取' }) }).mockResolvedValue({ ok: true, json: async () => ({ records: [], audits: [{ id: 'a1', module: 'members', recordId: 'r1', action: 'draft → pending', revision: 4, at: record.updatedAt }] }) })
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><ConsolePage module="audit" /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法读取')
  expect(screen.queryByText('暂无操作记录')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  expect(await screen.findByText('草稿 → 待审核')).toBeInTheDocument()
  expect(screen.getByText('r1 · v4')).toBeInTheDocument()
  expect(screen.getByText('当前实例 · 本地管理操作')).toBeInTheDocument()
})

it('saves a draft, reloads the server record and confirms submission', async () => {
  let records: ConsoleRecord[] = []
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method) {
      const body = JSON.parse(init.body as string)
      records = [{ id: 'r1', module: 'distribution', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...body, status: body.status ?? 'draft', revision: (body.revision ?? 0) + 1 }]
      return { ok: true, json: async () => records[0] }
    }
    return { ok: true, json: async () => ({ records, audits: [] }) }
  })
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><ConsolePage module="distribution" /></MemoryRouter>)
  await screen.findByText(/尚无配置草稿/)
  fireEvent.click(screen.getByRole('button', { name: '创建配置草稿' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '配置 A' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  expect(await screen.findByRole('heading', { name: '配置 A' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '提交审核' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('不触发设备执行')
  fireEvent.click(screen.getByRole('button', { name: '确认并保存' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(records[0].status).toBe('pending')
  expect(records[0].revision).toBe(2)
  for (const [label, status] of [['驳回', 'rejected'], ['归档', 'archived'], ['恢复草稿', 'draft'], ['提交审核', 'pending'], ['记录通过', 'approved'], ['归档', 'archived']] as const) {
    fireEvent.click(await screen.findByRole('button', { name: label }))
    fireEvent.click(screen.getByRole('button', { name: '确认并保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(records[0].status).toBe(status)
  }
  expect(records[0].revision).toBe(8)
})

it('keeps failed saves open without success feedback and supports retry', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method
    ? { ok: false, json: async () => ({ message: '存储不可写' }) }
    : { ok: true, json: async () => ({ records: [], audits: [] }) }))
  render(<MemoryRouter><ConsolePage module="members" /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: '创建成员登记' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '成员 A' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('存储不可写')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.queryByText('已保存到服务器。')).not.toBeInTheDocument()
})

it('switches an open draft and conflict error without changing user content', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method
    ? { ok: false, status: 409, json: async () => ({ message: '记录已被修改，请刷新后重试。' }) }
    : { ok: true, json: async () => ({ records: [record], audits: [] }) }))
  render(<MemoryRouter><ConsolePage module="members" /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '用户自定义名称' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
  await screen.findByRole('alert')
  act(() => setLanguage('en'))
  expect(screen.getByRole('dialog', { name: 'Edit member registration' })).toBeInTheDocument()
  expect(screen.getByLabelText('Name')).toHaveValue('用户自定义名称')
  expect(screen.getByRole('alert')).toHaveTextContent('The record has changed. Refresh and try again. (409)')
  expect(screen.getByLabelText('Contact information, groups and proposed roles')).toHaveValue(record.detail)
  act(() => setLanguage('zh-CN'))
  expect(screen.getByRole('alert')).toHaveTextContent('记录已被修改，请刷新后重试。')
})

it('localizes audit search, actions and dates while preserving record IDs', async () => {
  setLanguage('en')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ records: [], audits: [
    { id: 'a1', module: 'members', recordId: 'r1', action: 'draft → pending', revision: 4, at: record.updatedAt },
    { id: 'a2', module: 'members', recordId: 'r2', action: '创建', revision: 1, at: record.createdAt }
  ] }) })))
  render(<MemoryRouter><ConsolePage module="audit" /></MemoryRouter>)
  expect(await screen.findByText('Draft → Pending review')).toBeInTheDocument()
  expect(screen.getByText('Created')).toBeInTheDocument()
  expect(screen.getByText(formatDate(record.updatedAt))).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'pending review' } })
  expect(screen.getByText('r1 · v4')).toBeInTheDocument()
  expect(screen.queryByText('r2 · v1')).not.toBeInTheDocument()
})

it('shows a safe English fallback and server code for unknown Chinese errors', async () => {
  setLanguage('en')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ message: '新服务器错误', code: 'SERVICE_UNAVAILABLE' }) })))
  render(<MemoryRouter><ConsolePage module="tasks" /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed. Please try again. (SERVICE_UNAVAILABLE)')
  expect(screen.getByRole('alert')).not.toHaveTextContent('新服务器错误')
})
