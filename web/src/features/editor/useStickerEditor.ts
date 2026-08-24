'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLatestEdit, fetchPhoto, photoImageUrl, savePhotoEdit } from '../../lib/api'
import type { PhotoFilterId } from '../../lib/editor/filters'
import { MOCK_STICKERS, nextZIndex, stickerById } from '../../lib/editor/mockStickers'
import { buildRecipe, clonePlacements, preloadStickerAssets, renderEditedPhoto } from '../../lib/editor/renderEdit'
import type { StickerPlacement } from '../../lib/editor/types'

export type EditorPanel = 'stickers' | 'filters'

function uid() {
  return crypto.randomUUID()
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function useStickerEditor(token: string) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [photoSrc, setPhotoSrc] = useState('')
  const [stickers, setStickers] = useState<StickerPlacement[]>([])
  const [filter, setFilterState] = useState<PhotoFilterId>('none')
  const [panel, setPanel] = useState<EditorPanel>('stickers')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<{ stickers: StickerPlacement[]; filter: PhotoFilterId }[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dragRef = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number } | null>(
    null,
  )
  const pinchRef = useRef<{
    id: string
    startDist: number
    startScale: number
    startAngle: number
    startRotation: number
  } | null>(null)

  const snapshot = useCallback(
    () => ({ stickers: clonePlacements(stickers), filter }),
    [filter, stickers],
  )

  const pushHistory = useCallback(() => {
    setHistory((prev) => [...prev.slice(-24), snapshot()])
    setSaved(false)
  }, [snapshot])

  const applyWithHistory = useCallback((updater: (current: StickerPlacement[]) => StickerPlacement[]) => {
    setStickers((current) => {
      setHistory((prev) => [...prev.slice(-24), { stickers: clonePlacements(current), filter }])
      setSaved(false)
      return updater(current)
    })
  }, [filter])

  const mutate = useCallback((updater: (current: StickerPlacement[]) => StickerPlacement[]) => {
    setStickers((current) => {
      setSaved(false)
      return updater(current)
    })
  }, [])

  const setFilter = useCallback(
    (next: PhotoFilterId) => {
      if (next === filter) return
      setHistory((prev) => [...prev.slice(-24), snapshot()])
      setFilterState(next)
      setSaved(false)
    },
    [filter, snapshot],
  )

  useEffect(() => {
    preloadStickerAssets()
    const controller = new AbortController()
    void (async () => {
      try {
        await fetchPhoto(token, controller.signal)
        setPhotoSrc(photoImageUrl(token, { original: true }))
        try {
          const edit = await fetchLatestEdit(token, controller.signal)
          if (edit.recipe?.stickers?.length) setStickers(edit.recipe.stickers)
          if (edit.recipe?.filter) setFilterState(edit.recipe.filter)
        } catch {
          // No prior edit.
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
          setError(e instanceof Error ? e.message : 'Photo not found')
        }
      } finally {
        setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [token])

  const addSticker = useCallback(
    (stickerId: string) => {
      if (!stickerById(stickerId)) return
      let newId = ''
      applyWithHistory((current) => {
        const placement: StickerPlacement = {
          id: (newId = uid()),
          stickerId,
          x: 0.5,
          y: 0.5,
          scale: 1,
          rotation: 0,
          zIndex: nextZIndex(current),
        }
        return [...current, placement]
      })
      if (newId) {
        setSelectedId(newId)
        setPanel('stickers')
      }
    },
    [applyWithHistory],
  )

  const updateSelected = useCallback(
    (patch: Partial<Pick<StickerPlacement, 'scale' | 'rotation' | 'x' | 'y'>>) => {
      if (!selectedId) return
      mutate((current) =>
        current.map((s) =>
          s.id === selectedId
            ? {
                ...s,
                ...patch,
                scale: patch.scale !== undefined ? Math.min(3, Math.max(0.35, patch.scale)) : s.scale,
              }
            : s,
        ),
      )
    },
    [mutate, selectedId],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    const id = selectedId
    applyWithHistory((current) => current.filter((s) => s.id !== id))
    setSelectedId(null)
  }, [applyWithHistory, selectedId])

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev
      const previous = prev[prev.length - 1]
      setStickers(clonePlacements(previous.stickers))
      setFilterState(previous.filter)
      setSelectedId(null)
      setSaved(false)
      return prev.slice(0, -1)
    })
  }, [])

  const reset = useCallback(() => {
    setHistory((prev) => [...prev.slice(-24), snapshot()])
    setStickers([])
    setFilterState('none')
    setSelectedId(null)
    setSaved(false)
  }, [snapshot])

  const onStickerPointerDown = useCallback(
    (id: string, event: React.PointerEvent) => {
      event.stopPropagation()
      setSelectedId(id)
      setPanel('stickers')
      const target = stickers.find((s) => s.id === id)
      if (!target) return
      dragRef.current = { id, startX: event.clientX, startY: event.clientY, originX: target.x, originY: target.y }
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    },
    [stickers],
  )

  const onStagePointerDown = useCallback(() => {
    setSelectedId(null)
  }, [])

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const dx = (event.clientX - drag.startX) / rect.width
      const dy = (event.clientY - drag.startY) / rect.height
      mutate((current) =>
        current.map((s) =>
          s.id === drag.id ? { ...s, x: clamp01(drag.originX + dx), y: clamp01(drag.originY + dy) } : s,
        ),
      )
    },
    [mutate],
  )

  const onPointerUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null
      pushHistory()
    }
    pinchRef.current = null
  }, [pushHistory])

  const onStickerTouchPinch = useCallback(
    (id: string, event: React.TouchEvent) => {
      if (event.touches.length !== 2) return
      event.preventDefault()
      const [a, b] = [event.touches[0], event.touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX)
      const target = stickers.find((s) => s.id === id)
      if (!target) return

      if (!pinchRef.current || pinchRef.current.id !== id) {
        pinchRef.current = {
          id,
          startDist: dist,
          startScale: target.scale,
          startAngle: angle,
          startRotation: target.rotation,
        }
        return
      }

      const scale = Math.min(3, Math.max(0.35, pinchRef.current.startScale * (dist / pinchRef.current.startDist)))
      const rotation = pinchRef.current.startRotation + ((angle - pinchRef.current.startAngle) * 180) / Math.PI
      mutate((current) => current.map((s) => (s.id === id ? { ...s, scale, rotation } : s)))
    },
    [mutate, stickers],
  )

  const hasChanges = stickers.length > 0 || filter !== 'none'

  const save = useCallback(async () => {
    if (!photoSrc || !hasChanges) return
    setSaving(true)
    setError(null)
    try {
      const recipe = buildRecipe(stickers, filter)
      const { blob } = await renderEditedPhoto(photoSrc, recipe)
      await savePhotoEdit(token, recipe, blob)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [filter, hasChanges, photoSrc, stickers, token])

  const selected = stickers.find((s) => s.id === selectedId) ?? null

  return {
    stageRef,
    loading,
    error,
    photoSrc,
    stickers,
    filter,
    panel,
    selected,
    selectedId,
    saving,
    saved,
    catalog: MOCK_STICKERS,
    hasChanges,
    addSticker,
    setFilter,
    setPanel,
    updateSelected,
    deleteSelected,
    undo,
    reset,
    save,
    onStickerPointerDown,
    onStagePointerDown,
    onPointerMove,
    onPointerUp,
    onStickerTouchPinch,
    canUndo: history.length > 0,
  }
}
