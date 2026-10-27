import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { setLanguage } from '../lib/i18n'
import { DevicesPage } from './devices-page'

afterEach(() => { cleanup(); setLanguage('zh-CN'); vi.unstubAllGlobals() })

it('switches device details live while retaining device names and identifiers', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/devices')
    ? { devices: [{ id: 'device-a', name: '中文设备', platform: 'linux', appVersion: '1.0', registeredAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T09:00:00Z' }] }
    : { publications: [] } })))
  render(<MemoryRouter><DevicesPage /></MemoryRouter>)
  await screen.findByRole('heading', { name: '中文设备' })
  act(() => setLanguage('en'))
  expect(screen.getByRole('heading', { name: 'GoodBuddy connections' })).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Name, platform, version or device ID')).toBeInTheDocument()
  expect(screen.getByText('Registered')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'View details' }))
  expect(screen.getByRole('dialog', { name: '中文设备' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View shared content from this device' })).toHaveAttribute('href', '/capabilities?view=local&device=device-a')
  act(() => setLanguage('zh-CN'))
  expect(screen.getByRole('link', { name: '查看此设备的共享内容' })).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(2)
})
