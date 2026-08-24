# Design System — Spark Pixel Booth

<!-- impeccable:design-schema 1 -->

Retro event photobooth with **Spark Pixel** — charcoal ground, orange spark accent, 8-bit typography and stepped UI. Feels like an arcade photo booth at a school festival, not a SaaS dashboard.

## Color strategy

**Committed accent** — `#ff6117` on `#252525`, light copy `#eaeaea`.

| Role | Hex | Usage |
|------|-----|--------|
| Spark | `#ff6117` | CTAs, active steps, progress, links |
| Charcoal | `#252525` | Page ground |
| Deep | `#1a1a1a` | Cards, panels |
| Ink | `#eaeaea` | Primary text |
| Surface | `#ffffff` | Frame thumbnail wells |
| Line | `#3a3a3a` | Pixel borders |

## Typography

- **Pixel display:** [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) — titles, badges, step labels (keep small: 0.45–0.95rem).
- **Mono UI:** [VT323](https://fonts.google.com/specimen/VT323) — status lines, frame names, helper copy.
- **Body:** Manrope — only where longer prose is needed.

## Pixel language

- **No pill radius** on primary UI — use 2px borders + `box-shadow: Npx Npx 0 #000` stepped depth.
- **Thumbnails:** `image-rendering: pixelated` / `crisp-edges`.
- **Background:** 16px grid overlay at low opacity.
- **Booth stage:** subtle scanline overlay; HUD step strip (S → HOLD → POSE → GO).
- **Canvas overlay:** block progress bar + pixel countdown numeral in Press Start 2P.

## Flow

1. **`/`** — small pixel title `pick your frame`, grid of frames.
2. **`/booth/:id`** — capture with gesture S, phase HUD, optional strip progress.
3. **Result / download** — same pixel borders on preview + QR.

## Modes

| Surface | Mode |
|---------|------|
| `/` frame picker | Operate |
| `/booth/*` | Operate |

## Do / Don't

- Do keep titles **small** in pixel font — readability over shouty hero.
- Do expose capture phase in UI chrome, not only status strings.
- Don't use corner-pin UX (removed).
- Don't mix rounded SaaS cards with pixel chrome on the same surface.
