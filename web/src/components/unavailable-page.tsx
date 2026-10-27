import { Link } from 'react-router-dom'
import { PageHeader } from './page-header'
import { StatusBadge } from './ui/status-badge'
import { PageTabs, type PageTab } from './page-tabs'
import { useState } from 'react'
import { useI18n } from '../lib/i18n'

type UnavailablePageProps = { title: string; description: string; boundary: string; next?: { label: string; to: string }; tabs?: PageTab[] }

export function UnavailablePage({ title, description, boundary, next, tabs }: UnavailablePageProps) {
  const { t } = useI18n()
  const [active, setActive] = useState(tabs?.[0]?.key ?? '')
  return <>
    <PageHeader eyebrow={t('服务端接口 · 待接入', 'Server API · Not connected')} title={title} description={description} />
    {tabs?.length ? <PageTabs title={title} tabs={tabs} active={active} onChange={setActive} /> : null}
    <section className="space-y-5 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{t('当前没有可用的业务数据', 'No business data is currently available')}</h2><StatusBadge status={t('待接入', 'Not connected')} tone="warning" /></div>
      {tabs?.length ? <p className="text-sm font-medium text-[var(--text-primary)]">{t('当前 Tab：', 'Current tab: ')}{tabs.find((tab) => tab.key === active)?.label}</p> : null}
      <p className="max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{boundary}</p>
      {next && <Link className="inline-flex min-h-9 items-center rounded-lg bg-cyan-400 px-3 text-sm font-medium text-slate-950" to={next.to}>{next.label}</Link>}
    </section>
  </>
}
