import { PageHeader } from './page-header'
import { LocalSharing } from './local-sharing'
import { useState } from 'react'
import { PageTabs } from './page-tabs'

export function SharingCenter() {
  const [activeTab, setActiveTab] = useState('capabilities')
  return <>
    <PageHeader eyebrow="当前本地服务" title="共享中心" description="查看当前服务登记的设备与发布记录。" />
    <PageTabs title="共享中心" active={activeTab} onChange={setActiveTab} tabs={[{ key: 'capabilities', label: '能力目录' }, { key: 'knowledge', label: '共享知识库' }, { key: 'members', label: '按成员查看' }, { key: 'devices', label: '按设备查看' }]} />
    <section aria-label="本地服务目录" className="space-y-4">
      {activeTab === 'capabilities' ? <LocalSharing /> : <div className="space-y-4 rounded-2xl border border-white/10 bg-[var(--panel)] p-4 sm:p-5"><h2 className="font-semibold">{activeTab === 'knowledge' ? '共享知识库' : activeTab === 'members' ? '按成员查看' : '按设备查看'}</h2><p className="text-sm leading-6 text-[var(--text-muted)]">该 Tab 的生产接口尚未接入。当前目录只保存发布元数据，不提供正文读取、成员授权或设备在线状态。</p></div>}
    </section>
  </>
}
