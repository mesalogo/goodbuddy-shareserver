import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { MoonStar, Shield, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'
import { Button } from './ui/button'
import { translate, useI18n } from '../lib/i18n'
import { LanguageSwitch } from './language-switch'

const authMessages: Record<string, string> = {
  '无法读取登录状态，请稍后重试。': 'Unable to read login status. Please try again later.',
  '无法连接服务器。': 'Unable to connect to the server.',
  '登录已过期，请重新登录。': 'Your session has expired. Please log in again.',
  '两次输入的密码不一致。': 'The passwords do not match.',
  '登录失败，请重试。': 'Login failed. Please try again.',
  '退出失败，请检查网络后重试。': 'Logout failed. Check your connection and try again.',
  '请先登录管理员账号。': 'Please log in with an administrator account first.',
  '请求来源不匹配，请从配置的控制台地址访问。': 'The request origin does not match. Use the configured console address.',
  '请求内容过大。': 'The request is too large.',
  '认证服务暂时不可用，请检查服务器存储。': 'The authentication service is temporarily unavailable. Check server storage.',
  '当前实例未启用登录。': 'Login is not enabled for this instance.',
  '尝试次数过多，请一分钟后重试。': 'Too many attempts. Please try again in one minute.',
  '请提交 JSON 表单。': 'Please submit a JSON form.',
  '接口不存在。': 'The endpoint does not exist.',
  '账号需为 3–64 位字母、数字或 _.@-；密码需为 12–1024 位。': 'Usernames must contain 3–64 letters, numbers, or _.@-; passwords must contain 12–1024 characters.',
  '账号或密码错误。': 'Incorrect username or password.',
  '管理员已创建，请登录。': 'An administrator has already been created. Please log in.',
  '初始化码无效。': 'Invalid setup token.',
  '新密码需为 12–1024 位。': 'The new password must contain 12–1024 characters.',
  '当前密码错误。': 'The current password is incorrect.',
  '新密码不能与当前密码相同。': 'The new password must differ from the current password.'
}

export function localizeAuthError(message: string) {
  if (Object.hasOwn(authMessages, message)) return translate(message, authMessages[message])
  return translate('无法连接服务器。', 'Unable to connect to the server.')
}

type Session = { enabled: boolean; initialized: boolean; authenticated: boolean; username: string | null }
const AuthContext = createContext<{ username: string; logout: () => Promise<void> } | null>(null)
export const useAuth = () => useContext(AuthContext)

export function AuthBoundary({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const { dark, toggleTheme } = useTheme()
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const sessionVersion = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    const check = async () => {
      const version = sessionVersion.current
      try {
        const response = await fetch('/api/v1/auth/session', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('无法读取登录状态，请稍后重试。')
        const value = await response.json() as Session
        if (!controller.signal.aborted && version === sessionVersion.current) { setSession(value); setError('') }
      } catch (e) { if (!controller.signal.aborted && version === sessionVersion.current) setError(e instanceof Error ? e.message : '无法连接服务器。') }
    }
    void check()
    const expired = () => { sessionVersion.current++; setSession(previous => previous ? { ...previous, authenticated: false } : null); setPassword(''); setError('登录已过期，请重新登录。') }
    const interval = window.setInterval(() => void check(), 60_000)
    window.addEventListener('shareserver-login-required', expired)
    window.addEventListener('focus', check)
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('shareserver-login-required', expired); window.removeEventListener('focus', check) }
  }, [retry])

  async function submit() {
    sessionVersion.current++
    setBusy(true); setError('')
    try {
      if (!session?.initialized && password !== confirmation) throw new Error('两次输入的密码不一致。')
      const response = await fetch(`/api/v1/auth/${session?.initialized ? 'login' : 'setup'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, ...(!session?.initialized ? { setupToken } : {}) }) })
      const result = await response.json()
      if (!response.ok) {
        if (response.status === 409) { setSession(previous => previous ? { ...previous, initialized: true } : null); setSetupToken('') }
        throw new Error(result.message ?? '登录失败，请重试。')
      }
      setPassword(''); setConfirmation(''); setSetupToken('')
      sessionVersion.current++
      setSession({ enabled: true, initialized: true, authenticated: true, username: result.username })
    } catch (e) { setError(e instanceof Error ? e.message : '无法连接服务器。') }
    finally { setBusy(false) }
  }

  async function logout() {
    sessionVersion.current++
    const response = await fetch('/api/v1/auth/logout', { method: 'POST' })
    if (!response.ok) throw new Error('退出失败，请检查网络后重试。')
    sessionVersion.current++
    setSession(previous => previous ? { ...previous, authenticated: false, username: null } : null)
    setPassword(''); setError('')
  }

  if (session && !session.enabled) return children
  if (session?.authenticated) return <AuthContext.Provider value={{ username: session.username!, logout }}>{children}</AuthContext.Provider>
  const setup = session && !session.initialized
  const control = 'w-full rounded-md border border-[var(--border-control)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--panel)]'
  return <main className="grid min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] lg:grid-cols-2">
    <aside className="flex flex-col justify-between border-b border-[var(--border-default)] bg-[var(--sidebar)] p-6 lg:min-h-screen lg:border-b-0 lg:border-r lg:p-12">
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-[var(--accent-solid)] text-[var(--text-on-accent)]"><Shield aria-hidden="true" className="size-5" /></span><div><p className="font-semibold text-[var(--text-strong)]">ShareServer</p><p className="text-xs text-[var(--text-muted)]">{t('GoodBuddy 组织服务', 'GoodBuddy organization services')}</p></div></div>
      <div className="hidden max-w-md py-12 lg:block"><p className="mb-4 text-sm font-medium text-[var(--accent)]">{t('组织服务控制台', 'Organization service console')}</p><p className="text-3xl font-semibold leading-tight tracking-tight text-[var(--text-strong)]">{t('连接团队的工具与资源。', 'Connect your team’s tools and resources.')}</p><p className="mt-6 text-sm leading-7 text-[var(--text-muted)]">{t('集中管理模型接入、文档协作与共享资源，在一个工作空间中查看服务与运行状态。', 'Manage model access, document collaboration, and shared resources centrally. View services and runtime status in one workspace.')}</p></div>
      <p className="hidden text-xs text-[var(--text-muted)] lg:block">GoodBuddy · ShareServer</p>
    </aside>
    <div className="relative flex min-w-0 items-center justify-center px-6 py-20 sm:px-12">
      <div className="absolute right-6 top-4 flex items-center gap-1"><LanguageSwitch /><Button variant="ghost" size="icon" aria-label={dark ? t('切换到浅色主题', 'Switch to light theme') : t('切换到深色主题', 'Switch to dark theme')} title={dark ? t('切换到浅色主题', 'Switch to light theme') : t('切换到深色主题', 'Switch to dark theme')} onClick={toggleTheme}>{dark ? <Sun aria-hidden="true" className="size-4" /> : <MoonStar aria-hidden="true" className="size-4" />}</Button></div>
    <section className="w-full max-w-sm">
      <p className="mb-2 text-sm text-[var(--text-muted)]">GoodBuddy · ShareServer</p>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{!session ? t('连接控制台', 'Connecting to the console') : setup ? t('创建首位管理员', 'Create the first administrator') : t('管理员登录', 'Administrator login')}</h1>
      {session && !setup && <p className="mt-2 text-sm text-[var(--text-muted)]">{t('使用管理员账号登录组织服务控制台。', 'Log in to the organization service console with an administrator account.')}</p>}
      {error && <p role="alert" className="mt-6 rounded-md border border-[var(--border-default)] bg-[var(--danger-subtle)] p-3 text-sm text-[var(--danger)]">{localizeAuthError(error)}</p>}
      {!session ? <div className="mt-4">{error ? <Button onClick={() => setRetry(v => v + 1)}>{t('重试', 'Retry')}</Button> : <p role="status">{t('正在读取登录状态…', 'Reading login status…')}</p>}</div> : <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); void submit() }}>
        {setup && <><p className="text-sm text-[var(--text-muted)]">{t('使用服务器上的一次性初始化码创建管理员。创建后，此入口将关闭。', 'Use the one-time setup token on the server to create an administrator. This setup entry closes after creation.')}</p><label className="block space-y-2"><span>{t('初始化码', 'Setup token')}</span><input required type="password" autoComplete="off" className={control} value={setupToken} onChange={e => setSetupToken(e.target.value)} /></label></>}
        <label className="block space-y-2"><span>{t('管理员账号', 'Administrator username')}</span><input required autoComplete="username" minLength={3} maxLength={64} pattern="[a-zA-Z0-9_.@\-]+" className={control} value={username} onChange={e => setUsername(e.target.value)} /></label>
        <label className="block space-y-2"><span>{t('密码', 'Password')}</span><input required type="password" autoComplete={setup ? 'new-password' : 'current-password'} minLength={12} maxLength={1024} className={control} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {setup && <><p className="text-sm text-[var(--text-muted)]">{t('账号为 3–64 位字母、数字或 _.@-，密码至少 12 位。', 'Use 3–64 letters, numbers, or _.@- for the username and at least 12 characters for the password.')}</p><label className="block space-y-2"><span>{t('确认密码', 'Confirm password')}</span><input required type="password" autoComplete="new-password" minLength={12} maxLength={1024} className={control} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></>}
        <Button className="w-full" disabled={busy} type="submit">{busy ? t('正在验证…', 'Verifying…') : setup ? t('创建管理员并登录', 'Create administrator and log in') : t('登录', 'Log in')}</Button>
      </form>}
    </section>
    </div>
  </main>
}
