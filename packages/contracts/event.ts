export type Workspace = {
  id: string
  name: string
}

export type EventSettings = {
  retentionHours: number
  publicSharing: boolean
  templateIds: string[]
}

export type Event = {
  id: string
  workspaceId: string
  name: string
  status: 'draft' | 'active' | 'ended'
  settings: EventSettings
}

export type BoothDevice = {
  id: string
  eventId: string
  name: string
  status: 'active' | 'revoked'
}
