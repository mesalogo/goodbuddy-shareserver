import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthBoundary } from './auth-boundary'
import { AppShell } from './app-shell'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('places account actions in the header and validates, saves and clears password fields', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ enabled: true, initialized: true, authenticated: true, username: 'admin' }) }))
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><AuthBoundary><AppShell>Content</AppShell></AuthBoundary></MemoryRouter>)
  const trigger = await screen.findByRole('button', { name: '账户菜单' })
  expect(within(screen.getByRole('banner')).getByRole('button', { name: '账户菜单' })).toBe(trigger)
  expect(screen.queryByRole('button', { name: '退出登录' })).not.toBeInTheDocument()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '修改密码' }))
  fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'old-password-123' } })
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-password-123' } })
  fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'different-password' } })
  fireEvent.submit(screen.getByRole('button', { name: '保存密码' }).closest('form')!)
  expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致。')
  expect(fetcher).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'new-password-123' } })
  fireEvent.submit(screen.getByRole('button', { name: '保存密码' }).closest('form')!)
  await screen.findByRole('status')
  expect(fetcher).toHaveBeenCalledWith('/api/v1/auth/password', expect.objectContaining({ body: JSON.stringify({ currentPassword: 'old-password-123', newPassword: 'new-password-123' }) }))
  fireEvent.click(screen.getByRole('button', { name: '完成' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '修改密码' }))
  expect(screen.getByLabelText('当前密码')).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByRole('heading', { name: '管理员登录' })
})
