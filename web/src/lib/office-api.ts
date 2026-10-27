import { ServiceError } from './localized-sharing'

export type OfficeDocument = {
  id: string; name: string; revision: number; size: number; updatedAt: number
  state: 'saved' | 'closed' | 'editing' | 'saving' | 'recovering' | 'error'
  error?: string | null
  originalName?: string; requiresSaveAs?: boolean
}
export type OfficeConfig = { enabled: boolean; maxBytes: number; publicUrl: string; formats: string[]; conversions?: Record<string, string> }
export type EditorLaunch = { scriptUrl: string; config: Record<string, unknown> }

export async function officeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/v1/office${path}`, options)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ServiceError(typeof body?.detail === 'string' ? body.detail : '请求失败', response.status)
  if (!body) throw new ServiceError('Office 服务未连接，请检查部署配置', response.status)
  return body as T
}
