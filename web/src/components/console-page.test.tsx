import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsolePage } from './console-page'
import type { ConsoleRecord } from '../../../shared/console'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
