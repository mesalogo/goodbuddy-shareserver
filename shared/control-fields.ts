import type { ConsoleModule } from './console.js'

export interface ControlField { key: string; label: [string, string]; type?: 'url' | 'email' | 'date' | 'textarea'; options?: [string, string, string][]; required?: boolean }
// A single schema drives the editor and server validation. Existing text-only
// records remain readable; structured records are checked before approval.
export const controlFields: Record<ConsoleModule, ControlField[]> = {
  members: [
    { key: 'email', label: ['邮箱', 'Email'], type: 'email' },
    { key: 'group', label: ['用户组', 'Group'] },
    { key: 'role', label: ['组织职务', 'Organization role'] },
    { key: 'deviceIds', label: ['关联设备 ID（逗号分隔）', 'Associated device IDs (comma separated)'] }
  ],
  distribution: [
    { key: 'version', label: ['配置版本', 'Configuration version'], required: true },
    { key: 'baseUrl', label: ['客户端 Base URL', 'Client Base URL'], type: 'url', required: true },
    { key: 'models', label: ['模型别名（逗号分隔）', 'Model aliases (comma separated)'], required: true },
    { key: 'target', label: ['适用设备或用户组', 'Target devices or groups'] }
  ],
  policies: [
    { key: 'subject', label: ['主体（成员 ID 或 *）', 'Subject (member ID or *)'], required: true },
    { key: 'resource', label: ['资源标识（或 *）', 'Resource ID (or *)'], required: true },
    { key: 'actions', label: ['动作（逗号分隔）', 'Actions (comma separated)'], required: true },
    { key: 'effect', label: ['决策', 'Decision'], required: true, options: [['allow', '允许', 'Allow'], ['deny', '拒绝', 'Deny']] }
  ],
  approvals: [
    { key: 'applicant', label: ['申请人', 'Applicant'], required: true },
    { key: 'target', label: ['关联记录 ID', 'Related record ID'] },
    { key: 'reason', label: ['申请理由', 'Reason'], type: 'textarea', required: true }
  ],
  releases: [
    { key: 'version', label: ['资源版本', 'Resource version'], required: true },
    { key: 'channel', label: ['发布通道', 'Release channel'], options: [['stable', '稳定版', 'Stable'], ['preview', '预览版', 'Preview']] },
    { key: 'url', label: ['下载地址', 'Download URL'], type: 'url' },
    { key: 'sha256', label: ['SHA-256 摘要', 'SHA-256 checksum'] },
    { key: 'platform', label: ['适用平台', 'Target platform'] }
  ],
  federation: [
    { key: 'url', label: ['合作网关地址', 'Partner gateway URL'], type: 'url', required: true },
    { key: 'organization', label: ['组织标识', 'Organization ID'], required: true },
    { key: 'fingerprint', label: ['公钥指纹', 'Public key fingerprint'] },
    { key: 'scope', label: ['协商共享范围', 'Proposed sharing scope'], type: 'textarea' },
    { key: 'contact', label: ['联系邮箱', 'Contact email'], type: 'email' }
  ],
  tasks: [
    { key: 'assignee', label: ['负责人', 'Assignee'], required: true },
    { key: 'dueDate', label: ['截止日期', 'Due date'], type: 'date' },
    { key: 'target', label: ['关联资源或设备', 'Related resource or device'] },
    { key: 'acceptance', label: ['验收标准', 'Acceptance criteria'], type: 'textarea', required: true }
  ],
  settings: [
    { key: 'displayName', label: ['实例显示名称', 'Instance display name'], required: true },
    { key: 'contact', label: ['管理员联系邮箱', 'Administrator contact'], type: 'email' },
    { key: 'announcement', label: ['控制台公告', 'Console announcement'], type: 'textarea' }
  ]
}

export type TaskProgress = 'queued' | 'in_progress' | 'completed' | 'cancelled'
export const taskTransitions: Record<TaskProgress, TaskProgress[]> = { queued: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] }

export function evaluatePolicies(records: import('./console.js').ConsoleRecord[], subject: string, resource: string, action: string) {
  const matches = records.filter(r => r.module === 'policies' && r.status === 'approved' && r.fields &&
    [subject, '*'].includes(r.fields.subject) && [resource, '*'].includes(r.fields.resource) &&
    r.fields.actions.split(',').map(v => v.trim()).some(v => v === action || v === '*'))
  return { decision: matches.some(r => r.fields?.effect === 'deny') ? 'deny' : matches.some(r => r.fields?.effect === 'allow') ? 'allow' : 'deny', matchedIds: matches.map(r => r.id) }
}
