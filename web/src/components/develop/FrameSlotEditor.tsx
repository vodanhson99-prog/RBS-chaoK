'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createFrame, deleteFrame, fetchFrames, type FrameManifest, type FrameSlot } from '../../lib/api'
import { loadImage, rasterizeImageAtSize } from '../../lib/overlay'
import type { TemplateKind } from '../../lib/templates'

const DEFAULT_OUTPUT = { width: 2560, height: 1440 }
const MIN_SLOT = 48

type EditorSlot = FrameSlot & { id: string }

type Draft = {
  id: string
  name: string
  kind: TemplateKind
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
    kind: 'strip6',
    width: DEFAULT_OUTPUT.width,
    height: DEFAULT_OUTPUT.height,
    slots: [],
  }
}

function rectFromPointer(event: Pick<PointerEvent<HTMLDivElement>, 'clientX' | 'clientY'>, element: HTMLDivElement, draft: Draft): FrameSlot {
  const bounds = element.getBoundingClientRect()
  const x = ((event.clientX - bounds.left) / bounds.width) * draft.width
  const y = ((event.clientY - bounds.top) / bounds.height) * draft.height
  return { x: Math.max(0, x), y: Math.max(0, y), w: 320, h: 320 }
}

function clampSlot(slot: FrameSlot, width: number, height: number): FrameSlot {
  const w = Math.max(MIN_SLOT, Math.min(slot.w, width))
  const h = Math.max(MIN_SLOT, Math.min(slot.h, height))
  return {
    x: Math.max(0, Math.min(slot.x, width - w)),
    y: Math.max(0, Math.min(slot.y, height - h)),
    w,
    h,
  }
}

function previewDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.82)
}

export default function FrameSlotEditor() {
  const [draft, setDraft] = useState<Draft>(makeDraft)
  const [asset, setAsset] = useState<Blob | null>(null)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [artPreview, setArtPreview] = useState<string | null>(null)
  const [saved, setSaved] = useState<FrameManifest[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startY: number; slot: EditorSlot } | null>(null)
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
  const samplePhoto = useMemo(() => {
    if (draft.kind === 'single') return '/frames/blueframe.svg'
    return '/frames/woozi-strip.svg'
  }, [draft.kind])

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
    try {
      const imgUrl = URL.createObjectURL(file)
      const img = await loadImage(imgUrl)
      URL.revokeObjectURL(imgUrl)
      if (img.naturalWidth && img.naturalHeight) {
        setDraft((current) => ({ ...current, width: current.width || img.naturalWidth, height: current.height || img.naturalHeight }))
      }
      const canvas = rasterizeImageAtSize(img, 960, Math.round(960 / stageRatio), file.type === 'image/svg+xml' ? 'crisp' : 'photo')
      setArtPreview(previewDataUrl(canvas))
    } catch {
      setError('Artwork preview could not be decoded.')
    }
  }

  const addSlot = (event: Pick<PointerEvent<HTMLDivElement>, 'clientX' | 'clientY'>) => {
    if (!stageRef.current || (draft.kind === 'single' && draft.slots.length >= 1)) return
    const rect = clampSlot(rectFromPointer(event, stageRef.current, draft), draft.width, draft.height)
    const id = `slot-${Date.now()}`
    setDraft((current) => ({ ...current, slots: [...current.slots, { ...rect, id }] }))
    setSelectedId(id)
  }

  const startDrag = (event: PointerEvent<HTMLDivElement>, slot: EditorSlot) => {
    event.stopPropagation()
    if (!stageRef.current) return
    const bounds = stageRef.current.getBoundingClientRect()
    setSelectedId(slot.id)
    setDrag({
      id: slot.id,
      offsetX: ((event.clientX - bounds.left) / bounds.width) * draft.width - slot.x,
      offsetY: ((event.clientY - bounds.top) / bounds.height) * draft.height - slot.y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startResize = (event: React.PointerEvent<HTMLButtonElement>, slot: EditorSlot) => {
    event.stopPropagation()
    setSelectedId(slot.id)
    setResizing({ id: slot.id, startX: event.clientX, startY: event.clientY, slot: { ...slot } })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updatePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!stageRef.current) return
    const bounds = stageRef.current.getBoundingClientRect()
    const scaleX = draft.width / bounds.width
    const scaleY = draft.height / bounds.height
    if (drag) {
      const x = (event.clientX - bounds.left) * scaleX - drag.offsetX
      const y = (event.clientY - bounds.top) * scaleY - drag.offsetY
      setDraft((current) => ({
        ...current,
        slots: current.slots.map((slot) => slot.id === drag.id ? { ...slot, ...clampSlot({ ...slot, x, y }, current.width, current.height) } : slot),
      }))
    }
    if (resizing) {
      const slot = resizing.slot
      const w = slot.w + (event.clientX - resizing.startX) * scaleX
      const h = slot.h + (event.clientY - resizing.startY) * scaleY
      setDraft((current) => ({
        ...current,
        slots: current.slots.map((item) => item.id === resizing.id ? { ...item, ...clampSlot({ ...item, w, h }, current.width, current.height) } : item),
      }))
    }
  }

  const stopPointer = () => {
    setDrag(null)
    setResizing(null)
  }

  const updateSelected = (key: keyof FrameSlot, value: string) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.id === selectedId ? { ...slot, ...clampSlot({ ...slot, [key]: numeric }, current.width, current.height) } : slot),
    }))
  }

  const removeSelected = () => {
    if (!selectedId) return
    setDraft((current) => ({ ...current, slots: current.slots.filter((slot) => slot.id !== selectedId) }))
    setSelectedId(null)
  }

  const save = async () => {
    setError(null)
    setMessage(null)
    if (!asset) return setError('Upload artwork before saving.')
    const id = slugify(draft.id || draft.name)
    if (!id || !draft.name.trim()) return setError('Name and id are required.')
    if (draft.kind === 'strip6' && draft.slots.length === 0) return setError('Draw at least one photo slot for a strip.')
    setBusy(true)
    try {
      const manifest = {
        id,
        version: 1,
        name: draft.name.trim(),
        kind: draft.kind,
        output: { width: draft.width, height: draft.height, mimeType: 'image/jpeg' as const },
        layout: { mode: draft.kind === 'strip6' ? 'strip' as const : 'single' as const, crop: 'cover' as const },
        slots: draft.slots.map(({ id: _id, ...slot }) => slot),
      }
      const created = await createFrame(asset, manifest)
      setSaved((current) => [created, ...current.filter((frame) => frame.id !== created.id)])
      setDraft((current) => ({ ...current, id: '', name: '', slots: [] }))
      setAsset(null)
      setAssetUrl(null)
      setArtPreview(null)
      setSelectedId(null)
      setMessage(`Saved ${created.name} to the library.`)
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
          <p className="frame-library-sub">Upload artwork, mark the photo windows, then publish it to the public picker.</p>
        </div>
        <Link href="/" className="pixel-btn pixel-btn--ghost">← PICKER</Link>
      </header>

      <section className="frame-editor-workspace">
        <div className="frame-editor-main">
          <div className="frame-editor-toolbar">
            <label className="frame-file-input">
              <span className="pixel-kicker">ARTWORK</span>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onAssetChange} />
            </label>
            <button type="button" className="pixel-btn" onClick={() => {
                if (!stageRef.current) return
                const bounds = stageRef.current.getBoundingClientRect()
                addSlot({
                  clientX: bounds.left + bounds.width * 0.5,
                  clientY: bounds.top + bounds.height * 0.5,
                })
              }} disabled={!asset || (draft.kind === 'single' && draft.slots.length >= 1)}>
              + DRAW SLOT
            </button>
            <span className="pixel-badge">{draft.slots.length} SLOT{draft.slots.length === 1 ? '' : 'S'}</span>
          </div>
          <div
            ref={stageRef}
            className="frame-editor-stage"
            style={{ aspectRatio: stageRatio }}
            onPointerDown={addSlot}
            onPointerMove={updatePointer}
            onPointerUp={stopPointer}
            onPointerLeave={stopPointer}
          >
            {assetUrl ? <img src={assetUrl} alt="Uploaded artwork" className="frame-editor-art" /> : <div className="frame-editor-empty">UPLOAD ARTWORK<br /><small>PNG / JPEG / SVG</small></div>}
            {draft.slots.map((slot, index) => (
              <div
                key={slot.id}
                className={`frame-slot ${selectedId === slot.id ? 'is-selected' : ''}`}
                style={{ left: `${(slot.x / draft.width) * 100}%`, top: `${(slot.y / draft.height) * 100}%`, width: `${(slot.w / draft.width) * 100}%`, height: `${(slot.h / draft.height) * 100}%` }}
                onPointerDown={(event) => startDrag(event, slot)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {selectedId === slot.id && <button type="button" aria-label={`Resize slot ${index + 1}`} className="frame-slot-handle" onPointerDown={(event) => startResize(event, slot)} />}
              </div>
            ))}
          </div>
          <p className="frame-editor-hint">Click DRAW SLOT, then drag the window into place. Select a slot to resize it from the inspector.</p>
        </div>

        <aside className="frame-editor-inspector">
          <section className="frame-inspector-section">
            <p className="pixel-kicker">MANIFEST</p>
            <label>Frame name<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value, id: current.id || slugify(event.target.value) }))} placeholder="Summer pop" /></label>
            <label>Frame id<input value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: slugify(event.target.value) }))} placeholder="summer-pop" /></label>
            <div className="frame-inspector-grid">
              <label>Type<select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as TemplateKind, slots: event.target.value === 'single' ? current.slots.slice(0, 1) : current.slots }))}><option value="single">Single</option><option value="strip6">Strip ×6</option></select></label>
              <label>Width<input type="number" min={64} value={draft.width} onChange={(event) => setDraft((current) => ({ ...current, width: Number(event.target.value) || DEFAULT_OUTPUT.width }))} /></label>
              <label>Height<input type="number" min={64} value={draft.height} onChange={(event) => setDraft((current) => ({ ...current, height: Number(event.target.value) || DEFAULT_OUTPUT.height }))} /></label>
            </div>
          </section>

          <section className="frame-inspector-section">
            <div className="frame-inspector-title-row"><p className="pixel-kicker">SELECTED SLOT</p>{selected && <button type="button" className="frame-text-button" onClick={removeSelected}>REMOVE</button>}</div>
            {selected ? <>
              <div className="frame-slot-badge">SLOT {String(selectedIndex + 1).padStart(2, '0')}</div>
              <div className="frame-inspector-grid frame-inspector-grid--four">
                {(['x', 'y', 'w', 'h'] as const).map((key) => <label key={key}>{key.toUpperCase()}<input type="number" value={Math.round(selected[key])} onChange={(event) => updateSelected(key, event.target.value)} /></label>)}
              </div>
            </> : <p className="frame-inspector-empty">Select a window to edit its native coordinates.</p>}
          </section>

          <section className="frame-inspector-section frame-preview-section">
            <div className="frame-inspector-title-row"><p className="pixel-kicker">COMPOSITION PREVIEW</p><span className="pixel-badge">COVER</span></div>
            <div className="frame-composition-preview" style={{ aspectRatio: stageRatio }}>
              <Image src={samplePhoto} alt="" fill sizes="320px" unoptimized className="frame-preview-photo" />
              {artPreview && <img src={artPreview} alt="Artwork preview" className="frame-preview-art" />}
              {draft.slots.map((slot) => <span key={slot.id} className="frame-preview-slot" style={{ left: `${slot.x / draft.width * 100}%`, top: `${slot.y / draft.height * 100}%`, width: `${slot.w / draft.width * 100}%`, height: `${slot.h / draft.height * 100}%` }} />)}
            </div>
          </section>

          <button type="button" className="pixel-btn frame-save-button" onClick={save} disabled={busy}>{busy ? 'SAVING…' : 'SAVE TO LIBRARY'}</button>
          {message && <p className="frame-message frame-message--ok">{message}</p>}
          {error && <p className="frame-message frame-message--error">{error}</p>}
        </aside>
      </section>

      <section className="frame-saved-section">
        <div className="frame-saved-head"><div><p className="pixel-kicker">PERSISTED FRAMES</p><h2>library</h2></div><span className="pixel-badge">{saved.length} ACTIVE</span></div>
        {saved.length === 0 ? <p className="frame-inspector-empty">No custom frames yet. Your saved artwork will appear here.</p> : <ul className="frame-saved-grid">{saved.map((frame) => <li key={frame.id} className="frame-saved-item"><div className="frame-saved-thumb"><Image src={frame.thumbnailSrc} alt="" fill sizes="180px" unoptimized /></div><div className="frame-saved-meta"><strong>{frame.name}</strong><span>{frame.kind === 'strip6' ? 'STRIP ×6' : 'SINGLE'} · v{frame.version}</span><button type="button" className="frame-text-button frame-text-button--danger" onClick={() => archive(frame)}>ARCHIVE</button></div></li>)}</ul>}
      </section>
    </main>
  )
}
