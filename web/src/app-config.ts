import {
  Activity,
  Boxes,
  Building2,
  CircleUserRound,
  Cpu,
  FileText,
  FileKey2,
  Gauge,
  GitFork,
  PackageCheck,
  Network,
  Send,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserRoundCheck
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PrototypeRole } from '../../shared/prototype-data'
import { translate } from './lib/i18n'

export type PageConfig = {
  path: string
  title: string
  shortTitle?: string
  description: string
  dataKey?: string
  icon: LucideIcon
  role: PrototypeRole | 'all'
  primaryAction?: string
  group?: string
  tabs?: Array<{ label: string; dataKey: string }>
  boundary?: string
  next?: { label: string; to: string }
}

export const pages: PageConfig[] = [
  {
    path: '/',
    title: '运行概览',
    description: 'GoodBuddy 组织服务、接入状态与待处理事项。',
    icon: Gauge,
    role: 'admin',
    tabs: [{ label: '服务状态', dataKey: 'status' }, { label: '待处理事项', dataKey: 'pending' }, { label: '最近活动', dataKey: 'activity' }]
  },
  {
    path: '/model-gateway',
    title: '模型网关',
    description: '本地技术预览：配置真实上游与模型别名、测试转发并查看审计；尚无组织认证与配额。',
    icon: Network,
    role: 'admin',
    group: 'GoodBuddy 服务',
    tabs: [{ label: '概览', dataKey: 'overview' }, { label: '上游服务', dataKey: 'upstreams' }, { label: '模型目录', dataKey: 'models' }, { label: '访问密钥', dataKey: 'keys' }, { label: '请求测试', dataKey: 'test' }, { label: '调用审计', dataKey: 'audits' }, { label: '客户端接入', dataKey: 'client' }]
  },
  {
    path: '/documents',
    title: '文档与协作',
    description: '上传 DOCX，通过 ONLYOFFICE 编辑并持久保存到 ShareServer。',
    icon: FileText,
    role: 'admin',
    group: 'GoodBuddy 服务',
    tabs: [{ label: '文档库', dataKey: 'documents' }, { label: '编辑会话', dataKey: 'sessions' }, { label: 'Office 服务', dataKey: 'office' }, { label: '保存记录', dataKey: 'saves' }]
  },
  {
    path: '/distribution',
    title: '配置下发',
    description: '保存、审核和导出配置草稿，供客户端人工配置。',
    icon: Send,
    role: 'admin',
    group: 'GoodBuddy 服务',
    tabs: [{ label: '配置草稿', dataKey: 'drafts' }, { label: '设备生效', dataKey: 'devices' }, { label: '发布记录', dataKey: 'releases' }, { label: '回滚记录', dataKey: 'rollbacks' }]
  },
  {
    path: '/members',
    title: '组织与成员',
    description: '管理当前组织的成员、用户组和有界角色。',
    dataKey: 'members',
    icon: Building2,
    role: 'admin',
    group: '组织管理',
    boundary: '成员、用户组、角色、登录和组织授权 API 尚未接入。当前不显示成员示例，也不能从此页面发送不会生效的邀请。',
    tabs: [
      { label: '成员', dataKey: 'members' },
      { label: '用户组', dataKey: 'groups' },
      { label: '角色', dataKey: 'roles' }
    ]
  },
  {
    path: '/devices',
    title: 'GoodBuddy 接入',
    description: '管理 GoodBuddy 客户端与设备的注册、连接状态和接入授权。',
    dataKey: 'devices',
    icon: Cpu,
    role: 'admin',
    group: '共享资源',
    boundary: '当前可以查看真实登记设备和共享目录元数据。设备在线状态、身份认证、设备撤销和注册链接 API 尚未接入。',
    next: { label: '查看真实设备目录', to: '/devices' },
    tabs: [{ label: '设备列表', dataKey: 'list' }, { label: '设备详情', dataKey: 'detail' }, { label: '连接记录', dataKey: 'connections' }, { label: '撤销记录', dataKey: 'revocations' }]
  },
  {
    path: '/capabilities',
    title: '共享中心',
    description: '按内容、发布用户或提供设备查看共享能力与知识库。',
    dataKey: 'capabilities',
    icon: Boxes,
    role: 'admin',
    group: '共享资源',
    tabs: [{ label: '能力目录', dataKey: 'capabilities' }, { label: '共享知识库', dataKey: 'knowledge' }, { label: '按成员查看', dataKey: 'members' }, { label: '按设备查看', dataKey: 'devices' }]
  },
  {
    path: '/policies',
    title: '权限策略',
    description: '配置拒绝优先的组织强制策略与 Grant。',
    dataKey: 'policies',
    icon: ShieldCheck,
    role: 'admin',
    group: '组织管理',
    boundary: '权限策略、Grant、配额和组织授权 API 尚未接入。共享目录中的权限字段目前只是发布者声明，不能在此执行授权决策。',
    tabs: [{ label: '强制策略', dataKey: 'mandatory' }, { label: 'Grant', dataKey: 'grants' }, { label: '策略模拟', dataKey: 'simulation' }, { label: '变更记录', dataKey: 'changes' }]
  },
  {
    path: '/approvals',
    title: '审批',
    description: '处理调用、发布、更新和联邦申请。',
    dataKey: 'approvals',
    icon: UserRoundCheck,
    role: 'admin',
    group: '组织管理',
    tabs: [{ label: '待处理', dataKey: 'pending' }, { label: '已处理', dataKey: 'processed' }, { label: '我的申请', dataKey: 'mine' }, { label: '审批规则', dataKey: 'rules' }]
  },
  {
    path: '/releases',
    title: '资源与更新',
    description: '管理签名能力包、发布通道、更新策略和撤销。',
    dataKey: 'releases',
    icon: PackageCheck,
    role: 'admin',
    group: '运营与审计',
    boundary: '能力包存储、签名校验、版本发布和客户端更新 API 尚未接入。当前不提供上传按钮，避免产生未保存的发布记录。',
    tabs: [{ label: '能力包', dataKey: 'packages' }, { label: '发布通道', dataKey: 'channels' }, { label: '更新策略', dataKey: 'policies' }, { label: '撤销记录', dataKey: 'revocations' }]
  },
  {
    path: '/federation',
    title: '网关互联',
    description: '管理经双边确认的组织协作边界。',
    dataKey: 'federation',
    icon: GitFork,
    role: 'admin',
    group: '运营与审计',
    boundary: '联邦握手、双边确认、共享范围和跨网关连接 API 尚未接入。当前不显示虚构的网关关系或连接状态。',
    tabs: [{ label: '合作组织', dataKey: 'partners' }, { label: '待确认', dataKey: 'pending' }, { label: '开放范围', dataKey: 'scope' }, { label: '事件记录', dataKey: 'events' }]
  },
  {
    path: '/tasks',
    title: '任务中心',
    description: '查看任务路由、终态和可选中继容量。',
    dataKey: 'tasks',
    icon: Activity,
    role: 'admin',
    group: '运营与审计',
    tabs: [{ label: '任务列表', dataKey: 'tasks' }, { label: '活动任务', dataKey: 'active' }, { label: '中继连接', dataKey: 'relay' }, { label: '运行统计', dataKey: 'stats' }]
  },
  {
    path: '/audit',
    title: '操作审计',
    description: '按组织查询有界操作元数据，不包含任务正文。',
    dataKey: 'audit',
    icon: ScrollText,
    role: 'admin',
    group: '运营与审计',
    boundary: '组织操作审计、筛选和导出 API 尚未接入。模型网关的调用元数据仍只能在模型网关页面查看。',
    next: { label: '查看模型调用记录', to: '/model-gateway' },
    tabs: [{ label: '事件查询', dataKey: 'events' }, { label: '调用链', dataKey: 'traces' }, { label: '导出任务', dataKey: 'exports' }, { label: '保留策略', dataKey: 'retention' }]
  },
  {
    path: '/settings',
    title: '系统设置',
    description: '查看实例、身份源、基础设施状态与保留策略。',
    icon: Settings2,
    role: 'admin',
    group: '系统',
    tabs: [{ label: '实例信息', dataKey: 'instance' }, { label: '身份与登录', dataKey: 'identity' }, { label: '基础设施', dataKey: 'infrastructure' }, { label: '中继与联邦', dataKey: 'relay' }, { label: '通知', dataKey: 'notifications' }, { label: '保留与审计', dataKey: 'retention' }]
  },
  {
    path: '/me/devices',
    title: '我的设备',
    description: '查看你在当前组织注册的设备与连接状态。',
    dataKey: 'myDevices',
    icon: CircleUserRound,
    role: 'member',
    tabs: [{ label: '我的设备', dataKey: 'devices' }, { label: '我的授权', dataKey: 'grants' }, { label: '我的申请', dataKey: 'requests' }, { label: '我的数字人', dataKey: 'digital-humans' }]
  },
  {
    path: '/me/grants',
    title: '我的授权',
    description: '查看你获准发现、调用或下载的能力。',
    dataKey: 'myGrants',
    icon: FileKey2,
    role: 'member',
    tabs: [{ label: '授权详情', dataKey: 'grants' }, { label: '使用限制', dataKey: 'limits' }, { label: '变更记录', dataKey: 'changes' }]
  },
  {
    path: '/me/requests',
    title: '我的申请',
    description: '跟踪你的设备、能力与任务审批。',
    dataKey: 'myRequests',
    icon: UserRoundCheck,
    role: 'member',
    tabs: [{ label: '全部申请', dataKey: 'all' }, { label: '待处理', dataKey: 'pending' }, { label: '已完成', dataKey: 'completed' }]
  }
]

export function visiblePages(role: PrototypeRole): PageConfig[] {
  return pages.filter((page) => page.role === 'all' || page.role === role)
}

// Raw pages remain Chinese so navigation classification never depends on language.
const pageText: Record<string, string> = {
  '运行概览': 'Overview', '模型网关': 'Model gateway', '文档与协作': 'Documents & collaboration',
  '配置下发': 'Configuration distribution', '组织与成员': 'Organization & members', 'GoodBuddy 接入': 'GoodBuddy connections',
  '共享中心': 'Sharing center', '权限策略': 'Permission policies', '审批': 'Approvals', '资源与更新': 'Resources & updates',
  '网关互联': 'Gateway federation', '任务中心': 'Task center', '操作审计': 'Operation audit', '系统设置': 'System settings',
  '我的设备': 'My devices', '我的授权': 'My grants', '我的申请': 'My requests',
  'GoodBuddy 组织服务、接入状态与待处理事项。': 'GoodBuddy organization services, connection status, and pending items.',
  '本地技术预览：配置真实上游与模型别名、测试转发并查看审计；尚无组织认证与配额。': 'Local technical preview: configure real upstreams and model aliases, test forwarding, and review audits. Organization authentication and quotas are not yet available.',
  '上传 DOCX，通过 ONLYOFFICE 编辑并持久保存到 ShareServer。': 'Upload DOCX files, edit with ONLYOFFICE, and save persistently to ShareServer.',
  '保存、审核和导出配置草稿，供客户端人工配置。': 'Save, review, and export configuration drafts for manual client configuration.',
  '管理当前组织的成员、用户组和有界角色。': 'Manage members, groups, and scoped roles in the current organization.',
  '管理 GoodBuddy 客户端与设备的注册、连接状态和接入授权。': 'Manage registration, connection status, and access authorization for GoodBuddy clients and devices.',
  '按内容、发布用户或提供设备查看共享能力与知识库。': 'Browse shared capabilities and knowledge bases by content, publisher, or providing device.',
  '配置拒绝优先的组织强制策略与 Grant。': 'Configure organization policies and grants with deny rules taking precedence.',
  '处理调用、发布、更新和联邦申请。': 'Review invocation, publication, update, and federation requests.',
  '管理签名能力包、发布通道、更新策略和撤销。': 'Manage signed capability packages, release channels, update policies, and revocations.',
  '管理经双边确认的组织协作边界。': 'Manage organization collaboration boundaries confirmed by both parties.',
  '查看任务路由、终态和可选中继容量。': 'View task routing, final states, and optional relay capacity.',
  '按组织查询有界操作元数据，不包含任务正文。': 'Query scoped operation metadata by organization, excluding task content.',
  '查看实例、身份源、基础设施状态与保留策略。': 'View instance details, identity providers, infrastructure status, and retention policies.',
  '查看你在当前组织注册的设备与连接状态。': 'View your registered devices and connection status in the current organization.',
  '查看你获准发现、调用或下载的能力。': 'View capabilities you are authorized to discover, invoke, or download.',
  '跟踪你的设备、能力与任务审批。': 'Track approvals for your devices, capabilities, and tasks.',
  '成员、用户组、角色、登录和组织授权 API 尚未接入。当前不显示成员示例，也不能从此页面发送不会生效的邀请。': 'Member, group, role, login, and organization authorization APIs are not connected yet. No sample members are shown, and invitations cannot be sent from this page.',
  '当前可以查看真实登记设备和共享目录元数据。设备在线状态、身份认证、设备撤销和注册链接 API 尚未接入。': 'Real registered devices and shared catalog metadata are available. Device online status, authentication, revocation, and registration link APIs are not connected yet.',
  '权限策略、Grant、配额和组织授权 API 尚未接入。共享目录中的权限字段目前只是发布者声明，不能在此执行授权决策。': 'Permission policy, grant, quota, and organization authorization APIs are not connected yet. Permission fields in the shared catalog are publisher declarations only and cannot enforce authorization here.',
  '能力包存储、签名校验、版本发布和客户端更新 API 尚未接入。当前不提供上传按钮，避免产生未保存的发布记录。': 'Capability package storage, signature verification, release, and client update APIs are not connected yet. Uploads are unavailable to avoid creating unsaved release records.',
  '联邦握手、双边确认、共享范围和跨网关连接 API 尚未接入。当前不显示虚构的网关关系或连接状态。': 'Federation handshake, bilateral confirmation, sharing scope, and cross-gateway connection APIs are not connected yet. No fictional gateway relationships or connection states are shown.',
  '组织操作审计、筛选和导出 API 尚未接入。模型网关的调用元数据仍只能在模型网关页面查看。': 'Organization operation audit, filtering, and export APIs are not connected yet. Model invocation metadata is available only on the model gateway page.',
  '查看真实设备目录': 'View registered devices', '查看模型调用记录': 'View model invocation records',
  'GoodBuddy 服务': 'GoodBuddy services', '组织管理': 'Organization management', '共享资源': 'Shared resources', '运营与审计': 'Operations & audit', '系统': 'System',
  '服务状态': 'Service status', '待处理事项': 'Pending items', '最近活动': 'Recent activity', '概览': 'Overview',
  '上游服务': 'Upstreams', '模型目录': 'Model catalog', '访问密钥': 'Access keys', '请求测试': 'Request testing', '调用审计': 'Invocation audit', '客户端接入': 'Client integration',
  '文档库': 'Document library', '编辑会话': 'Editing sessions', 'Office 服务': 'Office service', '保存记录': 'Save history',
  '配置草稿': 'Configuration drafts', '设备生效': 'Device rollout', '发布记录': 'Release history', '回滚记录': 'Rollback history',
  '成员': 'Members', '用户组': 'Groups', '角色': 'Roles', '设备列表': 'Device list', '设备详情': 'Device details', '连接记录': 'Connection history', '撤销记录': 'Revocation history',
  '能力目录': 'Capability catalog', '共享知识库': 'Shared knowledge bases', '按成员查看': 'By member', '按设备查看': 'By device',
  '强制策略': 'Mandatory policies', 'Grant': 'Grant', '策略模拟': 'Policy simulation', '变更记录': 'Change history',
  '待处理': 'Pending', '已处理': 'Processed', '审批规则': 'Approval rules', '能力包': 'Capability packages', '发布通道': 'Release channels', '更新策略': 'Update policies',
  '合作组织': 'Partner organizations', '待确认': 'Awaiting confirmation', '开放范围': 'Sharing scope', '事件记录': 'Event history',
  '任务列表': 'Task list', '活动任务': 'Active tasks', '中继连接': 'Relay connections', '运行统计': 'Runtime statistics',
  '事件查询': 'Event search', '调用链': 'Call traces', '导出任务': 'Export tasks', '保留策略': 'Retention policies',
  '实例信息': 'Instance information', '身份与登录': 'Identity & login', '基础设施': 'Infrastructure', '中继与联邦': 'Relay & federation', '通知': 'Notifications', '保留与审计': 'Retention & audit',
  '我的数字人': 'My digital humans', '授权详情': 'Grant details', '使用限制': 'Usage limits', '全部申请': 'All requests', '已完成': 'Completed'
}

export function translatePage(page: PageConfig): PageConfig {
  const text = (value: string) => translate(value, pageText[value] ?? value)
  return {
    ...page,
    title: text(page.title), description: text(page.description),
    ...(page.shortTitle ? { shortTitle: text(page.shortTitle) } : {}),
    ...(page.group ? { group: text(page.group) } : {}),
    ...(page.primaryAction ? { primaryAction: text(page.primaryAction) } : {}),
    ...(page.boundary ? { boundary: text(page.boundary) } : {}),
    ...(page.next ? { next: { ...page.next, label: text(page.next.label) } } : {}),
    ...(page.tabs ? { tabs: page.tabs.map(tab => ({ ...tab, label: text(tab.label) })) } : {})
  }
}

export function getPages(): PageConfig[] {
  return pages.map(translatePage)
}
