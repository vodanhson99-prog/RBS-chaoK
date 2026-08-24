# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 App Router (frontend), Fastify (API), TypeScript, MediaPipe hand tracking in-browser, file-backed session storage. Monorepo scripts at repo root via `npm run dev`.

## Users

**Primary:** Event guests at a live photobooth — often teens and young adults at school/club events — who want a fast, fun photo without accounts or friction.

**Secondary:** Booth operator on a laptop/desktop with webcam; scans QR on phone to download or (later) edit/print.

**Situation:** Noisy, time-pressed, standing in line. One frame per session. Same Wi‑Fi for QR handoff to phone.

## Product Purpose

Let someone pick a frame, capture a single photo or 6-shot strip using fingertip corner-pinning, upload privately, and share via QR for download (and later mobile edit/print). Success = complete capture → QR → phone opens photo reliably during an event.

## Positioning

Gesture-first corner pin (MediaPipe index finger) + pre-selected frame library + instant QR handoff — built for one-off events, not SaaS event management or social galleries.

## Operating Context

- Runs in browser on booth machine (Chrome/Safari, webcam required).
- Phone must reach booth host on LAN for QR links when dev uses localhost.
- Frames live in `web/public/frames/`; 12 catalog entries (single + one strip mode).
- Photos stored on backend with TTL; not public indexed.

## Capabilities and Constraints

**In scope (now):** Frame catalog, one frame per session, single + strip6 capture, retake last, compose, upload, QR result, JPEG download.

**Planned:** Mobile sticker edit, paid print, longer private retention for post-event ops.

**Out of scope:** Accounts, social feed, public gallery, event admin, subscriptions.

**Terminology:** Frame = decorative overlay template; Session = one upload + token; Strip = 6 consecutive shots.

## Brand Commitments

- Product name in UI: **RBS Photobooth** (legacy copy may say RBS-PUBLIC PHOTOBOOTH).
- **Binding visual direction (user-confirmed):** young, energetic, high contrast; palette anchored on `#ff6117` (spark orange), `#252525` (charcoal ground), `#eaeaea` (light ink). Theme codename: **Spark Booth**.

## Evidence on Hand

- Real frame assets: `web/public/frames/` (PNG + SVG placeholders).
- Product scope doc: `PRODUCT_SCOPE.md`.
- No fabricated testimonials, pricing, or customer logos.

## Product Principles

1. **One frame, one flow** — choose before capture; no mid-session frame switching.
2. **Booth speed over settings** — large tap targets, minimal steps, status always visible outside the camera feed.
3. **Phone handoff must work** — QR and LAN reachability are first-class.
4. **Private by default** — no public discovery of guest photos.
5. **Event-realistic** — works under distraction, bad lighting, and impatient queues.

## Accessibility & Inclusion

- Touch-friendly controls on home and result/download surfaces.
- Camera overlay relies on color + numeric corner labels; booth operator instructions duplicated in UI chrome (not only on canvas).
- Contrast target: WCAG AA for text on `#252525` and orange CTAs.
