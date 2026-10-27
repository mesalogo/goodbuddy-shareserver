import { useId } from 'react'
import { cn } from '../lib/utils'
import { useI18n } from '../lib/i18n'

export type PageTab = { label: string; key: string }

export function PageTabs({
  title,
  tabs,
  active,
  onChange
}: {
  title: string
  tabs: PageTab[]
  active: string
  onChange: (key: string) => void
}) {
  const id = useId()
  const { t } = useI18n()
  return <div role="tablist" aria-label={t('{title}分类', '{title} sections', { title })} className="mb-6 flex max-w-full gap-5 overflow-x-auto border-b border-[var(--border-default)]">
    {tabs.map((tab, index) => <button
      key={tab.key}
      id={`${id}-tab-${tab.key}`}
      role="tab"
      aria-selected={active === tab.key}
      aria-controls={`${id}-panel`}
      tabIndex={active === tab.key ? 0 : -1}
      className={cn(
        'min-h-10 shrink-0 border-b-2 px-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]',
        active === tab.key ? 'border-[var(--accent)] font-medium text-[var(--accent)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      )}
      onClick={() => onChange(tab.key)}
      onKeyDown={(event) => {
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1
        if (next < 0) return
        event.preventDefault()
        onChange(tabs[next].key)
        document.getElementById(`${id}-tab-${tabs[next].key}`)?.focus()
      }}
    >{tab.label}</button>)}
  </div>
}
