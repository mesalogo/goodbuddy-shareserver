import * as Dialog from '@radix-ui/react-dialog'
import { ChevronRight, Menu, MoonStar, PanelLeftClose, PanelLeftOpen, Shield, Sun, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router-dom'
import { pages, translatePage } from '../app-config'
import { useI18n } from '../lib/i18n'
import { LanguageSwitch } from './language-switch'
import { useTheme } from '../lib/theme'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { AccountMenu } from './account-menu'

const groups = ['工作空间', '组织与运营', '系统管理', '成员自助']
const groupNames: Record<string, string> = { '工作空间': 'Workspace', '组织与运营': 'Organization & operations', '系统管理': 'System administration', '成员自助': 'Member self-service' }
const navigation = pages.map(page => ({
  ...page,
  section: page.role === 'member' ? '成员自助'
    : page.path === '/settings' || page.path === '/audit' ? '系统管理'
      : page.group === '组织管理' || page.group === '运营与审计' ? '组织与运营' : '工作空间'
}))

function NavigationItem({ item, compact, onNavigate }: { item: typeof navigation[number]; compact: boolean; onNavigate: () => void }) {
  const [tooltip, setTooltip] = useState<{ top: number; left: number } | null>(null)
  const Icon = item.icon
  const showTooltip = (element: HTMLElement) => {
    if (!compact) return
    const rect = element.getBoundingClientRect()
    setTooltip({ top: rect.top + rect.height / 2, left: rect.right + 12 })
  }
  return <>
    <NavLink to={item.path} end={item.path === '/'} onClick={() => { setTooltip(null); onNavigate() }}
      onMouseEnter={event => showTooltip(event.currentTarget)} onMouseLeave={() => setTooltip(null)}
      onFocus={event => showTooltip(event.currentTarget)} onBlur={() => setTooltip(null)} onKeyDown={event => { if (event.key === 'Escape') setTooltip(null) }}
      className={({ isActive }) => cn('relative flex min-h-9 items-center gap-3 rounded-md px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]', compact && 'justify-center', isActive ? 'bg-[var(--accent-subtle)] font-medium text-[var(--accent)]' : 'text-[var(--text-primary)] hover:bg-[var(--control)]')}>
      <Icon aria-hidden="true" className="size-4 shrink-0" /><span className={compact ? 'sr-only' : 'truncate'}>{item.title}</span>
    </NavLink>
    {compact && tooltip && createPortal(<span aria-hidden="true" style={tooltip} className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-md border border-[var(--border-default)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--text-primary)] shadow-[var(--shadow-dialog)]">{item.title}</span>, document.body)}
  </>
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const localizedNavigation = navigation.map(item => ({ ...translatePage(item), section: item.section }))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { dark, toggleTheme } = useTheme()
  const location = useLocation()
  const current = localizedNavigation.find(page => page.path === location.pathname || (page.path !== '/' && location.pathname.startsWith(`${page.path}/`)))

  useEffect(() => {
    if (!window.matchMedia) return
    const query = window.matchMedia('(min-width: 1024px)')
    const close = () => { if (query.matches) setMobileOpen(false) }
    query.addEventListener('change', close)
    return () => query.removeEventListener('change', close)
  }, [])

  const sidebar = (compact: boolean) => <>
    <div className={cn('flex h-16 shrink-0 items-center gap-3 border-b border-[var(--border-default)] px-4', compact && 'justify-center px-2')}>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-solid)] text-[var(--text-on-accent)]"><Shield aria-hidden="true" className="size-5" /></span>
      {!compact && <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text-strong)]">ShareServer</p><p className="text-xs text-[var(--text-muted)]">{t('GoodBuddy 组织服务', 'GoodBuddy organization services')}</p></div>}
    </div>
    <nav aria-label={t('管理控制台', 'Administration console')} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      {groups.map((group, index) => <div key={group} className={cn(index > 0 && 'mt-4 border-t border-[var(--border-default)] pt-4')}>
        <p className={cn('mb-2 px-2 text-xs font-medium text-[var(--text-muted)]', compact && 'sr-only')}>{t(group, groupNames[group])}</p>
        <div className="space-y-1">{localizedNavigation.filter(item => item.section === group).map(item => <NavigationItem key={item.path} item={item} compact={compact} onNavigate={() => setMobileOpen(false)} />)}</div>
      </div>)}
    </nav>
    <div className="shrink-0 border-t border-[var(--border-default)] p-3">
      <p className={cn('px-2 text-xs text-[var(--text-muted)]', compact && 'text-center')}>{t('技术预览', 'Technical preview')}</p>
    </div>
  </>

  return <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-primary)]">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--panel)] focus:p-3">{t('跳转到主要内容', 'Skip to main content')}</a>
    <aside aria-label={t('桌面侧栏', 'Desktop sidebar')} className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-[var(--border-default)] bg-[var(--sidebar)] lg:flex', collapsed ? 'w-16' : 'w-60')}>{sidebar(collapsed)}</aside>
    <div className={collapsed ? 'lg:pl-16' : 'lg:pl-60'}>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--border-default)] bg-[var(--header)] px-4 sm:px-6">
        <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <Dialog.Trigger asChild><Button aria-label={t('打开导航', 'Open navigation')} className="lg:hidden" size="icon" variant="ghost"><Menu aria-hidden="true" className="size-4" /></Button></Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)]" />
            <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-[min(320px,90vw)] flex-col border-r border-[var(--border-default)] bg-[var(--sidebar)] text-[var(--text-primary)] shadow-[var(--shadow-dialog)]">
              <Dialog.Title className="sr-only">{t('管理控制台导航', 'Administration console navigation')}</Dialog.Title>
              <Dialog.Close asChild><Button aria-label={t('关闭导航', 'Close navigation')} size="icon" variant="ghost" className="absolute right-2 top-3"><X aria-hidden="true" className="size-4" /></Button></Dialog.Close>
              {sidebar(false)}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Button aria-label={collapsed ? t('展开侧栏', 'Expand sidebar') : t('收起侧栏', 'Collapse sidebar')} title={collapsed ? t('展开侧栏', 'Expand sidebar') : t('收起侧栏', 'Collapse sidebar')} aria-expanded={!collapsed} className="hidden lg:inline-flex" size="icon" variant="ghost" onClick={() => setCollapsed(value => !value)}>
          {collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4" /> : <PanelLeftClose aria-hidden="true" className="size-4" />}
        </Button>
        <nav aria-label={t('面包屑', 'Breadcrumb')} className="min-w-0 text-sm"><ol className="flex items-center gap-2"><li className="hidden text-[var(--text-muted)] sm:block">{current ? t(current.section, groupNames[current.section]) : t('控制台', 'Console')}</li><li aria-hidden="true" className="hidden sm:block"><ChevronRight className="size-3 text-[var(--text-muted)]" /></li><li aria-current="page" className="truncate font-medium text-[var(--text-strong)]">{current?.title ?? 'ShareServer'}</li></ol></nav>
        <div className="ml-auto flex shrink-0 items-center gap-1"><LanguageSwitch />
        <Button aria-label={dark ? t('切换到浅色主题', 'Switch to light theme') : t('切换到深色主题', 'Switch to dark theme')} title={dark ? t('切换到浅色主题', 'Switch to light theme') : t('切换到深色主题', 'Switch to dark theme')} size="icon" variant="ghost" onClick={toggleTheme}>{dark ? <Sun aria-hidden="true" className="size-4" /> : <MoonStar aria-hidden="true" className="size-4" />}</Button><AccountMenu /></div>
      </header>
      <main id="main-content" tabIndex={-1} className="min-h-[calc(100vh-3.5rem)] px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1440px]">{children}</div></main>
    </div>
  </div>
}
