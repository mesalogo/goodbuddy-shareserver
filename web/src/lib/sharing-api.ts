import { adminFetch } from './admin-fetch'

export async function sharingRequest<T>(
  path: string,
  signal?: AbortSignal,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const init: RequestInit = { signal }
  if (method !== 'GET') init.method = method
  if (body !== undefined) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(body) }
  const response = await adminFetch(`/api/v1/sharing${path}`, init)
  const payload = await response.json().catch(() => null) as { code?: string; message?: string; requestId?: string } | null
  if (!response.ok) {
    const details = [payload?.code, payload?.requestId ? `请求 ID：${payload.requestId}` : ''].filter(Boolean).join(' · ')
    throw new Error(`${payload?.message ?? `HTTP ${response.status}`}${details ? `（${details}）` : ''}`)
  }
  return payload as T
}
