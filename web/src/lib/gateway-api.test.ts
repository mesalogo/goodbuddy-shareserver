import { afterEach, describe, expect, it, vi } from 'vitest'
import { gatewayRequest } from './gateway-api'
import { setLanguage } from './i18n'

afterEach(() => { vi.unstubAllGlobals(); setLanguage('zh-CN') })

describe('localized gateway errors', () => {
  it.each(['INVALID_ALIAS', 'UPSTREAM_FAILURE', 'REQUEST_TIMEOUT', 'ACCESS_KEY_NOT_FOUND', 'UNRECOGNIZED', '__proto__'])('localizes %s without exposing server content', async code => {
    setLanguage('en')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: 'private-api-key' } }), { status: 400 })))
    const error = await gatewayRequest('/config', new AbortController().signal).catch((cause: unknown) => cause) as Error
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toContain('HTTP 400')
    expect(error.message).not.toMatch(/[\u4e00-\u9fff]/)
    expect(error.message).not.toContain('private-api-key')
    setLanguage('zh-CN')
    expect(error.message).toMatch(/[\u4e00-\u9fff]/)
    expect(error.message).not.toContain('private-api-key')
  })

  it('localizes network failures without echoing transport errors', async () => {
    setLanguage('en')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-api-key')))
    const error = await gatewayRequest('/config', new AbortController().signal).catch((cause: unknown) => cause) as Error
    expect(error.message).toBe('Network request failed. Check your connection and try again.')
    setLanguage('zh-CN')
    expect(error.message).toBe('网络请求失败，请检查连接后重试。')
  })
})
