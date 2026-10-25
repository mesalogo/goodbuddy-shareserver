import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthBoundary, useAuth } from './auth-boundary'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function Content() {
  const auth = useAuth()
  return <><h1>受保护的控制台</h1><button onClick={() => void auth?.logout()}>退出登录</button></>
}

it('sets up an administrator, clears secrets, logs out and handles session expiry', async () => {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/session') ? { enabled: true, initialized: false, authenticated: false, username: null } : { authenticated: true, username: 'admin' } }))
  vi.stubGlobal('fetch', fetcher)
  render(<AuthBoundary><Content /></AuthBoundary>)
  expect(screen.queryByText('受保护的控制台')).not.toBeInTheDocument()
  await screen.findByRole('heading', { name: '创建首位管理员' })
  fireEvent.change(screen.getByLabelText('初始化码'), { target: { value: 'secret-setup-token' } })
  fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'a-password-1234' } })
  fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'a-password-1234' } })
  fireEvent.click(screen.getByRole('button', { name: '创建管理员并登录' }))
  await screen.findByText('受保护的控制台')
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await screen.findByRole('heading', { name: '管理员登录' })
  expect(screen.getByLabelText('密码')).toHaveValue('')
  expect(screen.queryByLabelText('初始化码')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'a-password-1234' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  await screen.findByText('受保护的控制台')
  fireEvent(window, new Event('shareserver-login-required'))
  expect(screen.getByRole('alert')).toHaveTextContent('登录已过期')
  expect(screen.queryByText('受保护的控制台')).not.toBeInTheDocument()
})

it('keeps protected content hidden on a network failure and supports retry', async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error('网络中断')).mockResolvedValue({ ok: true, json: async () => ({ enabled: true, initialized: true, authenticated: false }) })
  vi.stubGlobal('fetch', fetcher)
  render(<AuthBoundary><Content /></AuthBoundary>)
  await screen.findByRole('alert')
  expect(screen.queryByText('受保护的控制台')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: '管理员登录' })).toBeInTheDocument())
})
