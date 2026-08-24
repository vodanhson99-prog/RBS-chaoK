export type PhotoFilterId = 'none' | 'mono' | 'warm' | 'cool' | 'vivid' | 'fade'

export type PhotoFilter = {
  id: PhotoFilterId
  label: string
  css: string
}

export const PHOTO_FILTERS: PhotoFilter[] = [
  { id: 'none', label: 'ORIGINAL', css: 'none' },
  { id: 'vivid', label: 'VIVID', css: 'saturate(1.35) contrast(1.08)' },
  { id: 'warm', label: 'WARM', css: 'sepia(0.28) saturate(1.15) brightness(1.03)' },
  { id: 'cool', label: 'COOL', css: 'saturate(0.9) hue-rotate(12deg) brightness(1.04)' },
  { id: 'mono', label: 'MONO', css: 'grayscale(1) contrast(1.1)' },
  { id: 'fade', label: 'FADE', css: 'contrast(0.92) brightness(1.08) saturate(0.75)' },
]

export function filterCss(id: PhotoFilterId): string {
  return PHOTO_FILTERS.find((f) => f.id === id)?.css ?? 'none'
}
