import { translate } from './i18n'

const messages = [
  ['网络请求失败', 'Network request failed. Check your connection and try again.'],
  ['请求失败', 'Request failed. Please try again.'],
  ['操作失败，请重试。', 'The operation failed. Please try again.'],
  ['文档不存在', 'Document not found'],
  ['文件超过大小限制', 'The file exceeds the size limit'],
  ['Office 存储额度不足', 'Office storage quota exceeded'],
  ['Office 尚未启用，请配置 ShareServer Office 模块', 'Office is disabled. Configure the ShareServer Office module.'],
  ['Office 服务未连接，请检查部署配置', 'Office is unavailable. Check the deployment configuration.'],
  ['Office 操作失败，最近成功版本保留', 'The Office operation failed. The last saved version is retained.'],
  ['HTTPS 页面需要配置 HTTPS 的 ONLYOFFICE 地址', 'An HTTPS page requires an HTTPS ONLYOFFICE URL.'],
  ['无法加载 ONLYOFFICE，请检查编辑服务地址', 'Unable to load ONLYOFFICE. Check the editor service URL.'],
  ['ONLYOFFICE 编辑器 API 未就绪', 'The ONLYOFFICE editor API is not ready.'],
  ['编辑器发生错误', 'An editor error occurred.'],
  ['ONLYOFFICE 签名无效', 'Invalid ONLYOFFICE signature'],
  ['编辑轮次已过期', 'The editing session has expired.'],
  ['编辑服务结果待确认，请等待回调或核对轮次', 'The editor result is unconfirmed. Wait for the callback or reconcile the session.'],
  ['编辑轮次正在保存或待确认，请等待回调后重试', 'The editing session is saving or awaiting confirmation. Wait for the callback and try again.'],
  ['当前轮次不可发起保存，请等待正在进行的保存', 'This session cannot start a save. Wait for the current save to finish.'],
  ['ONLYOFFICE 拒绝保存命令', 'ONLYOFFICE rejected the save command.'],
  ['尚无编辑轮次', 'No editing session exists yet.'],
  ['编辑服务无法确认该轮次；保留已保存版本，需检查编辑服务缓存', 'The editor cannot confirm this session. The saved version is retained; check the editor service cache.'],
  ['ONLYOFFICE 报告保存失败；保留最近成功版本', 'ONLYOFFICE reported a save failure. The last saved version is retained.'],
  ['保存失败；最近成功版本未改变，可重试回调', 'Saving failed. The last saved version is unchanged; the callback can be retried.'],
  ['转换源文件已释放，请重新上传', 'The conversion source is no longer available. Upload the file again.'],
  ['文件不是受支持的旧版 Office 二进制文件', 'This is not a supported legacy Office binary file.'],
  ['转换结果地址无效', 'Invalid conversion result URL'],
  ['无法下载转换结果', 'Unable to download the converted file'],
  ['旧格式转换或下载失败，请重试；原文件未修改', 'Legacy format conversion or download failed. Try again; the original file is unchanged.'],
  ['请使用有效的 Office 文件名（最多 200 字符）', 'Use a valid Office filename (up to 200 characters).'],
  ['版本号无效', 'Invalid revision number'],
  ['该文档版本不存在', 'This document revision does not exist.']
] as const

/** Keep source errors in state so switching languages also updates existing alerts. */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(typeof value === 'string' ? value : '操作失败，请重试。')
}

export function localizedError(value: string | Error): string {
  if (value instanceof ServiceError) return value.message
  const text = (value instanceof Error ? value.message : value).replace(/^(?:Error|TypeError):\s*/, '')
  const pair = messages.find(([zh, en]) => text === zh || text === en)
  if (pair) return translate(pair[0], pair[1])
  if (['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.'].includes(text)) return translate(...messages[0])
  // Unknown server text can contain Chinese (or another language). Only show it
  // in Chinese mode; English gets a clear fallback, with HTTP context added below.
  return translate(text || '操作失败，请重试。', 'The operation failed. Please try again.')
}

export class ServiceError extends Error {
  constructor(readonly sourceMessage: string, readonly status: number, readonly code?: string, readonly requestId?: string) {
    super()
    this.name = 'ServiceError'
    Object.defineProperty(this, 'message', { configurable: true, get: () => {
      const details = [`HTTP ${status}`, code, requestId ? translate('请求 ID：{id}', 'Request ID: {id}', { id: requestId }) : ''].filter(Boolean).join(' · ')
      return `${localizedError(sourceMessage)} (${details})`
    } })
  }
}

/** JWT-signed editor configurations must be changed and re-signed by the server. */
export function localizedEditorConfig(config: Record<string, unknown>, language: string): Record<string, unknown> {
  if (config.token) return config
  return { ...config, editorConfig: { ...(config.editorConfig as Record<string, unknown> | undefined), lang: language === 'en' ? 'en' : 'zh-CN' } }
}
