'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useStickerEditor } from '../features/editor/useStickerEditor'
import { filterCss, PHOTO_FILTERS } from '../lib/editor/filters'
import { stickerById } from '../lib/editor/mockStickers'

export default function StickerEditor() {
  const params = useParams<{ token: string }>()
  const token = params?.token ?? ''
  const editor = useStickerEditor(token)
  const photoFilter = filterCss(editor.filter)

  if (editor.loading) {
    return (
      <main className="editor-pixel editor-pixel--loading">
        <div className="pixel-grid-bg" aria-hidden />
        <p className="editor-pixel__loading">LOADING PHOTO...</p>
      </main>
    )
  }

  if (editor.error && !editor.photoSrc) {
    return (
      <main className="editor-pixel editor-pixel--loading">
        <div className="pixel-grid-bg" aria-hidden />
        <p className="error">{editor.error}</p>
        <Link className="pixel-btn" href="/">
          HOME
        </Link>
      </main>
    )
  }

  return (
    <main className="editor-pixel">
      <div className="pixel-grid-bg" aria-hidden />

      <header className="editor-pixel__head">
        <Link className="pixel-btn pixel-btn--ghost" href={`/p/${token}`}>
          ← BACK
        </Link>
        <div className="editor-pixel__title-wrap">
          <p className="pixel-kicker">RBS EDIT / CREATIVE PASS</p>
          <h1 className="pixel-title">shape the signal</h1>
        </div>
        <button
          type="button"
          className="pixel-btn"
          onClick={() => void editor.save()}
          disabled={editor.saving || !editor.hasChanges}
        >
          {editor.saving ? 'SAVING' : editor.saved ? 'SAVED' : 'SAVE'}
        </button>
      </header>

      <div className="editor-pixel__body">
        <div className="editor-pixel__canvas-col">
          <div
            ref={editor.stageRef}
            className="editor-pixel__stage"
            onPointerDown={editor.onStagePointerDown}
            onPointerMove={editor.onPointerMove}
            onPointerUp={editor.onPointerUp}
            onPointerCancel={editor.onPointerUp}
          >
            {editor.photoSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={editor.photoSrc}
                alt="Your photobooth photo"
                className="editor-pixel__photo"
                style={{ filter: photoFilter }}
              />
            )}

            {editor.stickers.map((placement) => {
              const def = stickerById(placement.stickerId)
              if (!def) return null
              const selected = placement.id === editor.selectedId
              return (
                <button
                  key={placement.id}
                  type="button"
                  className={`editor-sticker ${selected ? 'is-selected' : ''}`}
                  style={{
                    left: `${placement.x * 100}%`,
                    top: `${placement.y * 100}%`,
                    zIndex: placement.zIndex,
                    width: `${def.baseSize * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${placement.rotation}deg) scale(${placement.scale})`,
                  }}
                  onPointerDown={(event) => editor.onStickerPointerDown(placement.id, event)}
                  onTouchMove={(event) => editor.onStickerTouchPinch(placement.id, event)}
                  aria-label={`${def.label} sticker`}
                  aria-pressed={selected}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={def.src} alt="" draggable={false} className="editor-sticker__img" />
                </button>
              )
            })}
          </div>

          {editor.selected && (
            <div className="editor-quick-bar" aria-label="Selected sticker controls">
              <span className="editor-quick-bar__label">{stickerById(editor.selected.stickerId)?.label}</span>
              <label className="editor-quick-bar__slider">
                <span>SIZE</span>
                <input
                  type="range"
                  min={0.35}
                  max={3}
                  step={0.05}
                  value={editor.selected.scale}
                  onChange={(e) => editor.updateSelected({ scale: Number(e.target.value) })}
                />
              </label>
              <label className="editor-quick-bar__slider">
                <span>TURN</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={editor.selected.rotation}
                  onChange={(e) => editor.updateSelected({ rotation: Number(e.target.value) })}
                />
              </label>
              <button type="button" className="pixel-btn pixel-btn--ghost editor-quick-bar__delete" onClick={editor.deleteSelected}>
                DELETE
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="editor-pixel__dock">
        <div className="editor-pixel__toolbar">
          <div className="pixel-tabs editor-pixel__tabs" role="tablist" aria-label="Edit tools">
            <button
              type="button"
              role="tab"
              aria-selected={editor.panel === 'stickers'}
              className={`pixel-tab ${editor.panel === 'stickers' ? 'is-active' : ''}`}
              onClick={() => editor.setPanel('stickers')}
            >
              STICKERS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editor.panel === 'filters'}
              className={`pixel-tab ${editor.panel === 'filters' ? 'is-active' : ''}`}
              onClick={() => editor.setPanel('filters')}
            >
              FILTERS
            </button>
          </div>
          <div className="editor-pixel__toolbar-actions">
            <button type="button" className="pixel-btn pixel-btn--ghost" onClick={editor.undo} disabled={!editor.canUndo}>
              UNDO
            </button>
            <button type="button" className="pixel-btn pixel-btn--ghost" onClick={editor.reset} disabled={!editor.hasChanges}>
              RESET
            </button>
          </div>
        </div>

        {editor.panel === 'stickers' ? (
          <div className="editor-tray" role="list" aria-label="Sticker pack">
            {editor.catalog.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className="editor-tray__item"
                onClick={() => editor.addSticker(item.id)}
                aria-label={`Add ${item.label}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt="" className="editor-tray__img" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="editor-filters" role="list" aria-label="Photo filters">
            {PHOTO_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={`editor-filter-chip ${editor.filter === item.id ? 'is-active' : ''}`}
                onClick={() => editor.setFilter(item.id)}
                aria-pressed={editor.filter === item.id}
              >
                <span
                  className="editor-filter-chip__preview"
                  style={{ backgroundImage: editor.photoSrc ? `url(${editor.photoSrc})` : undefined, filter: item.css }}
                  aria-hidden
                />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        <p className="editor-pixel__hint">
          {editor.panel === 'stickers'
            ? 'Tap a sticker, drag to move, pinch or sliders to resize'
            : 'Pick a look, then save when you are happy'}
        </p>

        {editor.error && <p className="error">{editor.error}</p>}
        {editor.saved && (
          <p className="editor-pixel__saved">
            Saved! <Link href={`/p/${token}`}>View and download →</Link>
          </p>
        )}
      </footer>
    </main>
  )
}
