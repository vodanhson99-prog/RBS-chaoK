export type TemplateKind = 'single' | 'strip'

export type TemplateSlot = {
  x: number
  y: number
  w: number
  h: number
  radius?: number
}

export type Template = {
  id: string
  name: string
  src: string
  kind: TemplateKind
  keepBottom?: number
  photoSlots?: TemplateSlot[]
  photoSlotMode?: 'dark' | 'cutout'
  photoArea?: TemplateSlot
  photoAreaMode?: 'dark' | 'light'
}

const MY_TEAM_FOUR_SLOTS: TemplateSlot[] = [
  { x: 47 / 682, y: 79 / 1024, w: 285 / 682, h: 344 / 1024 },
  { x: 361 / 682, y: 128 / 1024, w: 284 / 682, h: 343 / 1024 },
  { x: 47 / 682, y: 467 / 1024, w: 285 / 682, h: 343 / 1024 },
  { x: 361 / 682, y: 512 / 1024, w: 285 / 682, h: 344 / 1024 },
]

const ROBOTICS_BLUE_FOUR_SLOTS: TemplateSlot[] = [
  { x: 63 / 703, y: 60 / 1024, w: 276 / 703, h: 413 / 1024 },
  { x: 367 / 703, y: 60 / 1024, w: 307 / 703, h: 365 / 1024 },
  { x: 81 / 703, y: 501 / 1024, w: 273 / 703, h: 375 / 1024 },
  { x: 376 / 703, y: 495 / 1024, w: 277 / 703, h: 411 / 1024 },
]

const ROBOTICS_GRAY_TWO_SLOTS: TemplateSlot[] = [
  { x: 63 / 682, y: 102 / 1024, w: 561 / 682, h: 331 / 1024 },
  { x: 63 / 682, y: 607 / 1024, w: 561 / 682, h: 330 / 1024 },
]

const MUSIC_FOUR_SLOTS: TemplateSlot[] = [
  { x: 17 / 220, y: 15 / 680, w: 187 / 220, h: 130 / 680, radius: 12 / 220 },
  { x: 17 / 220, y: 161 / 680, w: 187 / 220, h: 130 / 680, radius: 12 / 220 },
  { x: 17 / 220, y: 307 / 680, w: 187 / 220, h: 130 / 680, radius: 12 / 220 },
  { x: 17 / 220, y: 453 / 680, w: 187 / 220, h: 130 / 680, radius: 12 / 220 },
]

const NAVY_FOUR_SLOTS: TemplateSlot[] = [
  { x: 11 / 248, y: 9 / 742, w: 226 / 248, h: 140 / 742, radius: 10 / 248 },
  { x: 11 / 248, y: 160 / 742, w: 226 / 248, h: 140 / 742, radius: 10 / 248 },
  { x: 11 / 248, y: 311 / 742, w: 226 / 248, h: 140 / 742, radius: 10 / 248 },
  { x: 11 / 248, y: 462 / 742, w: 226 / 248, h: 140 / 742, radius: 10 / 248 },
]

const ROBOTICS_NAVY_FOUR_SLOTS: TemplateSlot[] = [
  { x: 32 / 344, y: 58 / 1024, w: 274 / 344, h: 230 / 1024 },
  { x: 32 / 344, y: 294 / 1024, w: 274 / 344, h: 230 / 1024 },
  { x: 32 / 344, y: 530 / 1024, w: 274 / 344, h: 230 / 1024 },
  { x: 32 / 344, y: 765 / 1024, w: 274 / 344, h: 230 / 1024 },
]

export const TEMPLATES: Template[] = [
  {
    id: 'blue',
    name: 'Navy 16:9',
    src: '/frames/blueframe.png',
    kind: 'single',
  },
  {
    id: 'red',
    name: 'Maroon 16:9',
    src: '/frames/redframe.png',
    kind: 'single',
  },
  {
    id: 'robotics-soc-son',
    name: 'Robotics Soc Son',
    src: '/frames/robotics-soc-son.png',
    kind: 'single',
    photoArea: { x: 0.025, y: 0.045, w: 0.95, h: 0.707 },
    photoAreaMode: 'dark',
  },
  {
    id: 'my-team-six-strip',
    name: 'My Team — 6 shot',
    src: '/frames/my-team-six-strip.png',
    kind: 'strip',
    photoSlots: MY_TEAM_FOUR_SLOTS,
    photoSlotMode: 'cutout',
  },
  {
    id: 'robotics-four-blue',
    name: 'Robotics 2026 — Blue 4 shot',
    src: '/frames/robotics-four-blue.png',
    kind: 'strip',
    photoSlots: ROBOTICS_BLUE_FOUR_SLOTS,
    photoSlotMode: 'cutout',
  },
  {
    id: 'robotics-two-gray',
    name: 'Robotics Soc Son — Gray 2 shot',
    src: '/frames/robotics-two-gray.png',
    kind: 'strip',
    photoSlots: ROBOTICS_GRAY_TWO_SLOTS,
    photoSlotMode: 'cutout',
  },
  {
    id: 'music-four-strip',
    name: 'Join With Me — 4 shot',
    src: '/frames/music-four-strip.png',
    kind: 'strip',
    photoSlots: MUSIC_FOUR_SLOTS,
    photoSlotMode: 'cutout',
  },
  {
    id: 'robotics-four-navy',
    name: 'Robotics Soc Son — Navy 4 shot',
    src: '/frames/robotics-four-navy.png',
    kind: 'strip',
    photoSlots: ROBOTICS_NAVY_FOUR_SLOTS,
    photoSlotMode: 'cutout',
  },
  {
    id: 'navy-four-strip',
    name: 'Navy Night — 4 shot',
    src: '/frames/navy-four-strip.png',
    kind: 'strip',
    photoSlots: NAVY_FOUR_SLOTS,
    photoSlotMode: 'cutout',
  },
]

export function templateById(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}

export function nextTemplate(id: string): Template {
  const i = TEMPLATES.findIndex((t) => t.id === id)
  return TEMPLATES[(i + 1) % TEMPLATES.length]
}
