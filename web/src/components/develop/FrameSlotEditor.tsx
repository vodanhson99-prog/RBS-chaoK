'use client'

import Image from 'next/image'
import Link from 'next/link'
import type { ChangeEvent, KeyboardEvent, PointerEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createFrame, deleteFrame, fetchFrames, type FrameManifest, type FrameSlot } from '../../lib/api'
import { refreshFrameCatalog } from '../../lib/frameCatalog'
import { loadImage, rasterizeImageAtSize } from '../../lib/overlay'

const DEFAULT_OUTPUT = { width: 2560, height: 1440 }
const MIN_SLOT = 48
const MAX_OUTPUT = 8192
const DEFAULT_SLOT = { width: 320, height: 240 }

type EditorSlot = FrameSlot & { id: string; rotation: number }
type CanvasPoint = { x: number; y: number }
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'
type Interaction =
  | { type: 'draw'; start: CanvasPoint; current: CanvasPoint }
  | { type: 'move'; id: string; offset: CanvasPoint }
  | { type: 'resize'; id: string; corner: ResizeCorner; start: CanvasPoint; slot: EditorSlot }
  | { type: 'rotate'; id: string; startAngle: number; startRotation: number; center: CanvasPoint }
  | null

type Draft = {
  id: string
  name: string
  width: number
  height: number
  slots: EditorSlot[]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56)
}

function makeDraft(): Draft {
  return {
    id: '',
    name: '',
    width: DEFAULT_OUTPUT.width,
    height: DEFAULT_OUTPUT.height,
    slots: [],
  }
}

function normalizeRotation(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180
  return Object.is(normalized, -0) ? 0 : normalized
}

function rotatePoint(point: CanvasPoint, angleDeg: number): CanvasPoint {
  const radians = (angleDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos }
}

function slotCenter(slot: FrameSlot): CanvasPoint {
  return { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 }
}

function slotCorners(slot: FrameSlot): CanvasPoint[] {
  const center = slotCenter(slot)
  const rotation = slot.rotation ?? 0
  return [
    { x: -slot.w / 2, y: -slot.h / 2 },
    { x: slot.w / 2, y: -slot.h / 2 },
    { x: slot.w / 2, y: slot.h / 2 },
    { x: -slot.w / 2, y: slot.h / 2 },
  ].map((point) => {
    const rotated = rotatePoint(point, rotation)
    return { x: center.x + rotated.x, y: center.y + rotated.y }
  })
}

function slotBounds(slot: FrameSlot) {
  const corners = slotCorners(slot)
  return {
    left: Math.min(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
    right: Math.max(...corners.map((point) => point.x)),
    bottom: Math.max(...corners.map((point) => point.y)),
  }
}

function fitSlot(slot: FrameSlot, width: number, height: number): FrameSlot {
  let next = {
    ...slot,
    x: Math.max(0, Math.min(slot.x, width)),
    y: Math.max(0, Math.min(slot.y, height)),
    rotation: normalizeRotation(slot.rotation ?? 0),
    w: Math.max(MIN_SLOT, Math.min(slot.w, width)),
    h: Math.max(MIN_SLOT, Math.min(slot.h, height)),
  }
  const bounds = slotBounds(next)
  const scale = Math.min(1, width / Math.max(bounds.right - bounds.left, 1), height / Math.max(bounds.bottom - bounds.top, 1))
  if (scale < 1) {
    const center = slotCenter(next)
    next = { ...next, w: next.w * scale, h: next.h * scale, x: center.x - (next.w * scale) / 2, y: center.y - (next.h * scale) / 2 }
  }
  const fitted = slotBounds(next)
  let dx = 0
  let dy = 0
  if (fitted.left < 0) dx = -fitted.left
  if (fitted.right + dx > width) dx -= fitted.right + dx - width
  if (fitted.top < 0) dy = -fitted.top
  if (fitted.bottom + dy > height) dy -= fitted.bottom + dy - height
  return { ...next, x: next.x + dx, y: next.y + dy }
}

function scaleSlots(slots: EditorSlot[], fromWidth: number, fromHeight: number, toWidth: number, toHeight: number): EditorSlot[] {
  const scaleX = toWidth / fromWidth
  const scaleY = toHeight / fromHeight
  return slots.map((slot) => ({
    ...fitSlot({ ...slot, x: slot.x * scaleX, y: slot.y * scaleY, w: slot.w * scaleX, h: slot.h * scaleY, rotation: slot.rotation ?? 0 }, toWidth, toHeight),
    id: slot.id,
    rotation: slot.rotation ?? 0,
  }))
}

function previewDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.82)
}

function canvasPoint(event: Pick<PointerEvent<HTMLDivElement>, 'clientX' | 'clientY'>, element: HTMLDivElement, draft: Draft): CanvasPoint {
  const bounds = element.getBoundingClientRect()
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * draft.width,
    y: ((event.clientY - bounds.top) / bounds.height) * draft.height,
  }
}

function slotFromDrag(start: CanvasPoint, current: CanvasPoint, draft: Draft): FrameSlot {
  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  return fitSlot({ x, y, w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y), rotation: 0 }, draft.width, draft.height)
}

function localPointer(point: CanvasPoint, slot: EditorSlot): CanvasPoint {
  const center = slotCenter(slot)
  return rotatePoint({ x: point.x - center.x, y: point.y - center.y }, -(slot.rotation ?? 0))
}

function resizeSlot(interaction: Extract<Interaction, { type: 'resize' }>, pointer: CanvasPoint, width: number, height: number): FrameSlot {
  const { slot, corner } = interaction
  const local = localPointer(pointer, slot)
  const oppositeByCorner: Record<ResizeCorner, CanvasPoint> = {
    nw: { x: slot.w / 2, y: slot.h / 2 },
    ne: { x: -slot.w / 2, y: slot.h / 2 },
    sw: { x: slot.w / 2, y: -slot.h / 2 },
    se: { x: -slot.w / 2, y: -slot.h / 2 },
  }
  const opposite = oppositeByCorner[corner]
  const nextW = Math.max(MIN_SLOT, Math.abs(local.x - opposite.x))
  const nextH = Math.max(MIN_SLOT, Math.abs(local.y - opposite.y))
  const centerLocal = { x: (local.x + opposite.x) / 2, y: (local.y + opposite.y) / 2 }
  const oldCenter = slotCenter(slot)
  const nextCenterOffset = rotatePoint(centerLocal, slot.rotation ?? 0)
  return fitSlot({
    ...slot,
    x: oldCenter.x + nextCenterOffset.x - nextW / 2,
    y: oldCenter.y + nextCenterOffset.y - nextH / 2,
    w: nextW,
    h: nextH,
  }, width, height)
}

function pointerAngle(point: CanvasPoint, center: CanvasPoint): number {
  return Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI
}

export default function FrameSlotEditor() {
  const [draft, setDraft] = useState<Draft>(makeDraft)
  const [asset, setAsset] = useState<Blob | null>(null)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [artPreview, setArtPreview] = useState<string | null>(null)
  const [saved, setSaved] = useState<FrameManifest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [interaction, setInteraction] = useState<Interaction>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void fetchFrames()
      .then((frames) => active && setSaved(frames))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!assetUrl) return
    return () => URL.revokeObjectURL(assetUrl)
  }, [assetUrl])

  const selected = draft.slots.find((slot) => slot.id === selectedId) ?? null
  const selectedIndex = selected ? draft.slots.findIndex((slot) => slot.id === selected.id) : -1
  const stageRatio = draft.width / draft.height
  const samplePhoto = useMemo(() => '/frames/blueframe.svg', [])
  const drawingRect = interaction?.type === 'draw' ? slotFromDrag(interaction.start, interaction.current, draft) : null

  const updateSlot = (id: string, updater: (slot: EditorSlot) => EditorSlot) => {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.id === id ? updater(slot) : slot),
    }))
  }

  const onAssetChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      setError('Choose a PNG, JPEG, or SVG artwork file.')
      return
    }
    setError(null)
    setAsset(file)
    setAssetUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return URL.createObjectURL(file)
    })
    if (!draft.name) {
      const base = file.name.replace(/\.[^.]+$/, '')
      setDraft((current) => ({ ...current, name: base, id: slugify(base) }))
    }
    const imgUrl = URL.createObjectURL(file)
    try {
      const img = await loadImage(imgUrl)
      if (img.naturalWidth && img.naturalHeight) {
        const nextWidth = Math.min(MAX_OUTPUT, Math.max(64, img.naturalWidth))
        const nextHeight = Math.min(MAX_OUTPUT, Math.max(64, img.naturalHeight))
        setDraft((current) => ({
          ...current,
          width: nextWidth,
          height: nextHeight,
          slots: current.slots.length > 0 ? scaleSlots(current.slots, current.width, current.height, nextWidth, nextHeight) : current.slots,
        }))
        const canvas = rasterizeImageAtSize(img, 960, Math.max(1, Math.round(960 * nextHeight / nextWidth)), file.type === 'image/svg+xml' ? 'crisp' : 'photo')
        setArtPreview(previewDataUrl(canvas))
      }
    } catch {
      setError('Artwork preview could not be decoded.')
    } finally {
      URL.revokeObjectURL(imgUrl)
    }
  }

  const startDrawing = (event: PointerEvent<HTMLDivElement>) => {
    if (!stageRef.current || event.target !== event.currentTarget) return
    const point = canvasPoint(event, stageRef.current, draft)
    setSelectedId(null)
    setInteraction({ type: 'draw', start: point, current: point })
    stageRef.current.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startMove = (event: PointerEvent<HTMLDivElement>, slot: EditorSlot) => {
    event.stopPropagation()
    if (!stageRef.current) return
    const point = canvasPoint(event, stageRef.current, draft)
    setSelectedId(slot.id)
    setInteraction({ type: 'move', id: slot.id, offset: { x: point.x - slot.x, y: point.y - slot.y } })
    stageRef.current.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startResize = (event: PointerEvent<HTMLButtonElement>, slot: EditorSlot, corner: ResizeCorner) => {
    event.stopPropagation()
    if (!stageRef.current) return
    setSelectedId(slot.id)
    setInteraction({ type: 'resize', id: slot.id, corner, start: canvasPoint(event, stageRef.current, draft), slot: { ...slot } })
    stageRef.current.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startRotate = (event: PointerEvent<HTMLButtonElement>, slot: EditorSlot) => {
    event.stopPropagation()
    if (!stageRef.current) return
    const center = slotCenter(slot)
    const point = canvasPoint(event, stageRef.current, draft)
    setSelectedId(slot.id)
    setInteraction({ type: 'rotate', id: slot.id, center, startAngle: pointerAngle(point, center), startRotation: slot.rotation ?? 0 })
    stageRef.current.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updatePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!stageRef.current || !interaction) return
    const point = canvasPoint(event, stageRef.current, draft)
    if (point.x < -draft.width || point.x > draft.width * 2 || point.y < -draft.height || point.y > draft.height * 2) return
    if (interaction.type === 'draw') {
      setInteraction({ ...interaction, current: point })
      return
    }
    if (interaction.type === 'move') {
      updateSlot(interaction.id, (slot) => ({ ...slot, ...fitSlot({ ...slot, x: point.x - interaction.offset.x, y: point.y - interaction.offset.y }, draft.width, draft.height) }))
      return
    }
    if (interaction.type === 'resize') {
      updateSlot(interaction.id, (slot) => ({ ...slot, ...resizeSlot(interaction, point, draft.width, draft.height) }))
      return
    }
    if (interaction.type !== 'rotate') return
    const angle = pointerAngle(point, interaction.center) - interaction.startAngle
    updateSlot(interaction.id, (slot) => ({ ...slot, rotation: normalizeRotation(interaction.startRotation + angle) }))
  }

  const stopPointer = () => {
    if (interaction?.type === 'draw') {
      const width = Math.abs(interaction.current.x - interaction.start.x)
      const height = Math.abs(interaction.current.y - interaction.start.y)
      const rect = slotFromDrag(interaction.start, interaction.current, draft)
      const nextRect = width < MIN_SLOT || height < MIN_SLOT
        ? fitSlot({ x: interaction.start.x - DEFAULT_SLOT.width / 2, y: interaction.start.y - DEFAULT_SLOT.height / 2, w: DEFAULT_SLOT.width, h: DEFAULT_SLOT.height, rotation: 0 }, draft.width, draft.height)
        : rect
      const id = `slot-${Date.now()}-${draft.slots.length}`
      setDraft((current) => ({ ...current, slots: [...current.slots, { ...nextRect, id, rotation: 0 }] }))
      setSelectedId(id)
    }
    setInteraction(null)
  }

  const updateOutputDimension = (key: 'width' | 'height', value: string) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return
    const nextValue = Math.min(MAX_OUTPUT, Math.max(64, Math.round(numeric)))
    setDraft((current) => {
      const nextWidth = key === 'width' ? nextValue : current.width
      const nextHeight = key === 'height' ? nextValue : current.height
      return { ...current, width: nextWidth, height: nextHeight, slots: scaleSlots(current.slots, current.width, current.height, nextWidth, nextHeight) }
    })
  }

  const updateSelected = (key: keyof FrameSlot, value: string) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || !selectedId) return
    updateSlot(selectedId, (slot) => ({ ...slot, ...fitSlot({ ...slot, [key]: key === 'rotation' ? normalizeRotation(numeric) : numeric }, draft.width, draft.height) }))
  }

  const removeSelected = () => {
    if (!selectedId) return
    setDraft((current) => ({ ...current, slots: current.slots.filter((slot) => slot.id !== selectedId) }))
    setSelectedId(null)
  }

  const duplicateSelected = () => {
    if (!selected) return
    const copy = fitSlot({ ...selected, x: selected.x + 32, y: selected.y + 32 }, draft.width, draft.height)
    const id = `slot-${Date.now()}-${draft.slots.length}`
    setDraft((current) => ({ ...current, slots: [...current.slots, { ...copy, id, rotation: selected.rotation ?? 0 }] }))
    setSelectedId(id)
  }

  const nudgeSelected = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!selectedId || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace', 'Escape'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'Delete' || event.key === 'Backspace') {
      removeSelected()
      return
    }
    if (event.key === 'Escape') {
      setInteraction(null)
      return
    }
    const amount = event.shiftKey ? 10 : 1
    const delta = event.key === 'ArrowUp' ? { x: 0, y: -amount } : event.key === 'ArrowDown' ? { x: 0, y: amount } : event.key === 'ArrowLeft' ? { x: -amount, y: 0 } : { x: amount, y: 0 }
    updateSlot(selectedId, (slot) => ({ ...slot, ...fitSlot({ ...slot, x: slot.x + delta.x, y: slot.y + delta.y }, draft.width, draft.height) }))
  }

  const save = async () => {
    setError(null)
    setMessage(null)
    if (!asset) return setError('Upload artwork before saving.')
    const id = slugify(draft.id || draft.name)
    if (!id || !draft.name.trim()) return setError('Name and id are required.')
    if (draft.slots.length === 0) return setError('Draw at least one photo slot before saving.')
    setBusy(true)
    try {
      const manifest = {
        id,
        version: 1,
        name: draft.name.trim(),
        kind: 'custom' as const,
        output: { width: draft.width, height: draft.height, mimeType: 'image/jpeg' as const },
        layout: { mode: 'custom' as const, crop: 'cover' as const },
        slots: draft.slots.map(({ id: _id, ...slot }) => ({ ...slot, rotation: normalizeRotation(slot.rotation) })),
      }
      const created = await createFrame(asset, manifest)
      setSaved((current) => [created, ...current.filter((frame) => frame.id !== created.id)])
      refreshFrameCatalog()
      setDraft(makeDraft())
      setAsset(null)
      setAssetUrl(null)
      setArtPreview(null)
      setSelectedId(null)
      setMessage(`Saved ${created.name} with ${created.slots.length} photo slots.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save frame.')
    } finally {
      setBusy(false)
    }
  }

  const archive = async (frame: FrameManifest) => {
    if (!window.confirm(`Archive ${frame.name}? It will disappear from the public picker.`)) return
    setError(null)
    try {
      await deleteFrame(frame.id)
      setSaved((current) => current.filter((item) => item.id !== frame.id))
      refreshFrameCatalog()
      setMessage(`Archived ${frame.name}.`)
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Could not archive frame.')
    }
  }

  return (
    <main className="page frame-library-page">
      <div className="pixel-grid-bg" aria-hidden />
      <header className="frame-library-head">
        <div>
          <p className="pixel-kicker">DEVELOPER / FRAME LIBRARY</p>
          <h1 className="pixel-title">draw a frame</h1>
          <p className="frame-library-sub">Upload artwork, drag on the canvas to draw any number of photo windows, then publish the frame.</p>
        </div>
        <Link href="/develop" className="pixel-btn pixel-btn--ghost">← DEVELOP</Link>
      </header>

      <section className="frame-editor-workspace">
        <div className="frame-editor-main">
          <div className="frame-editor-toolbar">
            <label className="frame-file-input">
              <span className="pixel-kicker">ARTWORK</span>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onAssetChange} />
            </label>
            <span className="pixel-badge">{draft.slots.length} SLOT{draft.slots.length === 1 ? '' : 'S'}</span>
            <span className="frame-editor-toolbar-hint">DRAG TO DRAW · CLICK SLOT TO EDIT</span>
          </div>
          <div
            ref={stageRef}
            className="frame-editor-stage"
            style={{ aspectRatio: stageRatio }}
            tabIndex={0}
            onPointerDown={startDrawing}
            onPointerMove={updatePointer}
            onPointerUp={stopPointer}
            onPointerCancel={stopPointer}
            onPointerLeave={(event) => { if (interaction?.type === 'draw') updatePointer(event) }}
            onKeyDown={nudgeSelected}
          >
            {assetUrl ? <img src={assetUrl} alt="Uploaded artwork" className="frame-editor-art" /> : <div className="frame-editor-empty">UPLOAD ARTWORK<br /><small>PNG / JPEG / SVG</small></div>}
            {draft.slots.map((slot, index) => {
              const selectedSlot = selectedId === slot.id
              const displayRotation = slot.rotation ?? 0
              return (
                <div
                  key={slot.id}
                  className={`frame-slot ${selectedSlot ? 'is-selected' : ''}`}
                  style={{ left: `${slot.x / draft.width * 100}%`, top: `${slot.y / draft.height * 100}%`, width: `${slot.w / draft.width * 100}%`, height: `${slot.h / draft.height * 100}%`, transform: `rotate(${displayRotation}deg)` }}
                  tabIndex={0}
                  onFocus={() => setSelectedId(slot.id)}
                  onPointerDown={(event) => startMove(event, slot)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {selectedSlot && <>
                    {(['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => <button key={corner} type="button" aria-label={`Resize slot ${index + 1} ${corner}`} className={`frame-slot-handle frame-slot-handle--${corner}`} onPointerDown={(event) => startResize(event, slot, corner)} />)}
                    <button type="button" aria-label={`Rotate slot ${index + 1}`} className="frame-slot-rotate" onPointerDown={(event) => startRotate(event, slot)} />
                  </>}
                </div>
              )
            })}
            {drawingRect && <div className="frame-slot frame-slot--drawing" style={{ left: `${drawingRect.x / draft.width * 100}%`, top: `${drawingRect.y / draft.height * 100}%`, width: `${drawingRect.w / draft.width * 100}%`, height: `${drawingRect.h / draft.height * 100}%` }} />}
          </div>
          <p className="frame-editor-hint">Drag on empty canvas to draw a slot. Drag a slot to move it, use corner handles to resize, and use the top handle to rotate. Shift + arrow nudges the selected slot faster.</p>
        </div>

        <aside className="frame-editor-inspector">
          <section className="frame-inspector-section">
            <div className="frame-inspector-title-row"><p className="pixel-kicker">FRAME</p><span className="pixel-badge">CUSTOM</span></div>
            <label>Frame name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value, id: current.id || slugify(event.target.value) }))} placeholder="Summer pop" /></label>
            <label>Frame id<input value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: slugify(event.target.value) }))} placeholder="summer-pop" /></label>
            <div className="frame-inspector-grid">
              <label>Width<input type="number" min={64} max={MAX_OUTPUT} value={draft.width} onChange={(event) => updateOutputDimension('width', event.target.value)} /></label>
              <label>Height<input type="number" min={64} max={MAX_OUTPUT} value={draft.height} onChange={(event) => updateOutputDimension('height', event.target.value)} /></label>
            </div>
          </section>

          <section className="frame-inspector-section frame-slot-list-section">
            <div className="frame-inspector-title-row"><p className="pixel-kicker">PHOTO SLOTS</p><span className="pixel-badge">{draft.slots.length}</span></div>
            {draft.slots.length === 0 ? <p className="frame-inspector-empty">No slots yet. Drag on the artwork to create the first photo window.</p> : <ul className="frame-slot-list">{draft.slots.map((slot, index) => <li key={slot.id}><button type="button" className={`frame-slot-list-item ${selectedId === slot.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(slot.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{Math.round(slot.w)} × {Math.round(slot.h)}</strong><small>{Math.round(slot.rotation ?? 0)}°</small></button></li>)}</ul>}
          </section>

          <section className="frame-inspector-section">
            <div className="frame-inspector-title-row"><p className="pixel-kicker">SELECTED SLOT</p>{selected && <div className="frame-inspector-actions"><button type="button" className="frame-text-button" onClick={duplicateSelected}>DUPLICATE</button><button type="button" className="frame-text-button frame-text-button--danger" onClick={removeSelected}>REMOVE</button></div>}</div>
            {selected ? <>
              <div className="frame-slot-badge">SLOT {String(selectedIndex + 1).padStart(2, '0')}</div>
              <div className="frame-inspector-grid frame-inspector-grid--four">
                {(['x', 'y', 'w', 'h', 'rotation'] as const).map((key) => <label key={key}>{key === 'rotation' ? 'ROT' : key.toUpperCase()}<input type="number" value={Math.round(selected[key] ?? 0)} onChange={(event) => updateSelected(key, event.target.value)} /></label>)}
              </div>
            </> : <p className="frame-inspector-empty">Select a slot to edit its coordinates and rotation.</p>}
          </section>

          <section className="frame-inspector-section frame-preview-section">
            <div className="frame-inspector-title-row"><p className="pixel-kicker">COMPOSITION PREVIEW</p><span className="pixel-badge">{draft.slots.length} PHOTO{draft.slots.length === 1 ? '' : 'S'}</span></div>
            <div className="frame-composition-preview" style={{ aspectRatio: stageRatio }}>
              <Image src={samplePhoto} alt="Sample photo" fill sizes="320px" unoptimized className="frame-preview-photo" />
              {artPreview && <img src={artPreview} alt="Artwork preview" className="frame-preview-art" />}
              {draft.slots.map((slot) => <span key={slot.id} className="frame-preview-slot" style={{ left: `${slot.x / draft.width * 100}%`, top: `${slot.y / draft.height * 100}%`, width: `${slot.w / draft.width * 100}%`, height: `${slot.h / draft.height * 100}%`, transform: `rotate(${slot.rotation ?? 0}deg)` }} />)}
            </div>
          </section>

          <button type="button" className="pixel-btn frame-save-button" onClick={save} disabled={busy}>{busy ? 'SAVING…' : 'SAVE TO LIBRARY'}</button>
          {message && <p className="frame-message frame-message--ok">{message}</p>}
          {error && <p className="frame-message frame-message--error">{error}</p>}
        </aside>
      </section>

      <section className="frame-saved-section">
        <div className="frame-saved-head"><div><p className="pixel-kicker">PERSISTED FRAMES</p><h2>library</h2></div><span className="pixel-badge">{saved.length} ACTIVE</span></div>
        {saved.length === 0 ? <p className="frame-inspector-empty">No custom frames yet. Your saved artwork will appear here.</p> : <ul className="frame-saved-grid">{saved.map((frame) => <li key={frame.id} className="frame-saved-item"><div className="frame-saved-thumb"><Image src={frame.thumbnailSrc} alt="" fill sizes="180px" unoptimized /></div><div className="frame-saved-meta"><strong>{frame.name}</strong><span>{frame.slots.length} PHOTO{frame.slots.length === 1 ? '' : 'S'} · v{frame.version}</span><button type="button" className="frame-text-button frame-text-button--danger" onClick={() => archive(frame)}>ARCHIVE</button></div></li>)}</ul>}
      </section>
    </main>
  )
}
