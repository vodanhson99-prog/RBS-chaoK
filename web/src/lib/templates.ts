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

const RBS_STRIP_SLOTS: TemplateSlot[] = [
  { x: 0.043, y: 0.096, w: 0.397, h: 0.238 },
  { x: 0.542, y: 0.096, w: 0.391, h: 0.238 },
  { x: 0.043, y: 0.359, w: 0.397, h: 0.243 },
  { x: 0.542, y: 0.359, w: 0.391, h: 0.243 },
  { x: 0.043, y: 0.628, w: 0.397, h: 0.24 },
  { x: 0.542, y: 0.628, w: 0.391, h: 0.24 },
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

const MY_TEAM_SIX_SLOTS: TemplateSlot[] = [
  { x: 42 / 682, y: 77 / 1024, w: 294 / 682, h: 216 / 1024 },
  { x: 349 / 682, y: 77 / 1024, w: 294 / 682, h: 216 / 1024 },
  { x: 42 / 682, y: 340 / 1024, w: 294 / 682, h: 216 / 1024 },
  { x: 349 / 682, y: 340 / 1024, w: 294 / 682, h: 216 / 1024 },
  { x: 42 / 682, y: 604 / 1024, w: 294 / 682, h: 216 / 1024 },
  { x: 349 / 682, y: 604 / 1024, w: 294 / 682, h: 216 / 1024 },
]

const ROBOTICS_BLUE_FOUR_SLOTS: TemplateSlot[] = [
  { x: 64 / 703, y: 60 / 1024, w: 275 / 703, h: 414 / 1024 },
  { x: 366 / 703, y: 82 / 1024, w: 294 / 703, h: 410 / 1024 },
  { x: 86 / 703, y: 494 / 1024, w: 261 / 703, h: 412 / 1024 },
  { x: 376 / 703, y: 494 / 1024, w: 274 / 703, h: 414 / 1024 },
]

const RBS_K42_SIX_SLOTS: TemplateSlot[] = [
  { x: 25 / 589, y: 97 / 1024, w: 248 / 589, h: 245 / 1024 },
  { x: 317 / 589, y: 97 / 1024, w: 244 / 589, h: 245 / 1024 },
  { x: 25 / 589, y: 369 / 1024, w: 248 / 589, h: 247 / 1024 },
  { x: 317 / 589, y: 369 / 1024, w: 244 / 589, h: 247 / 1024 },
  { x: 25 / 589, y: 643 / 1024, w: 248 / 589, h: 247 / 1024 },
  { x: 317 / 589, y: 643 / 1024, w: 244 / 589, h: 247 / 1024 },
]

const ROBOTICS_NAVY_FOUR_SLOTS: TemplateSlot[] = [
  { x: 32 / 344, y: 58 / 1024, w: 274 / 344, h: 230 / 1024 },
  { x: 32 / 344, y: 294 / 1024, w: 274 / 344, h: 230 / 1024 },
  { x: 32 / 344, y: 530 / 1024, w: 274 / 344, h: 230 / 1024 },
  { x: 32 / 344, y: 765 / 1024, w: 274 / 344, h: 230 / 1024 },
]

const ROBOTICS_LIGHTBLUE_FOUR_SLOTS: TemplateSlot[] = [
  { x: 46 / 344, y: 225 / 1024, w: 248 / 344, h: 159 / 1024, radius: 15 / 344 },
  { x: 46 / 344, y: 425 / 1024, w: 248 / 344, h: 159 / 1024, radius: 15 / 344 },
  { x: 46 / 344, y: 625 / 1024, w: 248 / 344, h: 159 / 1024, radius: 15 / 344 },
  { x: 46 / 344, y: 825 / 1024, w: 248 / 344, h: 159 / 1024, radius: 15 / 344 },
]

const ROBOTICS_GRAY_TWO_SLOTS: TemplateSlot[] = [
  { x: 63 / 682, y: 102 / 1024, w: 561 / 682, h: 331 / 1024 },
  { x: 63 / 682, y: 607 / 1024, w: 561 / 682, h: 330 / 1024 },
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
    id: 'rbs-decorated',
    name: 'RBS K42 — Deco strip',
    src: '/frames/rbs-strip-decorated.png',
    kind: 'strip',
    photoSlots: RBS_STRIP_SLOTS,
    photoSlotMode: 'cutout',
  },
  {
    id: 'rbs-clean',
    name: 'RBS K42 — Clean strip',
    src: '/frames/rbs-strip-clean.png',
    kind: 'strip',
    photoSlots: RBS_STRIP_SLOTS,
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
    id: 'navy-four-strip',
    name: 'Navy Night — 4 shot',
    src: '/frames/navy-four-strip.png',
    kind: 'strip',
    photoSlots: NAVY_FOUR_SLOTS,
    photoSlotMode: 'cutout',
  },
  {
    id: 'my-team-six-strip',
    name: 'My Team — 6 shot',
    src: '/frames/my-team-six-strip.png',
    kind: 'strip',
    photoSlots: MY_TEAM_SIX_SLOTS,
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
    id: 'rbs-k42-six',
    name: 'RBS K42 — Black 6 shot',
    src: '/frames/rbs-k42-six.png',
    kind: 'strip',
    photoSlots: RBS_K42_SIX_SLOTS,
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
    id: 'robotics-four-lightblue',
    name: 'Robotics Qty Soc Son — Light Blue 4 shot',
    src: '/frames/robotics-four-lightblue.png',
    kind: 'strip',
    photoSlots: ROBOTICS_LIGHTBLUE_FOUR_SLOTS,
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
]

export function templateById(id: string | null | undefined): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}

export function nextTemplate(id: string): Template {
  const i = TEMPLATES.findIndex((t) => t.id === id)
  return TEMPLATES[(i + 1) % TEMPLATES.length]
}
