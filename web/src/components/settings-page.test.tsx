import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SettingsPage } from './settings-page'
import { prototypeSnapshot } from '../../../shared/prototype-data'
import { setLanguage } from '../lib/i18n'

afterEach(() => { cleanup(); setLanguage('zh-CN') })

it('switches settings labels and feedback while preserving form and toggle values', () => {
  render(<SettingsPage snapshot={prototypeSnapshot} />)
  fireEvent.change(screen.getByLabelText('实例名称'), { target: { value: '我的实例' } })
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
  act(() => setLanguage('en'))
  expect(screen.getByLabelText('Instance name')).toHaveValue('我的实例')
  expect(screen.getByText('Compatible')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Prototype settings have been saved')
  fireEvent.click(screen.getByRole('tab', { name: 'Relay and federation' }))
  const relay = screen.getByRole('switch', { name: /Enable data relay/ })
  fireEvent.click(relay)
  expect(relay).not.toBeChecked()
  act(() => setLanguage('zh-CN'))
  expect(screen.getByRole('switch', { name: /启用数据中继/ })).not.toBeChecked()
  fireEvent.click(screen.getByRole('tab', { name: '保留与审计' }))
  fireEvent.change(screen.getByLabelText('审计保留期'), { target: { value: '180' } })
  act(() => setLanguage('en'))
  expect(screen.getByLabelText('Audit retention period')).toHaveValue('180')
  expect(screen.getByRole('option', { name: '180 days' })).toBeInTheDocument()
})

it('translates each settings tab in English', () => {
  setLanguage('en')
  render(<SettingsPage snapshot={prototypeSnapshot} />)
  for (const [tab, text] of [
    ['Identity and sign-in', 'Local accounts'],
    ['Infrastructure', 'Certificate rotation in 82 days'],
    ['Notifications', 'SMTP email'],
    ['Retention and audit', 'Instance time zone'],
    ['Instance information', 'Dangerous actions']
  ]) {
    fireEvent.click(screen.getByRole('tab', { name: tab }))
    expect(screen.getByText(text)).toBeInTheDocument()
  }
})
