import { useLayoutEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const storageKey = 'shareserver-theme'
const themeEvent = 'shareserver-theme-change'

function readTheme(): Theme {
  try { return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])
  useLayoutEffect(() => {
    const sync = (event: Event) => {
      if (event instanceof CustomEvent) setTheme(event.detail as Theme)
      else if (event instanceof StorageEvent && (event.key === storageKey || event.key === null)) setTheme(readTheme())
    }
    window.addEventListener('storage', sync)
    window.addEventListener(themeEvent, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(themeEvent, sync)
    }
  }, [])
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem(storageKey, next) } catch { /* Theme remains usable without storage. */ }
    setTheme(next)
    window.dispatchEvent(new CustomEvent(themeEvent, { detail: next }))
  }
  return { dark: theme === 'dark', toggleTheme }
}
