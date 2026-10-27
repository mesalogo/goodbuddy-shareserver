import { useSyncExternalStore } from 'react'

export type Language = 'zh-CN' | 'en'
const storageKey = 'shareserver-language'
const changeEvent = 'shareserver-language-change'

export function getLanguage(): Language {
  try { return localStorage.getItem(storageKey) === 'en' ? 'en' : 'zh-CN' }
  catch { return 'zh-CN' }
}

export function setLanguage(language: Language) {
  try { localStorage.setItem(storageKey, language) } catch { /* Switching still works in this tab. */ }
  currentLanguage = language
  document.documentElement.lang = language
  window.dispatchEvent(new Event(changeEvent))
}

let currentLanguage: Language | undefined
function snapshot() { return currentLanguage ?? getLanguage() }
function subscribe(callback: () => void) {
  document.documentElement.lang = snapshot()
  const sync = (event: Event) => {
    if (event instanceof StorageEvent) {
      if (event.key !== storageKey && event.key !== null) return
      currentLanguage = getLanguage()
    }
    document.documentElement.lang = snapshot()
    callback()
  }
  window.addEventListener(changeEvent, sync)
  window.addEventListener('storage', sync)
  return () => { window.removeEventListener(changeEvent, sync); window.removeEventListener('storage', sync) }
}

type Values = Record<string, string | number>
export function translate(zh: string, en: string, values: Values = {}) {
  return (snapshot() === 'en' ? en : zh).replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match))
}

export function formatDate(value: string | number | Date) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return translate('未知', 'Unknown')
  return new Intl.DateTimeFormat(snapshot() === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function useI18n() {
  const language = useSyncExternalStore(subscribe, snapshot, () => 'zh-CN' as Language)
  return { language, setLanguage, t: translate, formatDate, locale: language === 'en' ? 'en-US' : 'zh-CN' }
}
