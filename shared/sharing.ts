export interface DeviceInput {
  id: string
  name: string
  platform: string
  appVersion: string
}

export interface Device extends DeviceInput {
  registeredAt: string
  updatedAt: string
}

export interface PublicationInput {
  id: string
  deviceId: string
  name: string
  kind: 'capability' | 'knowledge'
  description: string
  sourceMode: 'device' | 'server'
  permissions: { search: boolean; read: boolean; download: boolean }
}

export interface Publication extends PublicationInput {
  status: 'published' | 'revoked'
  createdAt: string
  updatedAt: string
}
