import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DeviceRegistration } from './device-registration'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('changes registration policy and approves, disables and restores a device', async () => {
  let mode = 'open', status = 'pending'
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') mode = JSON.parse(String(init.body)).mode
    if (init?.method === 'POST') status = JSON.parse(String(init.body)).status
    return { ok: true, json: async () => url.endsWith('/decision') ? {} : { mode, devices: [{ id: 'desktop', name: 'GB Desktop', platform: 'linux', registrationStatus: status }] } }
  }))
  render(<DeviceRegistration />)
  const select = await screen.findByRole('combobox', { name: '设备注册模式' })
  expect(select).toHaveValue('open')
  fireEvent.change(select, { target: { value: 'approval' } })
  await waitFor(() => expect(select).toHaveValue('approval'))
  fireEvent.click(screen.getByRole('button', { name: '批准接入' }))
  await screen.findByText('GB Desktop · 已接纳')
  fireEvent.click(screen.getByRole('button', { name: '停用设备' }))
  await screen.findByText('GB Desktop · 已停用')
  fireEvent.click(screen.getByRole('button', { name: '批准接入' }))
  await screen.findByText('GB Desktop · 已接纳')
})
