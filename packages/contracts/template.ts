export type TemplateKind = 'single' | 'strip6' | 'custom'

export type TemplateSlot = { x: number; y: number; w: number; h: number; rotation?: number }
export type FrameSlot = TemplateSlot

export type FrameAssetMime = 'image/png' | 'image/jpeg' | 'image/svg+xml'

export type TemplateManifest = {
  id: string
  version: number
  name: string
  kind: TemplateKind
  output: { width: number; height: number; mimeType: 'image/jpeg' }
  layout: { mode: 'single' | 'strip' | 'custom'; crop: 'cover' }
  slots: TemplateSlot[]
  asset: { src: string; expectedMimeType: FrameAssetMime }
  thumbnailSrc: string
  source?: 'builtin' | 'custom'
  deletable?: boolean
}

export type FrameManifest = TemplateManifest & {
  src: string
}
