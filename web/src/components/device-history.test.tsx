import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { setLanguage } from '../lib/i18n'
import { DevicesPage } from './devices-page'

afterEach(() => { cleanup(); setLanguage('zh-CN'); vi.unstubAllGlobals() })
it('loads persisted history, filters revocations and switches language without placeholders', async () => {
  const events = ['registration', 'disabled', 'publication-revoked'].map((kind, index) => ({ id: String(index), kind, at: '2026-10-01T08:00:00.000Z', deviceId: 'desktop', publicationId: kind === 'publication-revoked' ? 'resource' : null, registrationStatus: 'approved' }))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/history') ? { events, retentionLimit: 1000 } : url.endsWith('/devices') ? { devices: [] } : { publications: [] } })))
  render(<MemoryRouter><DevicesPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('tab', { name: '注册与接入记录' }))
  expect(await screen.findByText('收到设备注册 · 已接纳')).toBeInTheDocument()
  act(() => setLanguage('en'))
  expect(screen.getByText('Device registration received · Approved')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Revocation history' }))
  expect(await screen.findByText('Publication revoked · Approved')).toBeInTheDocument()
  expect(screen.queryByText('Device registration received · Approved')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Filter device or publication ID'), { target: { value: 'missing' } })
  expect(screen.getByText('No matching events.')).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'Device details' })).not.toBeInTheDocument()
})
