import { PageHeader } from './page-header'
import { LocalSharing } from './local-sharing'
import { useSearchParams } from 'react-router-dom'
import { PageTabs } from './page-tabs'
import { useI18n } from '../lib/i18n'

export function SharingCenter() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab')
  const activeTab = tab === 'knowledge' || tab === 'members' || tab === 'devices' ? tab : 'capabilities'
  const setActiveTab = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', value)
    next.delete('kind')
    setParams(next)
  }
  return <>
    <PageHeader eyebrow={t('当前本地服务', 'Current local service')} title={t('共享中心', 'Sharing center')} description={t('查看当前服务登记的设备与发布记录。', 'View devices and publication records registered with this service.')} />
    <PageTabs title={t('共享中心', 'Sharing center')} active={activeTab} onChange={setActiveTab} tabs={[{ key: 'capabilities', label: t('能力目录', 'Capability directory') }, { key: 'knowledge', label: t('共享知识库', 'Shared knowledge bases') }, { key: 'members', label: t('按成员查看', 'By member') }, { key: 'devices', label: t('按设备查看', 'By device') }]} />
    <section aria-label={t('本地服务目录', 'Local service directory')} className="space-y-4">
      <LocalSharing key={activeTab} view={activeTab} />
    </section>
  </>
}
