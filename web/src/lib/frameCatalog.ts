import { useEffect, useState } from 'react'
import { fetchFrames } from './api'
import { TEMPLATES, type Template } from './templates'

export type FrameCatalogItem = Template

export const FRAME_CATALOG: FrameCatalogItem[] = TEMPLATES

export function frameById(id: string | undefined, frames: FrameCatalogItem[] = FRAME_CATALOG): FrameCatalogItem {
  return frames.find((frame) => frame.id === id) ?? frames[0] ?? FRAME_CATALOG[0]
}

let catalogPromise: Promise<FrameCatalogItem[]> | null = null
const FRAME_CATALOG_UPDATED = 'rbs:frame-catalog-updated'

function mergeFrameCatalog(custom: FrameCatalogItem[]): FrameCatalogItem[] {
  const customIds = new Set(custom.map((frame) => frame.id))
  return [...TEMPLATES.filter((frame) => !customIds.has(frame.id)), ...custom]
}

function loadCatalog(): Promise<FrameCatalogItem[]> {
  if (!catalogPromise) {
    catalogPromise = fetchFrames()
      .then(mergeFrameCatalog)
      .catch(() => FRAME_CATALOG)
  }
  return catalogPromise
}

export function refreshFrameCatalog(): void {
  catalogPromise = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FRAME_CATALOG_UPDATED))
}

export function useFrameCatalog(): { frames: FrameCatalogItem[]; loading: boolean } {
  const [frames, setFrames] = useState<FrameCatalogItem[]>(FRAME_CATALOG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = () => {
      setLoading(true)
      void loadCatalog()
        .then((nextFrames) => {
          if (active) setFrames(nextFrames)
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }
    load()
    const onCatalogUpdated = () => load()
    window.addEventListener(FRAME_CATALOG_UPDATED, onCatalogUpdated)
    return () => {
      active = false
      window.removeEventListener(FRAME_CATALOG_UPDATED, onCatalogUpdated)
    }
  }, [])

  return { frames, loading }
}
