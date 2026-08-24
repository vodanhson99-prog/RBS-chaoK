import type { PhotoFilterId } from '../../web/src/lib/editor/filters'

export type PhotoStatus = 'private' | 'revoked'

export type PhotoMeta = {
  id: string
  token: string
  status: PhotoStatus
  url: string
  imageUrl: string
  createdAt: string
  expiresAt: string
  storedUntil: string
  frameId: string | null
  frameVersion: number | null
  captureMode: string | null
  eventId: string | null
  boothId: string | null
  hasEdit: boolean
}

export type StickerPlacement = {
  id: string
  stickerId: string
  x: number
  y: number
  scale: number
  rotation: number
  zIndex: number
}

export type EditRecipe = {
  stickers: StickerPlacement[]
  filter?: PhotoFilterId
}

export type EditRecord = {
  id: string
  photoId: string
  recipe: EditRecipe
  renderedAssetKey: string | null
  createdAt: string
}

export type SaveEditResponse = {
  id: string
  photoId: string
  token: string
  recipe: EditRecipe
  createdAt: string
  hasRendered: boolean
  imageUrl: string
}

/** @deprecated Compatibility contract for retained `/api/sessions` routes. */
export type CaptureSession = {
  token: string
  status: 'available' | 'expired' | 'revoked'
  createdAt: string
  expiresAt: string
  templateId: string | null
  templateVersion: number | null
  captureMode: string | null
  eventId: string | null
  boothId: string | null
  contentType: 'image/jpeg'
  bytes: number
}

/** @deprecated Use PhotoMeta for active frontend consumers. */
export type SessionMeta = Pick<
  CaptureSession,
  'token' | 'status' | 'createdAt' | 'expiresAt' | 'templateId' | 'templateVersion' | 'captureMode' | 'eventId' | 'boothId'
> & {
  url: string
  imageUrl: string
}

export type SessionError = {
  error: { code: string; message: string; requestId?: string }
}
