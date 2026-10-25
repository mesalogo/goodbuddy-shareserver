import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './ui/button'

type Session = { enabled: boolean; initialized: boolean; authenticated: boolean; username: string | null }
const AuthContext = createContext<{ username: string; logout: () => Promise<void> } | null>(null)
export const useAuth = () => useContext(AuthContext)

export function AuthBoundary({ children }: { children: ReactNode }) {
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
  const control = 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--control)] p-3'
  return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] px-4 py-8 text-[var(--text-primary)]">
    <section className="w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--panel)] p-6">
      <p className="mb-2 text-sm text-[var(--text-muted)]">GoodBuddy · ShareServer</p>
      <h1 className="text-2xl font-semibold">{!session ? '连接控制台' : setup ? '创建首位管理员' : '管理员登录'}</h1>
      {error && <p role="alert" className="mt-4">{error}</p>}
      {!session ? <div className="mt-4">{error ? <Button onClick={() => setRetry(v => v + 1)}>重试</Button> : <p role="status">正在读取登录状态…</p>}</div> : <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); void submit() }}>
        {setup && <><p className="text-sm text-[var(--text-muted)]">使用服务器上的一次性初始化码创建管理员。创建后，此入口将关闭。</p><label className="block space-y-2"><span>初始化码</span><input required type="password" autoComplete="off" className={control} value={setupToken} onChange={e => setSetupToken(e.target.value)} /></label></>}
        <label className="block space-y-2"><span>管理员账号</span><input required autoComplete="username" minLength={3} maxLength={64} pattern="[a-zA-Z0-9_.@\-]+" className={control} value={username} onChange={e => setUsername(e.target.value)} /></label>
        <label className="block space-y-2"><span>密码</span><input required type="password" autoComplete={setup ? 'new-password' : 'current-password'} minLength={12} maxLength={1024} className={control} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {setup && <><p className="text-sm text-[var(--text-muted)]">账号为 3–64 位字母、数字或 _.@-，密码至少 12 位。</p><label className="block space-y-2"><span>确认密码</span><input required type="password" autoComplete="new-password" minLength={12} maxLength={1024} className={control} value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label></>}
        <Button className="w-full" disabled={busy} type="submit">{busy ? '正在验证…' : setup ? '创建管理员并登录' : '登录'}</Button>
      </form>}
    </section>
  </main>
}
