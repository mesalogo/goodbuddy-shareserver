import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useI18n } from '../../lib/i18n'

export function Sheet({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n()
  const [trigger] = useState(() => document.activeElement)
  return <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose() }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
      <DialogPrimitive.Content onCloseAutoFocus={event => {
        if (trigger instanceof HTMLElement && trigger.isConnected) { event.preventDefault(); trigger.focus() }
      }} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-[var(--border-default)] bg-[var(--panel)] text-[var(--text-primary)] shadow-[var(--shadow-dialog)]">
        <header className="relative border-b border-[var(--border-default)] p-6 pr-16">
          <DialogPrimitive.Title className="break-words text-lg font-semibold text-[var(--text-strong)]">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-[var(--text-muted)]">{description}</DialogPrimitive.Description>
          <DialogPrimitive.Close aria-label={t('关闭详情', 'Close details')} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--control)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><X aria-hidden="true" className="size-4" /></DialogPrimitive.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
