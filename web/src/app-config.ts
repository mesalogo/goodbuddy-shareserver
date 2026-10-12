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
    description: '文档存储在 ShareServer，在 GoodBuddy 中使用；管理归属、回收站和 OnlyOffice 服务。',
    icon: FileText,
    role: 'admin',
    group: 'GoodBuddy 服务',
    tabs: [{ label: '文档库', dataKey: 'documents' }, { label: '编辑会话', dataKey: 'sessions' }, { label: 'Office 服务', dataKey: 'office' }, { label: '保存记录', dataKey: 'saves' }]
  },
  {
    path: '/distribution',
    title: '配置下发',
    description: '配置分发尚未接入；可先在模型网关配置与测试真实上游。',
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
