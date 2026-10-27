import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharingCenter } from './sharing-center'
import { setLanguage } from '../lib/i18n'

const at = '2026-10-01T08:00:00.000Z'
const devices = ['a', 'b', 'c'].map(id => ({ id, name: `Device ${id}`, platform: 'linux', appVersion: '1.2', registeredAt: at, updatedAt: at }))
const publications = [
  { id: 'cap', deviceId: 'a', name: 'CSV analysis', kind: 'capability', status: 'published' },
  { id: 'kb', deviceId: 'a', name: 'Manual', kind: 'knowledge', status: 'revoked' },
  { id: 'free', deviceId: 'b', name: 'Unassigned knowledge', kind: 'knowledge', status: 'published' }
].map(item => ({ ...item, description: '', sourceMode: 'device', permissions: { search: true, read: false, download: true }, createdAt: at, updatedAt: at }))
const records = [
  { id: 'alice', module: 'members', name: 'Alice', status: 'approved', fields: { deviceIds: ' a, a, missing, ', email: 'alice@example.test', group: 'Research', role: 'Reviewer' } },
  { id: 'bob', module: 'members', name: 'Bob', status: 'pending', fields: { deviceIds: 'b' } },
  { id: 'eve', module: 'members', name: 'Eve', status: 'archived', fields: { deviceIds: 'b' } },
  { id: 'empty', module: 'members', name: 'No devices', status: 'approved', detail: 'Device c' },
  { id: 'other', module: 'tasks', name: 'Not a member', status: 'approved', fields: { deviceIds: 'c' } }
]
const ok = (body: unknown) => ({ ok: true, json: async () => body })
function directory(url: string) {
  if (url === '/api/v1/sharing/devices') return ok({ devices })
  if (url === '/api/v1/sharing/publications') return ok({ publications })
  if (url === '/api/v1/console') return ok({ records, audits: [] })
  throw new Error(`Unexpected request ${url}`)
}
function mount(search = '') {
  window.history.replaceState({}, '', `/capabilities${search}`)
  return render(<BrowserRouter><SharingCenter /></BrowserRouter>)
}
describe('sharing center views', () => {
  beforeEach(() => { setLanguage('en'); vi.stubGlobal('fetch', vi.fn(async (url: string) => directory(url))) })
  afterEach(() => { cleanup(); setLanguage('zh-CN'); vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('enforces tab kinds despite contradictory URL filters and preserves the tab on clear', async () => {
    mount('?kind=knowledge')
    await screen.findByRole('heading', { name: 'CSV analysis' })
    expect(screen.queryByRole('heading', { name: 'Manual' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sharing type')).toBeDisabled()
    fireEvent.click(screen.getByRole('tab', { name: 'Shared knowledge bases' }))
    const manual = (await screen.findByRole('heading', { name: 'Manual' })).closest('article')!
    expect(within(manual).getByText('Revoked')).toBeInTheDocument()
    expect(within(manual).getByText('Download: Declared allowed')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CSV analysis' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search local metadata'), { target: { value: 'absent' } })
    expect(screen.getByRole('heading', { name: 'No matching local records' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(window.location.search).toBe('?tab=knowledge')
    expect(screen.getByRole('heading', { name: 'Manual' })).toBeInTheDocument()
  })

  it('groups both publication kinds by actual devices with detail links and empty devices', async () => {
    mount('?tab=devices')
    const device = await screen.findByRole('region', { name: 'Device a' })
    expect(within(device).getByRole('heading', { name: 'CSV analysis' })).toBeInTheDocument()
    expect(within(device).getByRole('heading', { name: 'Manual' })).toBeInTheDocument()
    expect(within(device).getByRole('link', { name: 'View device details' })).toHaveAttribute('href', '/devices?device=a')
    expect(within(device).getByText('Platform: linux · App version: 1.2')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Device c' })).getByText('This device has no matching publication records.')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('associates only explicit approved member IDs, deduplicates IDs and separates unassigned devices', async () => {
    mount('?tab=members')
    const alice = await screen.findByRole('region', { name: 'Alice' })
    expect(within(alice).getAllByRole('region', { name: 'Device a' })).toHaveLength(1)
    expect(within(alice).getByRole('heading', { name: 'Manual' })).toBeInTheDocument()
    expect(within(alice).getByText('Email: alice@example.test')).toBeInTheDocument()
    expect(within(alice).getByText('Group: Research')).toBeInTheDocument()
    expect(within(alice).getByText('Registered role: Reviewer')).toBeInTheDocument()
    expect(within(alice).getByText('Associated device ID not found in the device directory: missing')).toBeInTheDocument()
    for (const name of ['Bob', 'Eve', 'Not a member']) expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'No devices' })).getByText('This member registration has no associated devices.')).toBeInTheDocument()
    const unassigned = screen.getByRole('region', { name: 'Devices without member associations' })
    expect(within(unassigned).getByRole('heading', { name: 'Unassigned knowledge' })).toBeInTheDocument()
    expect(within(unassigned).getByRole('region', { name: 'Device c' })).toBeInTheDocument()
    expect(within(unassigned).queryByRole('region', { name: 'Device a' })).not.toBeInTheDocument()
    act(() => setLanguage('zh-CN'))
    expect(screen.getByRole('heading', { name: '未关联成员的设备' })).toBeInTheDocument()
    expect(screen.getByText('邮箱：alice@example.test')).toBeInTheDocument()
  })

  it('reports snapshot failures without claiming devices are unassigned, then retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/v1/console' ? { ok: false, status: 503, json: async () => ({ code: 'STORAGE_UNAVAILABLE', requestId: 'member-load' }) } : directory(url)))
    mount('?tab=members')
    expect(await screen.findByRole('alert')).toHaveTextContent('member-load')
    expect(screen.queryByRole('region', { name: 'Devices without member associations' })).not.toBeInTheDocument()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => directory(url)))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'Alice' })).toBeInTheDocument()
  })

  it('keeps multiple explicit member associations and publications whose device metadata is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/v1/console') return ok({ records: [...records, { id: 'second', module: 'members', name: 'Second association', status: 'approved', fields: { deviceIds: 'a' } }], audits: [] })
      if (url === '/api/v1/sharing/publications') return ok({ publications: [...publications, { ...publications[0], id: 'orphan', deviceId: 'unknown', name: 'Orphan record' }] })
      return directory(url)
    }))
    mount('?tab=members')
    const second = await screen.findByRole('region', { name: 'Second association' })
    expect(within(second).getByRole('heading', { name: 'CSV analysis' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Alice' })).getByRole('heading', { name: 'CSV analysis' })).toBeInTheDocument()
    const unassigned = screen.getByRole('region', { name: 'Devices without member associations' })
    expect(within(unassigned).getByRole('heading', { name: 'Orphan record' })).toBeInTheDocument()
    expect(within(unassigned).getByRole('heading', { name: 'Device not found (unknown)' })).toBeInTheDocument()
  })

  it('revokes from a device group and refreshes its publication status', async () => {
    let revoked = false
    const request = vi.fn(async (url: string) => {
      if (url === '/api/v1/sharing/publications/cap/revoke') { revoked = true; return ok({}) }
      if (url === '/api/v1/sharing/publications' && revoked) return ok({ publications: publications.map(item => item.id === 'cap' ? { ...item, status: 'revoked' } : item) })
      return directory(url)
    })
    vi.stubGlobal('fetch', request)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mount('?tab=devices&device=a')
    const article = (await screen.findByRole('heading', { name: 'CSV analysis' })).closest('article')!
    fireEvent.click(within(article).getByRole('button', { name: 'Revoke publication' }))
    await waitFor(() => expect(within(screen.getByRole('heading', { name: 'CSV analysis' }).closest('article')!).getByText('Revoked')).toBeInTheDocument())
    const refreshed = (await screen.findByRole('heading', { name: 'CSV analysis' })).closest('article')!
    expect(within(refreshed).getByText('Revoked')).toBeInTheDocument()
    expect(within(refreshed).queryByRole('button')).not.toBeInTheDocument()
    expect(request).toHaveBeenCalledWith('/api/v1/sharing/publications/cap/revoke', { method: 'POST', signal: undefined })
  })

  it('aborts the member snapshot along with directory requests on unmount', () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => { signals.push(init.signal!); return new Promise(() => {}) }))
    const app = mount('?tab=members')
    app.unmount()
    expect(signals).toHaveLength(3)
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })
})
