import { Link } from 'react-router-dom'
import { PageHeader } from './page-header'

export function DistributionPage() {
  return <div className="min-w-0 text-[var(--text-primary)]">
    <PageHeader eyebrow="当前服务器 · 待接入" title="配置下发" description="GoodBuddy 配置分发尚未接入。" />
    <section className="space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5">
      <h2 className="font-semibold">尚无配置下发服务</h2>
      <p className="text-sm leading-6 text-[var(--text-muted)]">目前没有可用的配置草稿、设备生效回执或发布回滚记录。模型网关可独立配置与测试；保存网关模型不会自动下发到 GoodBuddy。</p>
      <Link className="inline-flex min-h-10 items-center rounded-lg underline outline-offset-4" to="/model-gateway">前往模型网关</Link>
    </section>
  </div>
}
