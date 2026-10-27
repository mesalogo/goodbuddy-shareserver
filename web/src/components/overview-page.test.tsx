import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { OverviewPage } from './overview-page'
import { formatDate, setLanguage } from '../lib/i18n'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); setLanguage('zh-CN') })

const at = '2026-10-02T10:00:00Z'
function mockData() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => {
    if (url.endsWith('/devices')) return { devices: [] }
    if (url.endsWith('/publications')) return { publications: [] }
    if (url.endsWith('/config')) return { upstreams: [], models: [] }
    if (url === '/api/v1/console') return { records: [{ id: 'r1', module: 'members', name: '用户名称', detail: '用户说明', status: 'pending', revision: 2, updatedAt: at }], audits: [{ id: 'a1', recordId: 'r1', module: 'members', action: '创建', revision: 1, at }] }
    throw new Error(`Unexpected request: ${url}`)
  } })))
}

it('switches loaded metrics, pending items and activity without translating user content', async () => {
  mockData()
  render(<MemoryRouter><OverviewPage /></MemoryRouter>)
  await screen.findByText('台已登记设备')
  expect(fetch).toHaveBeenCalledWith('/api/v1/console', { signal: expect.any(AbortSignal) })
  expect(fetch).toHaveBeenCalledTimes(4)
  act(() => setLanguage('en'))
  expect(screen.getByText('registered devices')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Registration and configuration overview' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Pending items' }))
  expect(await screen.findByText('用户名称')).toBeInTheDocument()
  expect(screen.getByText('用户说明')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Review 用户名称' })).toBeInTheDocument()
  expect(screen.getByText(formatDate(at))).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Recent activity' }))
  expect(await screen.findByText('Organizations and members · Created')).toBeInTheDocument()
  act(() => setLanguage('zh-CN'))
  expect(screen.getByText('组织与成员 · 创建')).toBeInTheDocument()
})

it('localizes an existing topology error and retains its code', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/v1/console'
    ? { ok: true, json: async () => ({ records: [], audits: [] }) }
    : { ok: false, status: 503, json: async () => ({ message: '服务器暂不可用', code: 'SHARING_UNAVAILABLE' }) }))
  render(<MemoryRouter><OverviewPage /></MemoryRouter>)
  await screen.findByRole('alert')
  act(() => setLanguage('en'))
  expect(screen.getByRole('alert')).toHaveTextContent('SHARING_UNAVAILABLE')
  expect(screen.getByRole('alert').textContent).not.toMatch(/\p{Script=Han}/u)
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  mockData()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('registered devices')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(3)
  expect(fetch).not.toHaveBeenCalledWith('/api/v1/console', expect.anything())
})
