import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../../lib/i18n'

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = 'max-w-xl'
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  width?: string
}) {
  const { t } = useI18n()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <DialogPrimitive.Content
          className={`fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-[var(--border-default)] bg-[var(--dialog)] p-6 text-[var(--text-primary)] shadow-[var(--shadow-dialog)] outline-none ${width}`}
        >
          <div className="pr-10">
            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-[var(--text-muted)] outline-none transition hover:bg-[var(--control)] hover:text-[var(--text-strong)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">{t('关闭', 'Close')}</span>
          </DialogPrimitive.Close>
          <div className="mt-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
