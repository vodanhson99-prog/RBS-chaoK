import type { MockSticker } from './types'

/** Placeholder catalog — swap src paths when real sticker pack is ready. */
export const MOCK_STICKERS: MockSticker[] = [
  { id: 'star', label: 'STAR', src: '/stickers/star.svg', baseSize: 0.14 },
  { id: 'heart', label: 'HEART', src: '/stickers/heart.svg', baseSize: 0.14 },
  { id: 'crown', label: 'CROWN', src: '/stickers/crown.svg', baseSize: 0.16 },
  { id: 'bolt', label: 'BOLT', src: '/stickers/bolt.svg', baseSize: 0.13 },
  { id: 'sparkle', label: 'SPARK', src: '/stickers/sparkle.svg', baseSize: 0.14 },
  { id: 'smile', label: 'SMILE', src: '/stickers/smile.svg', baseSize: 0.14 },
  { id: 'flame', label: 'FLAME', src: '/stickers/flame.svg', baseSize: 0.13 },
  { id: 'music', label: 'MUSIC', src: '/stickers/music.svg', baseSize: 0.15 },
]

export function stickerById(id: string): MockSticker | undefined {
  return MOCK_STICKERS.find((s) => s.id === id)
}

export function nextZIndex(placements: { zIndex: number }[]): number {
  if (placements.length === 0) return 1
  return Math.max(...placements.map((p) => p.zIndex)) + 1
}
