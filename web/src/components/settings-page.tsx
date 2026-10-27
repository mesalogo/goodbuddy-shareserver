import {
  Braces,
  CheckCircle2,
  CloudCog,
  Database,
  KeyRound,
  Mail,
  RadioTower,
  Save,
  ShieldCheck
} from 'lucide-react'
import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PrototypeSnapshot } from '../../../shared/prototype-data'
import { PageHeader } from './page-header'
import { Button } from './ui/button'
import { StatusBadge } from './ui/status-badge'
import { PageTabs } from './page-tabs'
import { useI18n } from '../lib/i18n'

function SettingCard({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: LucideIcon
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/[0.075] bg-[var(--panel)] p-5">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.065] text-cyan-300">
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-strong)]">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p>
        </div>
      </header>
      <div className="mt-5 border-t border-white/[0.06] pt-5">{children}</div>
    </section>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl p-2 outline-none hover:bg-white/[0.025]">
      <span>
        <span className="block text-sm font-medium text-[var(--text-primary)]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full border border-white/10 bg-slate-700 transition peer-checked:border-cyan-300/30 peer-checked:bg-cyan-400/80 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-400/70 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  )
}

export function SettingsPage({ snapshot }: { snapshot: PrototypeSnapshot }) {
  const { t } = useI18n()
  const [relay, setRelay] = useState(true)
  const [federation, setFederation] = useState(true)
  const [oidc, setOidc] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('instance')

  return (
    <>
      <PageHeader
        eyebrow={t('实例范围', 'Instance scope')}
        title={t('系统设置', 'System settings')}
        description={t('管理实例公开信息与功能开关。数据库连接、主密钥和容器挂载路径只从部署环境读取。', 'Manage public instance information and feature switches. Database connections, the master key and container mount paths are read from the deployment environment only.')}
        action={
          <Button
            onClick={() => {
              setSaved(true)
              window.setTimeout(() => setSaved(false), 4500)
            }}
          >
            <Save className="size-4" />
            {t('保存设置', 'Save settings')}
          </Button>
        }
      />
      {saved ? (
        <div role="status" className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">
          {t('原型设置已保存到当前浏览器会话，不会写入生产配置。', 'Prototype settings have been saved for the current browser session. Production configuration is not updated.')}
        </div>
      ) : null}
      <PageTabs title={t('系统设置', 'System settings')} active={activeTab} onChange={setActiveTab} tabs={[{ key: 'instance', label: t('实例信息', 'Instance information') }, { key: 'identity', label: t('身份与登录', 'Identity and sign-in') }, { key: 'infrastructure', label: t('基础设施', 'Infrastructure') }, { key: 'relay', label: t('中继与联邦', 'Relay and federation') }, { key: 'notifications', label: t('通知', 'Notifications') }, { key: 'retention', label: t('保留与审计', 'Retention and audit') }]} />
      <div className="grid gap-5 xl:grid-cols-2">
        {activeTab === 'instance' && <SettingCard
          icon={CloudCog}
          title={t('实例信息', 'Instance information')}
          description={t('公开名称、地址与协议协商信息。', 'Public name, URL and protocol negotiation information.')}
        >
          <div className="grid gap-4">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{t('实例名称', 'Instance name')}</span>
              <input
                defaultValue={snapshot.instance.name}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.025] px-3 text-sm outline-none focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/10"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{t('公开地址', 'Public URL')}</span>
              <input
                defaultValue="https://share.mesalab.internal"
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.025] px-3 font-mono text-xs outline-none focus:border-cyan-300/40 focus:ring-2 focus:ring-cyan-400/10"
              />
            </label>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.025] px-3 py-2.5">
              <span className="text-xs text-[var(--text-muted)]">{snapshot.instance.protocol}</span>
              <StatusBadge status={t('兼容', 'Compatible')} tone="online" />
            </div>
          </div>
        </SettingCard>}

        {activeTab === 'infrastructure' && <SettingCard
          icon={Database}
          title={t('基础设施', 'Infrastructure')}
          description={t('状态可见，敏感连接信息不在 Web 控制台回显。', 'Status is visible; sensitive connection information is not displayed in the Web console.')}
        >
          <div className="space-y-2">
            {[
              ['PostgreSQL', t('正常', 'Healthy'), t('主数据与审计权威', 'Authoritative primary data and audit store')],
              [t('对象存储', 'Object storage'), t('正常', 'Healthy'), t('Package 与有界中继暂存', 'Temporary storage for packages and bounded relay')],
              [t('网关身份', 'Gateway identity'), t('正常', 'Healthy'), t('证书将在 82 天后轮换', 'Certificate rotation in 82 days')]
            ].map(([name, status, copy]) => (
              <div key={name} className="flex items-center gap-3 rounded-xl bg-white/[0.025] px-3 py-3">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-[var(--text-primary)]">{name}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{copy}</span>
                </span>
                <span className="text-xs text-emerald-300">{status}</span>
              </div>
            ))}
          </div>
        </SettingCard>}

        {activeTab === 'identity' && <SettingCard
          icon={KeyRound}
          title={t('身份与登录', 'Identity and sign-in')}
          description={t('本地账号可用；OIDC 需要部署管理员配置固定回调地址。', 'Local accounts are available. OIDC requires a fixed callback URL configured by the deployment administrator.')}
        >
          <div className="space-y-2">
            <Toggle
              checked={oidc}
              onChange={setOidc}
              label={t('允许企业 OIDC', 'Allow enterprise OIDC')}
              description={t('使用 state、nonce 和 PKCE 完成登录。', 'Sign in using state, nonce and PKCE.')}
            />
            <div className="flex items-center justify-between rounded-xl p-2">
              <span>
                <span className="block text-sm text-[var(--text-primary)]">{t('本地账号', 'Local accounts')}</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">{t('首个系统管理员已完成初始化', 'The first system administrator has been initialized')}</span>
              </span>
              <StatusBadge status={t('已启用', 'Enabled')} tone="online" />
            </div>
          </div>
        </SettingCard>}

        {activeTab === 'relay' && <SettingCard
          icon={RadioTower}
          title={t('中继与联邦', 'Relay and federation')}
          description={t('控制面独立运行，关闭中继不会影响设备注册和目录。', 'The control plane runs independently. Disabling relay does not affect device registration or the catalog.')}
        >
          <div className="space-y-2">
            <Toggle
              checked={relay}
              onChange={setRelay}
              label={t('启用数据中继', 'Enable data relay')}
              description={t('网络无法直连且双方策略允许时提供有界中继。', 'Provide bounded relay when a direct connection is unavailable and both parties allow it.')}
            />
            <Toggle
              checked={federation}
              onChange={setFederation}
              label={t('允许网关联邦', 'Allow gateway federation')}
              description={t('仍需双方管理员核对指纹并分别确认关系。', 'Administrators on both sides must still verify fingerprints and confirm the relationship independently.')}
            />
          </div>
        </SettingCard>}

        {activeTab === 'notifications' && <SettingCard
          icon={Mail}
          title={t('通知', 'Notifications')}
          description={t('用于邀请、审批和高影响状态通知。', 'For invitations, approvals and notifications of significant status changes.')}
        >
          <div className="flex items-center justify-between rounded-xl bg-white/[0.025] px-3 py-3">
            <span>
              <span className="block text-sm text-[var(--text-primary)]">{t('SMTP 邮件', 'SMTP email')}</span>
              <span className="mt-1 block text-xs text-[var(--text-muted)]">{t('凭据由部署环境提供，永不回显', 'Credentials come from the deployment environment and are never displayed')}</span>
            </span>
            <Button size="sm" variant="secondary">{t('发送测试', 'Send test')}</Button>
          </div>
        </SettingCard>}

        {activeTab === 'retention' && <SettingCard
          icon={Braces}
          title={t('保留与审计', 'Retention and audit')}
          description={t('默认只保留有界元数据，不保存提示正文、文件与模型输出。', 'By default, only bounded metadata is retained. Prompt content, files and model outputs are not stored.')}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{t('审计保留期', 'Audit retention period')}</span>
              <select className="h-10 w-full rounded-lg border border-white/10 bg-[var(--control)] px-3 text-sm outline-none">
                <option value="365">{t('365 天', '365 days')}</option>
                <option value="180">{t('180 天', '180 days')}</option>
                <option value="90">{t('90 天', '90 days')}</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">{t('实例时区', 'Instance time zone')}</span>
              <select className="h-10 w-full rounded-lg border border-white/10 bg-[var(--control)] px-3 text-sm outline-none">
                <option>Asia/Shanghai (UTC+8)</option>
                <option>UTC</option>
              </select>
            </label>
          </div>
        </SettingCard>}
      </div>
      {activeTab === 'instance' && <section className="mt-5 rounded-2xl border border-rose-400/15 bg-rose-400/[0.035] p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-rose-300" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-rose-200">{t('危险操作', 'Dangerous actions')}</h2>
            <p className="mt-1 text-xs leading-5 text-rose-200/60">
              {t('删除组织前必须停止新任务、撤销联邦和设备，并按保留策略归档审计。', 'Before deleting an organization, stop new tasks, revoke federation and devices, and archive audits according to the retention policy.')}
            </p>
          </div>
          <Button variant="danger">{t('删除组织', 'Delete organization')}</Button>
        </div>
      </section>}
    </>
  )
}
