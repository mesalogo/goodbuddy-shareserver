import { useId } from 'react'
import { cn } from '../lib/utils'

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
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active))
  return <div role="tablist" aria-label={`${title}分类`} className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
    {tabs.map((tab, index) => <button
      key={tab.key}
      id={`${id}-tab-${tab.key}`}
      role="tab"
      aria-selected={active === tab.key}
      aria-controls={`${id}-panel`}
      tabIndex={active === tab.key ? 0 : -1}
      className={cn(
        'min-h-10 shrink-0 rounded-lg px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-400/70',
        active === tab.key ? 'bg-white/[0.09] font-medium text-[var(--text-strong)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
