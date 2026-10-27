export const consoleModules = {
  distribution: { title: '配置下发', noun: '配置草稿', detail: '配置说明', boundary: '维护版本、模型别名和客户端地址，审核后下载客户端配置。由使用者配置客户端，设备推送与回执由跨端协议完成。' },
  members: { title: '组织与成员', noun: '成员登记', detail: '联系方式、用户组与拟分配角色', boundary: '维护实例内的成员登记簿。登记不会创建登录账号、发送邀请或授予权限。' },
  policies: { title: '权限策略', noun: '策略草案', detail: '策略说明', boundary: '定义主体、资源与动作，审核后可测试匹配结果。模拟器采用拒绝优先规则，运行时授权仍使用现有认证机制。' },
  approvals: { title: '审批', noun: '申请', detail: '申请事项、目标资源与申请理由', boundary: '记录人工提交的申请与审核决定。通过仅代表管理记录，不自动授权或执行申请事项。' },
  releases: { title: '资源与更新', noun: '资源登记', detail: '更新说明', boundary: '上传资源文件并生成 SHA-256 摘要，维护版本、通道和适用平台，审核后供管理员下载分发。摘要校验不等同于数字签名。' },
  federation: { title: '网关互联', noun: '合作网关登记', detail: '对方地址、组织标识、公钥指纹与拟开放范围', boundary: '保存合作网关的接入资料。登记不建立信任，不进行远端连接或目录交换。' },
  tasks: { title: '任务中心', noun: '任务计划', detail: '任务说明', boundary: '分配负责人、截止日期和验收标准。审核后开始任务、记录完成结果或取消原因，进度由管理员人工维护。' },
  settings: { title: '系统设置', noun: '实例资料', detail: '部署备注', boundary: '管理实例显示名称、管理员联系方式和公告。最近更新的已审核资料展示在运行概览；部署环境和认证参数由部署配置管理。' }
} as const

export type ConsoleModule = keyof typeof consoleModules
export type RecordStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'archived'
export const statusTransitions: Record<RecordStatus, readonly RecordStatus[]> = {
  draft: ['pending', 'archived'],
  pending: ['approved', 'rejected', 'archived'],
  approved: ['archived'],
  rejected: ['draft', 'archived'],
  archived: ['draft']
}
export const statusLabels: Record<RecordStatus, string> = { draft: '草稿', pending: '待审核', approved: '审核通过（仅记录）', rejected: '已驳回', archived: '已归档' }
export interface ConsoleRecord {
  id: string
  module: ConsoleModule
  name: string
  detail: string
  status: RecordStatus
  revision: number
  createdAt: string
  updatedAt: string
  fields?: Record<string, string>
  progress?: import('./control-fields.js').TaskProgress
  result?: string
}
export interface ConsoleAudit { id: string; module: ConsoleModule; recordId: string; action: string; at: string; revision: number }
export interface ConsoleSnapshot { records: ConsoleRecord[]; audits: ConsoleAudit[] }
