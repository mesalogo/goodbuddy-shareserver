export const consoleModules = {
  distribution: { title: '配置下发', noun: '配置草稿', detail: '模型别名、客户端 Base URL 与配置说明', boundary: '保存配置草稿并导出供人工配置。尚不推送到设备，也不产生设备生效回执。' },
  members: { title: '组织与成员', noun: '成员登记', detail: '联系方式、用户组与拟分配角色', boundary: '维护实例内的成员登记簿。登记不会创建登录账号、发送邀请或授予权限。' },
  policies: { title: '权限策略', noun: '策略草案', detail: '主体、资源、允许或拒绝的动作与限制', boundary: '保存和评审策略草案。草案尚未接入执行端，不改变现有共享权限。' },
  approvals: { title: '审批', noun: '申请', detail: '申请事项、目标资源与申请理由', boundary: '记录人工提交的申请与审核决定。通过仅代表管理记录，不自动授权或执行申请事项。' },
  releases: { title: '资源与更新', noun: '资源登记', detail: '版本、下载地址、校验摘要与更新说明', boundary: '维护资源版本登记簿并导出。文件上传、签名验证与客户端自动更新尚未启用。' },
  federation: { title: '网关互联', noun: '合作网关登记', detail: '对方地址、组织标识、公钥指纹与拟开放范围', boundary: '保存合作网关的接入资料。登记不建立信任，不进行远端连接或目录交换。' },
  tasks: { title: '任务中心', noun: '任务计划', detail: '提供者、目标能力、执行范围与验收条件', boundary: '维护人工任务计划。保存后不会启动远端 Runtime；实际任务路由和中继尚未启用。' },
  settings: { title: '系统设置', noun: '实例资料', detail: '公开地址、管理员联系方式与部署备注', boundary: '保存实例资料备注。部署环境、认证方式和服务开关仍由部署配置管理；此处请勿填写密钥。' }
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
}
export interface ConsoleAudit { id: string; module: ConsoleModule; recordId: string; action: string; at: string; revision: number }
export interface ConsoleSnapshot { records: ConsoleRecord[]; audits: ConsoleAudit[] }
