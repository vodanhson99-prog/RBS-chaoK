import { EXPORT_2K, EXPORT_2K_STRIP } from './imageExport'

export type TemplateKind = 'single' | 'strip6'

type FrameAssetMime = 'image/png' | 'image/jpeg' | 'image/svg+xml'

export type TemplateSlot = { x: number; y: number; w: number; h: number }

export type Template = {
  id: string
  name: string
  src: string
  kind: TemplateKind
  keepBottom?: number
  version: number
  output: { width: number; height: number; mimeType: 'image/jpeg' }
  layout: { mode: 'single' | 'strip'; crop: 'cover' }
  asset: { src: string; expectedMimeType: FrameAssetMime }
  slots: TemplateSlot[]
  thumbnailSrc: string
  source?: 'builtin' | 'custom'
  deletable?: boolean
}

const SINGLE_OUTPUT = { width: EXPORT_2K.width, height: EXPORT_2K.height, mimeType: 'image/jpeg' as const }

function singleFrame(id: string, name: string, src: string): Template {
  return {
    id,
    version: 2,
    name,
    src,
    kind: 'single',
    output: SINGLE_OUTPUT,
    layout: { mode: 'single', crop: 'cover' },
    asset: { src, expectedMimeType: src.endsWith('.svg') ? 'image/svg+xml' : 'image/png' },
    slots: [],
    thumbnailSrc: src,
    source: 'builtin',
    deletable: false,
  }
}

export const TEMPLATES: Template[] = [
  singleFrame('blue', 'Navy 16:9', '/frames/blueframe.svg'),
  singleFrame('red', 'Maroon 16:9', '/frames/redframe.svg'),
  singleFrame('citrus', 'Citrus Line', '/frames/citrus.svg'),
  singleFrame('violet', 'Violet Bloom', '/frames/violet.svg'),
  singleFrame('aqua', 'Aqua Wave', '/frames/aqua.svg'),
  singleFrame('sunset', 'Sunset Club', '/frames/sunset.svg'),
  singleFrame('mono', 'Mono Grid', '/frames/mono.svg'),
  singleFrame('rose', 'Rose Ribbon', '/frames/rose.svg'),
  singleFrame('lime', 'Lime Pop', '/frames/lime.svg'),
  singleFrame('paper', 'Paper Cut', '/frames/paper.svg'),
  singleFrame('chrome', 'Chrome Flash', '/frames/chrome.svg'),
  {
    id: 'woozi',
    version: 2,
    name: 'Woozi strip ×6',
    src: '/frames/woozi-strip.svg',
    kind: 'strip6',
    output: { width: EXPORT_2K_STRIP.width, height: EXPORT_2K_STRIP.height, mimeType: 'image/jpeg' },
    layout: { mode: 'strip', crop: 'cover' },
    asset: { src: '/frames/woozi-strip.svg', expectedMimeType: 'image/svg+xml' },
    thumbnailSrc: '/frames/woozi-strip.svg',
    source: 'builtin',
    deletable: false,
    slots: [
      { x: 54, y: 80, w: 246, h: 270 },
      { x: 372, y: 80, w: 246, h: 270 },
      { x: 54, y: 371, w: 246, h: 270 },
      { x: 372, y: 371, w: 246, h: 270 },
      { x: 54, y: 662, w: 246, h: 270 },
      { x: 372, y: 662, w: 246, h: 270 },
    ],
  },
]

export function templateById(id: string | null | undefined, templates: Template[] = TEMPLATES): Template {
  return templates.find((template) => template.id === id) ?? templates[0] ?? TEMPLATES[0]
}
