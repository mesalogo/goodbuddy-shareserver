import { Languages } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { Button } from './ui/button'

export function LanguageSwitch() {
  const { language, setLanguage } = useI18n()
  return <Button variant="ghost" aria-label={language === 'en' ? '切换到中文' : 'Switch to English'} title={language === 'en' ? '切换到中文' : 'Switch to English'} onClick={() => setLanguage(language === 'en' ? 'zh-CN' : 'en')}>
    <Languages aria-hidden="true" className="size-4" /><span className="text-xs">{language === 'en' ? '中文' : 'EN'}</span>
  </Button>
}
