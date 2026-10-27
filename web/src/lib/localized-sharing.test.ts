import { afterEach, expect, it, vi } from 'vitest'
import { setLanguage } from './i18n'
import { officeRequest } from './office-api'
import { sharingRequest } from './sharing-api'

afterEach(() => { setLanguage('zh-CN'); vi.unstubAllGlobals() })

it('localizes Office errors when caught and after a later language switch', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: '文档不存在' }) }))
  const error = await officeRequest<never>('/documents/missing').catch(reason => reason as Error)
  expect(error.message).toContain('文档不存在')
  setLanguage('en')
  expect(error.message).toBe('Document not found (HTTP 404)')
})

it('does not expose unmapped Chinese API messages in English', async () => {
  setLanguage('en')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: '未知后端错误', code: 'INTERNAL_ERROR', requestId: 'request-a' }) }))
  await expect(sharingRequest('/devices')).rejects.toThrow('The operation failed. Please try again. (HTTP 500 · INTERNAL_ERROR · Request ID: request-a)')
})
