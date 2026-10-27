import { useEffect, useRef, useState } from 'react'
import { adminFetch } from '../lib/admin-fetch'
import { useI18n } from '../lib/i18n'
import { Button } from './ui/button'

export type ReleaseAsset = { url: string; sha256: string; name: string }
export type ReleaseAssetsProps = { onAttach?: (asset: ReleaseAsset) => void }
const maxSize = 20 * 1024 * 1024

/** Uploads local release resources; onAttach copies metadata into the host editor. */
export function ReleaseAssets({ onAttach }: ReleaseAssetsProps = {}) {
  const { t } = useI18n()
  const [file, setFile] = useState<File>()
  const [asset, setAsset] = useState<ReleaseAsset & { size: number }>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<number | 'network' | 'cancelled'>()
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => { request.current?.abort() }, [])
  async function upload() {
    if (!file || request.current) return
    if (file.size > maxSize) { setStatus(413); return }
    const controller = new AbortController()
    request.current = controller
    setBusy(true); setStatus(undefined); setAsset(undefined)
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await adminFetch('/api/v1/console-assets', { method: 'POST', body, credentials: 'same-origin', signal: controller.signal })
      if (controller.signal.aborted) return
      if (!response.ok) { setStatus(response.status); return }
      const result = await response.json() as ReleaseAsset & { size: number }
      if (!/^[a-f0-9]{64}$/.test(result.sha256) || typeof result.name !== 'string' || typeof result.size !== 'number' || result.url !== `/api/v1/console-assets/${result.sha256}?name=${encodeURIComponent(result.name)}`) throw new Error('Invalid asset response')
      if (!controller.signal.aborted) {
        setAsset(result)
        onAttach?.({ url: result.url, sha256: result.sha256, name: result.name })
      }
    } catch { if (!controller.signal.aborted) setStatus('network') }
    finally { if (request.current === controller) { request.current = null; setBusy(false) } }
  }
  const error = status === 413 ? t('文件最大为 20 MiB。', 'Maximum file size is 20 MiB.')
    : status === 401 ? t('登录已过期，请重新登录后重试。', 'Your session expired. Sign in and retry.')
      : status === 403 ? t('无权上传，请检查管理员登录和控制台地址。', 'Upload denied. Check your administrator session and console address.')
        : status === 'cancelled' ? t('已取消上传。', 'Upload cancelled.')
          : status ? t('上传失败，请重试。', 'Upload failed. Please retry.') + (typeof status === 'number' ? ` (HTTP ${status})` : '') : ''
  return <section className="space-y-4" aria-label={t('发布资源', 'Release assets')} aria-busy={busy}>
    <p className="text-sm text-[var(--text-muted)]">{t('上传发布文件（最大 20 MiB）。文件仅保存在服务器本地数据目录，请备份；下载需要管理员登录。', 'Upload a release file (maximum 20 MiB). Files are stored only in the server’s local data directory; keep a backup. Downloads require administrator sign-in.')}</p>
    <label className="block">{t('选择发布文件', 'Choose release file')}<input type="file" className="block" disabled={busy} onChange={event => { setFile(event.target.files?.[0]); setStatus(undefined); setAsset(undefined) }} /></label>
    <div className="flex gap-2">
      <Button type="button" disabled={!file || busy} onClick={() => void upload()}>{t('上传资源', 'Upload asset')}</Button>
      {busy && <Button type="button" variant="secondary" onClick={() => { request.current?.abort(); request.current = null; setBusy(false); setStatus('cancelled') }}>{t('取消上传', 'Cancel upload')}</Button>}
    </div>
    {busy && <div role="status"><progress aria-label={t('正在上传', 'Uploading')} /> {t('正在上传并保存…', 'Uploading and saving…')}</div>}
    {error && <p role={status === 'cancelled' ? 'status' : 'alert'}>{error}</p>}
    {asset && <div className="space-y-2 break-all">
      <p role="status">{t('上传完成', 'Upload complete')} · {asset.name} · {asset.size} {t('字节', 'bytes')}</p>
      <label className="block">{t('资源 URL', 'Asset URL')}<input className="block w-full" readOnly value={asset.url} /></label>
      <label className="block">SHA-256<input className="block w-full" readOnly value={asset.sha256} /></label>
      <a className="underline" href={asset.url} download={asset.name}>{t('下载资源', 'Download asset')}</a>
    </div>}
  </section>
}
