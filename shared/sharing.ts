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

export type DeviceStatus = 'approved' | 'pending' | 'rejected' | 'disabled'
export type RegistrationStatus = DeviceStatus | 'unregistered'
export interface SharingEvent {
  id: string
  at: string
  kind: 'registration' | 'approved' | 'rejected' | 'disabled' | 'publication-revoked'
  deviceId: string
  publicationId: string | null
  registrationStatus: RegistrationStatus
}
export interface SharingHistory {
  events: SharingEvent[]
  retentionLimit: number
}
export interface DeviceDetails {
  device: Device & { registrationStatus: RegistrationStatus }
  publications: Publication[]
  history: SharingHistory
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
