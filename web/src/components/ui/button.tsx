import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentPropsWithRef } from 'react'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default:
          'border border-transparent bg-[var(--accent-solid)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)]',
        secondary:
          'border border-[var(--border-default)] bg-[var(--panel)] text-[var(--text-primary)] hover:bg-[var(--control)]',
        ghost: 'text-[var(--text-muted)] hover:bg-[var(--control)] hover:text-[var(--text-strong)]',
        danger:
          'border border-[var(--danger)] bg-[var(--danger-subtle)] text-[var(--danger)] hover:opacity-80'
      },
      size: {
        default: 'h-9',
        sm: 'h-8 min-h-8 px-2.5 text-xs',
        icon: 'size-9 min-h-9 px-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

type ButtonProps = ComponentPropsWithRef<'button'> &
  VariantProps<typeof buttonVariants>

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
