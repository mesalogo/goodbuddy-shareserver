// Local metadata fixtures only. No document bodies, credentials or content API calls.
export type SharedItem = {
  id: string
  name: string
  kind: 'capability' | 'knowledge'
  publisher: string
  device: string
  version: string
  audience: string
  paused?: boolean
  source: 'remote' | 'synced'
  permissions: { search: boolean; read: boolean; download: boolean }
}

export const sharedItems: SharedItem[] = [
  { id: 'c-1', name: '图像生成', kind: 'capability', publisher: 'm-2', device: 'd-2', version: '2.1.0', audience: '设计中心', source: 'remote', permissions: { search: false, read: false, download: false } },
  { id: 'c-2', name: '文档转 Word', kind: 'capability', publisher: 'm-1', device: 'd-1', version: '1.4.0', audience: '全组织', source: 'remote', permissions: { search: false, read: false, download: false } },
  { id: 'c-3', name: '代码安全扫描', kind: 'capability', publisher: 'm-1', device: 'd-2', version: '3.0.2', audience: '平台工程', source: 'remote', paused: true, permissions: { search: false, read: false, download: false } },
  { id: 'k-1', name: '设计规范归档', kind: 'knowledge', publisher: 'm-2', device: 'd-3', version: '2026.09', audience: '全组织', source: 'synced', permissions: { search: true, read: true, download: false } },
  { id: 'k-2', name: '设计项目素材', kind: 'knowledge', publisher: 'm-2', device: 'd-3', version: '1.2.0', audience: '设计中心', source: 'remote', permissions: { search: true, read: false, download: true } },
  { id: 'k-3', name: '工程操作手册', kind: 'knowledge', publisher: 'm-1', device: 'd-1', version: '3.0.0', audience: '平台工程', source: 'remote', permissions: { search: true, read: false, download: false } },
  { id: 'k-4', name: '受限研究资料', kind: 'knowledge', publisher: 'm-1', device: 'd-2', version: '0.8.0', audience: '指定用户：林江', source: 'synced', permissions: { search: false, read: false, download: false } }
]

export function sharingAvailability(item: SharedItem, deviceStatus: string) {
  if (item.paused) return { available: false, label: '发布已暂停' }
  if (deviceStatus === '已撤销') return { available: false, label: '设备已撤销，发布不可用' }
  if (item.kind === 'knowledge' && item.source === 'synced') {
    return { available: true, label: '服务器副本就绪（示例）' }
  }
  return deviceStatus === '在线'
    ? { available: true, label: '远程设备就绪（示例）' }
    : { available: false, label: '设备离线，远程取用不可用' }
}
