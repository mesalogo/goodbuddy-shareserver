import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'
import { pages } from '../app-config'
import { AppShell } from './app-shell'

afterEach(() => { cleanup(); localStorage.clear() })

it('keeps every route accessible when collapsed and restores the saved theme', () => {
  localStorage.setItem('shareserver-theme', 'dark')
  render(<MemoryRouter><AppShell><h1>页面内容</h1></AppShell></MemoryRouter>)
  expect(document.documentElement.dataset.theme).toBe('dark')
  fireEvent.click(screen.getByRole('button', { name: '切换到浅色主题' }))
  expect(localStorage.getItem('shareserver-theme')).toBe('light')
  fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
  expect(screen.getByRole('button', { name: '展开侧栏' })).toHaveAttribute('aria-expanded', 'false')
  const navigation = screen.getByRole('navigation', { name: '管理控制台' })
  for (const page of pages) expect(within(navigation).getByRole('link', { name: page.title })).toHaveAttribute('href', page.path)
  fireEvent.focus(within(navigation).getByRole('link', { name: '模型网关' }))
  expect(screen.getAllByText('模型网关')).toHaveLength(2)
  fireEvent.keyDown(within(navigation).getByRole('link', { name: '模型网关' }), { key: 'Escape' })
  expect(screen.getAllByText('模型网关')).toHaveLength(1)
})

it('opens an accessible mobile drawer and restores trigger focus after Escape', async () => {
  render(<MemoryRouter><AppShell><h1>页面内容</h1></AppShell></MemoryRouter>)
  const trigger = screen.getByRole('button', { name: '打开导航' })
  fireEvent.click(trigger)
  const drawer = screen.getByRole('dialog', { name: '管理控制台导航' })
  for (const page of pages) expect(within(drawer).getByRole('link', { name: page.title })).toHaveAttribute('href', page.path)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: '模型网关' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(within(screen.getByRole('navigation', { name: '面包屑' })).getByText('模型网关')).toHaveAttribute('aria-current', 'page')
})
