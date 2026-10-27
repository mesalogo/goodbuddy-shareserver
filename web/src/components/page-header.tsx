import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  eyebrow,
  action
}: {
  title: string
  description: string
  eyebrow?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}
