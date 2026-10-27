import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { formatDate, setLanguage, translate, useI18n } from './i18n'

function Sample() {
  const { language, t, setLanguage } = useI18n()
  return <button onClick={() => setLanguage(language === 'en' ? 'zh-CN' : 'en')}>{t('你好 {name}', 'Hello {name}', { name: '中文用户' })}</button>
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); setLanguage('zh-CN'); localStorage.clear() })

it('switches all mounted consumers and preserves interpolated user data', () => {
  setLanguage('zh-CN')
  render(<><Sample /><Sample /></>)
  fireEvent.click(screen.getAllByRole('button')[0])
  expect(screen.getAllByText('Hello 中文用户')).toHaveLength(2)
  expect(localStorage.getItem('shareserver-language')).toBe('en')
  expect(document.documentElement.lang).toBe('en')
})

it('synchronizes a language change from another tab and localizes dates', () => {
  setLanguage('zh-CN')
  render(<Sample />)
  act(() => { localStorage.setItem('shareserver-language', 'en'); window.dispatchEvent(new StorageEvent('storage', { key: 'shareserver-language', newValue: 'en' })) })
  expect(screen.getByRole('button')).toHaveTextContent('Hello 中文用户')
  expect(formatDate('2026-10-26T12:00:00Z')).toContain('Oct')
  expect(formatDate('invalid')).toBe('Unknown')
})

it('keeps language switching available when browser storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  setLanguage('en')
  render(<Sample />)
  expect(screen.getByRole('button')).toHaveTextContent('Hello 中文用户')
  fireEvent.click(screen.getByRole('button'))
  expect(translate('已保存', 'Saved')).toBe('已保存')
})
