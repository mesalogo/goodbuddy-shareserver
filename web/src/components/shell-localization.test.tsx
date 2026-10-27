import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { getPages, pages } from '../app-config'
import { setLanguage } from '../lib/i18n'
import { AppShell } from './app-shell'
import { AuthBoundary } from './auth-boundary'

afterEach(() => { cleanup(); setLanguage('zh-CN'); localStorage.clear(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/') })

it('localizes every page field while preserving route and tab identifiers and raw classification', () => {
  setLanguage('en')
  getPages().forEach((page, index) => {
    const raw = pages[index]
    expect(page.path).toBe(raw.path)
    expect(page.dataKey).toBe(raw.dataKey)
    expect(page.role).toBe(raw.role)
    expect(page.tabs?.map(tab => tab.dataKey)).toEqual(raw.tabs?.map(tab => tab.dataKey))
    expect(page.next?.to).toBe(raw.next?.to)
    const text = [page.title, page.description, page.group, page.boundary, page.next?.label, ...page.tabs?.map(tab => tab.label) ?? []].filter(Boolean).join(' ')
    expect(text).not.toMatch(/[\u3400-\u9fff]/)
  })
  expect(pages.find(page => page.path === '/members')?.group).toBe('组织管理')
  setLanguage('zh-CN')
  expect(getPages()).toEqual(pages)
})

it('switches shell navigation, breadcrumbs, theme labels and mobile navigation live', () => {
  render(<MemoryRouter initialEntries={['/members']}><AppShell>content</AppShell></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  const nav = screen.getByRole('navigation', { name: 'Administration console' })
  for (const page of getPages()) expect(within(nav).getByRole('link', { name: page.title })).toHaveAttribute('href', page.path)
  expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Organization & operations')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  expect(screen.getByRole('dialog', { name: 'Administration console navigation' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument()
})

it('switches unavailable page boundaries and tabs through App without changing the selected tab', () => {
  window.history.replaceState({}, '', '/me/grants')
  render(<App />)
  fireEvent.click(screen.getByRole('tab', { name: '使用限制' }))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  expect(screen.getByRole('heading', { name: 'My grants' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Usage limits' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('No business data is currently available')).toBeInTheDocument()
  expect(screen.getByText(/Identity, permission, and persistence APIs/)).toBeInTheDocument()
  expect(window.location.pathname).toBe('/me/grants')
})

it('translates server authentication errors live and preserves entered credentials', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: true, initialized: true, authenticated: false }) })
    .mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: '账号或密码错误。' }) })
  vi.stubGlobal('fetch', fetcher)
  render(<AuthBoundary>protected</AuthBoundary>)
  await screen.findByRole('heading', { name: '管理员登录' })
  fireEvent.change(screen.getByLabelText('管理员账号'), { target: { value: 'admin.user' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'secret-password' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误。')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Incorrect username or password.')
  expect(screen.getByLabelText('Administrator username')).toHaveValue('admin.user')
  expect(screen.getByLabelText('Password')).toHaveValue('secret-password')
  expect(screen.queryByText('protected')).not.toBeInTheDocument()
  expect(fetcher).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '切换到中文' }))
  expect(screen.getByRole('alert')).toHaveTextContent('账号或密码错误。')
})
