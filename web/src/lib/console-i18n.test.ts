import { afterEach, expect, it } from 'vitest'
import { consoleModules, statusLabels, type ConsoleModule, type RecordStatus } from '../../../shared/console'
import { ConsoleRequestError, localizedAuditAction, localizedError, localizedModule, localizedStatus, localizedTransition } from './console-i18n'
import { setLanguage } from './i18n'

afterEach(() => setLanguage('zh-CN'))

it('preserves Chinese module and status labels and translates every English field', () => {
  setLanguage('zh-CN')
  for (const module of Object.keys(consoleModules) as ConsoleModule[]) expect(localizedModule(module)).toEqual(consoleModules[module])
  for (const status of Object.keys(statusLabels) as RecordStatus[]) expect(localizedStatus(status)).toBe(statusLabels[status])
  setLanguage('en')
  for (const module of Object.keys(consoleModules) as ConsoleModule[]) {
    for (const value of Object.values(localizedModule(module))) {
      expect(value).not.toMatch(/\p{Script=Han}/u)
      expect(value.length).toBeGreaterThan(0)
    }
  }
  for (const status of Object.keys(statusLabels) as RecordStatus[]) {
    expect(localizedStatus(status)).not.toMatch(/\p{Script=Han}/u)
    expect(localizedTransition(status)).not.toMatch(/\p{Script=Han}/u)
  }
  expect(localizedAuditAction('编辑')).toBe('Edited')
  expect(localizedAuditAction('pending → approved')).toBe('Pending review → Approved (record only)')
})

it('translates validation and storage failures and retains unknown error codes', () => {
  const error = new ConsoleRequestError('名称需为 1–200 字，详细说明最多 12000 字。', 400)
  setLanguage('en')
  expect(localizedError(error)).toBe('The name must contain 1–200 characters and details must not exceed 12,000 characters. (400)')
  expect(localizedError(new ConsoleRequestError('管理数据读取或保存失败，请检查服务端存储。', 500))).toContain('Check server storage.')
  expect(localizedError(new Error('未知错误（SHARING_UNAVAILABLE · 请求 ID：abc）'))).toBe('Request failed. Please try again. (SHARING_UNAVAILABLE)')
  expect(localizedError(new Error('Request failed (HTTP 503 · SHARING_UNAVAILABLE)'))).toBe('Request failed (HTTP 503 · SHARING_UNAVAILABLE)')
  setLanguage('zh-CN')
  expect(localizedError(error)).toBe(error.message)
})
