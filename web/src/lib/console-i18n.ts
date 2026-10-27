import { consoleModules, statusLabels, type ConsoleModule, type RecordStatus } from '../../../shared/console'
import { translate as t } from './i18n'
import { controlFields } from '../../../shared/control-fields'

const modules: Record<ConsoleModule, { title: string; noun: string; detail: string; boundary: string }> = {
  distribution: { title: 'Configuration distribution', noun: 'configuration draft', detail: 'Configuration notes', boundary: 'Manage versions, model aliases and client URLs. Download approved configurations for client setup. Device push and receipts require the cross-device protocol.' },
  members: { title: 'Organizations and members', noun: 'member registration', detail: 'Contact information, groups and proposed roles', boundary: 'Maintain the member register for this instance. Registration does not create login accounts, send invitations or grant permissions.' },
  policies: { title: 'Permission policies', noun: 'policy draft', detail: 'Policy notes', boundary: 'Define subjects, resources and actions, then test approved policies. The simulator uses deny precedence; runtime authorization continues to use existing authentication.' },
  approvals: { title: 'Approvals', noun: 'application', detail: 'Request, target resources and reasons', boundary: 'Record manually submitted applications and review decisions. Approval is a management record only; it does not grant access or execute requests.' },
  releases: { title: 'Resources and updates', noun: 'resource registration', detail: 'Release notes', boundary: 'Upload files with generated SHA-256 checksums. Manage versions, channels and target platforms for administrator download and distribution. A checksum is not a digital signature.' },
  federation: { title: 'Gateway connections', noun: 'partner gateway registration', detail: 'Partner URL, organization ID, public key fingerprint and proposed scope', boundary: 'Save connection details for partner gateways. Registration does not establish trust, connect remotely or exchange catalogs.' },
  tasks: { title: 'Task center', noun: 'task plan', detail: 'Task notes', boundary: 'Assign owners, due dates and acceptance criteria. After approval, start tasks and record results or cancellation reasons. Administrators maintain progress manually.' },
  settings: { title: 'System settings', noun: 'instance information', detail: 'Deployment notes', boundary: 'Manage the instance display name, administrator contact and announcement. Overview displays the most recently updated approved profile. Environment and authentication parameters remain deployment settings.' }
}

export function localizedModule(module: ConsoleModule) {
  const zh = consoleModules[module], en = modules[module]
  return { title: t(zh.title, en.title), noun: t(zh.noun, en.noun), detail: t(zh.detail, en.detail), boundary: t(zh.boundary, en.boundary) }
}

const statuses: Record<RecordStatus, string> = { draft: 'Draft', pending: 'Pending review', approved: 'Approved (record only)', rejected: 'Rejected', archived: 'Archived' }
export function localizedStatus(status: RecordStatus) { return t(statusLabels[status], statuses[status]) }
export function localizedTransition(status: RecordStatus) {
  const labels: Record<RecordStatus, [string, string]> = { draft: ['恢复草稿', 'Restore draft'], pending: ['提交审核', 'Submit for review'], approved: ['记录通过', 'Record approval'], rejected: ['驳回', 'Reject'], archived: ['归档', 'Archive'] }
  return t(...labels[status])
}

export function localizedAuditAction(action: string, translateChineseStatuses = true) {
  const taskActions: Record<string, [string, string]> = { 'task:in_progress': ['开始任务', 'Task started'], 'task:completed': ['完成任务', 'Task completed'], 'task:cancelled': ['取消任务', 'Task cancelled'] }
  if (taskActions[action]) return t(...taskActions[action])
  return action.split(' → ').map(part => {
    if (Object.hasOwn(statuses, part)) return t(translateChineseStatuses ? statusLabels[part as RecordStatus] : part, statuses[part as RecordStatus])
    if (part === '创建') return t(part, 'Created')
    if (part === '编辑') return t(part, 'Edited')
    return t(part, /\p{Script=Han}/u.test(part) ? 'Management action' : part)
  }).join(' → ')
}

const errors: Record<string, string> = {
  '管理模块不存在。': 'Management module not found.',
  '请输入有效的记录。': 'Enter a valid record.',
  '名称需为 1–200 字，详细说明最多 12000 字。': 'The name must contain 1–200 characters and details must not exceed 12,000 characters.',
  '记录版本无效。': 'Invalid record revision.',
  '记录状态无效。': 'Invalid record status.',
  '记录不存在。': 'Record not found.',
  '记录已被修改，请刷新后重试。': 'The record has changed. Refresh and try again.',
  '记录已更新，请刷新后重试': 'The record has changed. Refresh and try again.',
  '新记录必须从草稿开始。': 'New records must start as drafts.',
  '当前状态不允许此操作。': 'This action is not allowed in the current state.',
  '请先恢复为草稿再编辑内容。': 'Restore the record to a draft before editing its content.',
  '登记记录已达 5000 条上限。': 'The register has reached its limit of 5,000 records.',
  '无法读取管理记录': 'Unable to read management records.',
  '加载失败': 'Failed to load.',
  '保存失败': 'Failed to save.',
  '拓扑数据加载失败': 'Failed to load topology data.',
  '暂时无法读取': 'Records are temporarily unavailable.',
  '存储不可写': 'Storage is not writable.',
  '管理数据读取或保存失败，请检查服务端存储。': 'Unable to read or save management data. Check server storage.'
}

// Keep the source error until rendering so an open error follows language changes.
export class ConsoleRequestError extends Error {
  constructor(message: string, readonly code: string | number) { super(message) }
}
export function localizedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const fieldError = message.match(/^(Required field|Invalid field|Invalid URL|Invalid email|Invalid date): (\w+)$/)
  if (fieldError) {
    const field = Object.values(controlFields).flat().find(f => f.key === fieldError[2])
    const label = field ? t(...field.label) : fieldError[2]
    return fieldError[1] === 'Required field' ? t('请填写：{label}', 'Required field: {label}', { label }) : t('请检查字段格式：{label}', 'Check field format: {label}', { label })
  }
  const controlErrors: Record<string, string> = {
    'Invalid structured fields.': '业务字段格式无效。', 'Unknown structured field.': '包含未知业务字段。',
    'Invalid SHA-256 checksum.': 'SHA-256 摘要应为 64 位十六进制字符。',
    'Finish or cancel the task before archiving.': '请先完成或取消任务，再归档。',
    'A result or cancellation reason is required (maximum 12000 characters).': '请填写结果或取消原因（最多 12000 字）。',
    'Approve a complete structured configuration before exporting.': '请补齐配置业务字段并审核通过后再下载。',
    'Subject, resource and action are required (maximum 200 characters each).': '请填写主体、资源和动作（各最多 200 字）。'
  }
  if (controlErrors[message]) return t(controlErrors[message], message)
  const legacyCode = message.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/)?.[0] ?? message.match(/\bHTTP \d{3}\b/)?.[0]
  const hasChinese = /\p{Script=Han}/u.test(message)
  const code = error instanceof ConsoleRequestError ? ` (${error.code})` : hasChinese && legacyCode ? ` (${legacyCode})` : ''
  return t(message, (errors[message] ?? (hasChinese ? 'Request failed. Please try again.' : message)) + code)
}
