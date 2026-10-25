import {
  Menu,
  MoonStar,
  Shield,
  Sun,
  X
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { pages } from '../app-config'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { useAuth } from './auth-boundary'

function BrandMark() {
  return (
    <div className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-300 shadow-[0_0_34px_-10px_rgba(34,211,238,.9)]">
      <span className="absolute inset-1 rounded-lg border border-violet-400/20" />
      <Shield aria-hidden="true" className="size-5" />
    </div>
  )
}

export function AppShell({
  children
}: {
  children: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark, setDark] = useState(true)
  const auth = useAuth()
  const [logoutError, setLogoutError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const groupOrder = ['工作台', 'GoodBuddy 服务', '共享资源', '组织管理', '运营与审计', '系统', '成员自助']
  const navigation = pages.map((page) => ({
    ...page,
    group: page.group ?? (page.role === 'member' ? '成员自助' : page.path === '/' ? '工作台' : '组织管理')
  })).sort((left, right) => groupOrder.indexOf(left.group) - groupOrder.indexOf(right.group))

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  const nav = (
    <>
      <div className="flex h-19 items-center gap-3 border-b border-white/[0.07] px-5">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-wide text-white">
            ShareServer
          </p>
          <p className="truncate text-[11px] uppercase tracking-[0.16em] text-cyan-300/70">
            GoodBuddy 组织服务
          </p>
        </div>
      </div>
      <nav aria-label="管理控制台" className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          控制台
        </p>
        <div className="space-y-1">
          {navigation.map((item, index) => {
             const Icon = item.icon
             return (
               <div key={item.path}>
               {index > 0 && item.group !== navigation[index - 1].group ? <p className="px-3 pb-2 pt-4 text-[11px] font-medium text-slate-500">{item.group}</p> : null}
               <NavLink
                to={item.path}
                end={item.path === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-400/70',
                    isActive
                      ? 'bg-cyan-300/[0.09] font-medium text-cyan-100'
                      : 'text-slate-400 hover:bg-white/[0.045] hover:text-slate-100'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,.9)]" />
                    ) : null}
                    <Icon aria-hidden="true" className="size-[18px]" />
                    <span>{item.title}</span>
                  </>
                )}
               </NavLink>
               </div>
            )
          })}
        </div>
      </nav>
    </>
  )

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-60 -top-72 size-[620px] rounded-full bg-cyan-500/[0.055] blur-3xl" />
        <div className="absolute -right-48 top-24 size-[520px] rounded-full bg-violet-500/[0.06] blur-3xl" />
        <div className="grid-overlay absolute inset-0 opacity-40" />
      </div>
      <aside className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[258px] flex-col border-r border-white/[0.075] bg-[#07111f]/95 backdrop-blur-xl lg:flex">
        {nav}
      </aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="关闭导航"
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="app-sidebar relative flex h-full w-[min(300px,86vw)] flex-col border-r border-white/10 bg-[#07111f] shadow-2xl">
            <Button
              aria-label="关闭导航"
              className="absolute right-3 top-3 z-10"
              size="icon"
              variant="ghost"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-5" />
            </Button>
            {nav}
          </aside>
        </div>
      ) : null}
      <div className="relative lg:pl-[258px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/[0.07] bg-[var(--header)] px-4 backdrop-blur-xl sm:px-6">
          <Button
            aria-label="打开导航"
            className="lg:hidden"
            size="icon"
            variant="ghost"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            {logoutError && <p role="alert" className="text-sm">{logoutError}</p>}
            {auth && <><span className="max-w-32 truncate text-sm">{auth.username}</span><Button variant="ghost" disabled={loggingOut} onClick={() => { setLoggingOut(true); setLogoutError(''); void auth.logout().catch(() => setLogoutError('退出失败，请重试。')).finally(() => setLoggingOut(false)) }}>退出登录</Button></>}
             <Button
              aria-label={dark ? '切换到浅色主题' : '切换到深色主题'}
              size="icon"
              variant="ghost"
              onClick={() => setDark((value) => !value)}
            >
              {dark ? <Sun className="size-4" /> : <MoonStar className="size-4" />}
            </Button>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  )
}
