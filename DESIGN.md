---
name: PC Deck
description: The phone becomes a sober Stream Deck, with a matte black chassis, recessed LCD keys, and an LCD status strip.
colors:
  room: "#030304"
  chassis-hi: "#17181b"
  chassis: "#0e0f11"
  chassis-lo: "#08090a"
  cap-hi: "#222428"
  cap-lo: "#15161a"
  lcd: "#020203"
  print: "#9aa0a8"
  print-dim: "#878d96"
  text: "#f1f3f5"
  ok: "#34d17a"
  warn: "#f2b33d"
  err: "#ff4d4f"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(22px, 6.6vw, 28px)"
    fontWeight: 600
    lineHeight: 0.9
    fontFeature: "tnum"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(15px, 4.4vw, 18px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.22em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.02em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.3
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.14em"
  label-detail:
    fontFamily: "Barlow Condensed, Arial Narrow, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.04em"
    fontFeature: "tnum"
rounded:
  bar: "2px"
  strip: "clamp(12px, 3.6vw, 16px)"
  lcd: "15%"
  key: "20%"
  pill: "50%"
spacing:
  head-gap: "8px"
  gap: "clamp(9px, 2.8vw, 14px)"
  pad: "clamp(14px, 4.5vw, 22px)"
  key-inset: "7%"
  touch: "44px"
components:
  key:
    backgroundColor: "{colors.cap-hi}"
    rounded: "{rounded.key}"
    padding: "{spacing.key-inset}"
    size: "min(fit, 170px)"
  key-lcd:
    backgroundColor: "{colors.lcd}"
    rounded: "{rounded.lcd}"
  status-strip:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.text}"
    rounded: "{rounded.strip}"
    height: "80px"
  status-strip-compact:
    backgroundColor: "{colors.lcd}"
    rounded: "{rounded.strip}"
    height: "54px"
  strip-message:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    padding: "10px 16px"
  power-indicator:
    textColor: "{colors.print-dim}"
    typography: "{typography.label}"
    padding: "0 10px"
    height: "44px"
  chassis-icon-button:
    textColor: "{colors.print-dim}"
    size: "44px"
  page-dot-active:
    backgroundColor: "{colors.print}"
    size: "6px"
  unpaired-panel:
    backgroundColor: "{colors.lcd}"
    textColor: "{colors.print}"
    rounded: "{rounded.strip}"
    padding: "16px"
---

# Design System: PC Deck

## Overview

**Creative North Star: "The Sober Deck"**

The phone is not showing an app about a Stream Deck. It is the device: a matte black chassis edge to edge, a recessed LCD strip, and a matrix of graphite keycaps with black glass screens set into them. The reference is pinned by the user: an Elgato Stream Deck MK.2 with no RGB, plus the Stream Deck+ status strip. Every surface is either chassis, keycap, or screen, and each one is lit and shaded as that material would be.

Density is glance-first. One block (silkscreen row, status strip, key matrix) is centered in the viewport and sized so the keys are the largest squares that fit. Nothing scrolls. Colour comes only from the real app icons on the key LCDs and from the three state lights. The chassis printing (wordmark, ONLINE, CPU / RAM / GPU) is set in condensed caps in a muted grey, the way paint on plastic looks.

Motion is hardware motion. A key sinks 3px when touched, the action fires on release, and the PC's answer flashes inside that key's own LCD. Messages are written into the status strip, not floated over it.

**Key Characteristics:**
- Matte black chassis with a lit top edge; graphite keycaps; near-black recessed LCDs with a diagonal glass sheen.
- Icon-only keys showing full-colour real app icons; empty slots render as dark, unlit LCDs.
- Barlow Condensed silkscreen for the wordmark, labels, and numerals; system UI face only for explanatory text.
- Green, amber, and red reserved for state.
- One centered block: silkscreen, strip, and keys share the same width.

## Colors

A near-monochrome stack of blacks and graphites. The only colour on screen comes from the app icons and three state lights.

### Primary
- **Signal Green** (`ok`): the power LED when online, meter bars under 70%. This is the healthy state, not a brand accent.

### Secondary
- **Amber Load** (`warn`): meter bars from 70% to under 90%.

### Tertiary
- **Fault Red** (`err`): the LED when offline, meter bars at 90% or more, the strip message title, and the key's red error flash (at 42% alpha).

### Neutral
- **Room Black** (`room`): the page behind the device and the html background.
- **Chassis Top / Chassis / Chassis Floor** (`chassis-hi`, `chassis`, `chassis-lo`): the chassis gradient. The lit top edge fades to body by 18% of the height and to floor at the bottom. `chassis-lo` is also the theme-color.
- **Graphite Cap Light / Graphite Cap Shade** (`cap-hi`, `cap-lo`): the top-to-bottom keycap gradient.
- **Dead LCD** (`lcd`): every screen surface (key LCDs, status strip, unpaired panel).
- **Silkscreen Grey** (`print`): the wordmark, focus outlines, the active page dot, and unpaired body text.
- **Faded Silkscreen** (`print-dim`): secondary printing (ONLINE label, segment labels, units, detail lines, fullscreen glyph).
- **Lit Pixel White** (`text`): live readouts on a screen (meter values, strip message text, unpaired title).

### Named Rules
**The State-Only Colour Rule.** Green, amber, and red mean only online/offline, load level, or a command result. They never decorate, never tint a surface, and never appear as glow. Thresholds are fixed: under 70% is ok, 70 to 89% is warn, and 90% or more is err.

**The Icons Carry The Colour Rule.** Saturated colour belongs only to the real app icons (a brand mark that is officially monochrome, like GitHub, stays as it is). The rest of the device stays neutral so the icons read at a glance.

## Typography

**Display Font:** Barlow Condensed 500/600/700, self-hosted, `font-display: block` (with Arial Narrow, system-ui)
**Body Font:** system-ui (with -apple-system, Segoe UI, Roboto)

**Character:** Condensed caps read like printing on a hardware chassis, tight and engineered. The system face appears only when the device has to explain something in a full sentence.

### Hierarchy
- **Display** (600, `clamp(22px, 6.6vw, 28px)`, 0.9, tabular numerals): meter percentages in the strip. The `%` unit sits at 0.55em in Faded Silkscreen.
- **Headline** (700, `clamp(15px, 4.4vw, 18px)`, 0.22em tracking, uppercase): the wordmark only. Left padding equal to the tracking keeps it optically centered.
- **Title** (500, 15px, 1.25): message text written into the strip. Also the unpaired heading (600, 16px, 0.08em, uppercase).
- **Body** (system-ui 500, 15px/1.3; 14px/1.5 in the unpaired panel): instructional sentences only.
- **Label** (600, 12px, 0.14em): segment names (CPU, RAM, GPU), the power status (uppercase, 0.12em), and the strip message title (uppercase, Fault Red).
- **Label Detail** (500, 11.5px, 0.04em, tabular): real-data lines under each meter (core count, used/total GB, GPU name), with an ellipsis when they overflow.

### Named Rules
**The Silkscreen Rule.** Anything painted on the chassis is Barlow Condensed in a print grey, never Lit Pixel White. White is for things a screen is displaying.

**The Tabular Readout Rule.** Every live number uses tabular figures so readouts do not jitter as they update every 2s.

## Layout

The device fills the viewport (`100dvh`, no scroll, overscroll disabled). Chassis padding is `pad`, and it never drops below the safe-area insets. Inside, a size container centers one block vertically and horizontally: a silkscreen row (36px tall, 8px gap below), the status strip (80px), and the key grid, all at the same width (`--block-w`).

The key size is computed rather than set. It is the largest square that fits both the container width and its leftover height, capped at 170px. The gap is `gap` everywhere, both between keys and between the strip and the keys.

- **Portrait:** a 3 × 5 matrix (15 keys per page).
- **Landscape:** a 5 × 3 matrix, like the device lying down.
- **Short landscape (max-height 500px):** chassis padding 12px, strip 54px, silkscreen row 30px with a 4px gap, and the detail lines hidden.

The silkscreen row is a three-column grid. Power is on the left, the wordmark is centered, and fullscreen is on the right. The touch targets bleed into the margins (negative margins) so the visible glyphs stay aligned to the edges of the block. Page dots appear under the keys only when there is more than one page.

**The One Block Rule.** The silkscreen row, strip, and key matrix always share one width and one center axis. Nothing sits outside the block except the chassis itself.

## Elevation & Depth

Depth is physical and has two directions. Keycaps stand proud of the chassis. Screens are cut into it. There are no floating layers, cards, or overlays.

### Shadow Vocabulary
- **Keycap at rest** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 1px rgba(0,0,0,0.9), 0 4px 8px -2px rgba(0,0,0,0.8)`): a lit top lip, a contact shadow, and a soft drop shadow.
- **Keycap pressed** (`inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)`): the drop shadow collapses as the cap travels 3px down.
- **Recessed screen, strip** (`inset 0 2px 6px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.05)`): the cutout, with a lit lower lip on the chassis.
- **Recessed screen, key LCD** (`inset 0 1px 4px rgba(0,0,0,0.95), 0 0 0 1px rgba(0,0,0,0.6)`).
- **LED dome** (`inset 0 -1px 1px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06)`), with a radial highlight at 45% / 28%. It has no halo.

### Named Rules
**The Recessed Glass Rule.** Every screen is inset into the chassis and carries a faint diagonal glass sheen (white, 5 to 10% alpha, fading to transparent by about 40%). Content on a screen never casts an outer shadow.

**The No Glow Rule.** Light does not spill. The LED, the meters, and the flashes stay inside their own shapes.

## Shapes

Shapes are soft-cornered squares that scale with their object. A keycap is rounded at 20% of its size and its LCD at 15%, so the screen corner sits concentric inside the cap at any key size. The strip uses a viewport-scaled radius (12 to 16px). The unpaired panel shares the strip's radius, so every screen cut into the chassis has the same corner. Meter bars are 3px tall with 2px ends. The LED and page dots are circles. There are no borders, except the 1px dividers between strip segments (#16181b), which read as seams in the glass.

## Components

### Key (signature)
Feels like a physical keycap with a screen in it.
- **Shape:** a square sized to fit, rounded at 20%. The LCD inset is 7% and is rounded at 15%.
- **Content:** the real app icon in full colour at 66% of the LCD, `object-fit: contain`. There is no visible label. The label is carried by `aria-label` and the title.
- **Empty slot:** a disabled, unlit LCD with no icon. It is never hidden or collapsed, because the grid is always full.
- **Travel:** on pointerdown the cap sinks `translateY(3px)` (70ms ease-out), the icon dims to 75% brightness, and the phone vibrates for 10ms. The cap is held down for at least 90ms, and the action fires on release.
- **Busy:** the icon dims to 55% brightness.
- **Result:** OK is a white radial flash inside the LCD (650ms, `cubic-bezier(0.16, 1, 0.3, 1)`). Error is a red fill at 42% alpha held for 60% of 900ms, plus a vibration pattern of 40/60/40ms.
- **Focus:** a 2px Silkscreen Grey outline offset 3px.

### Status Strip (signature)
The Stream Deck+ LCD strip, integrated into the chassis.
- **Structure:** three equal segments (CPU, RAM, GPU) separated by 1px seams. Each segment shows a label and a value on one row, a 3px meter bar, and a detail line.
- **Meter:** the bar width tracks the percentage (700ms, `cubic-bezier(0.16, 1, 0.3, 1)`). Its colour follows the State-Only Colour thresholds. The track is #15171a.
- **Detail:** real data only (core count, used/total GB, GPU name). "lendo…" shows while a value is pending, and "–" shows when there is no value.
- **Message mode:** errors replace the meters inside the same screen for 3.6s. The title is a Fault Red uppercase label over a sentence in Lit Pixel White. The message is `role="status"` and polite.

### Silkscreen Row
- **Power indicator:** the LED plus a status word (ONLINE / OFFLINE) as a Faded Silkscreen label, with a 44px touch target. Tapping it reconnects.
- **Wordmark:** the deck title in the headline style, Silkscreen Grey.
- **Fullscreen button:** an 18px stroked SVG corner glyph (2px stroke, round caps) in Faded Silkscreen, which brightens to Silkscreen Grey while pressed. It toggles enter/exit glyphs and is hidden when fullscreen is unsupported.
- **Focus:** a 2px Silkscreen Grey outline with a 6px radius.

### Page Dots
6px circles (#2a2d32 inactive, Silkscreen Grey active) inside 44 × 40px targets. They render only when there are two or more pages.

### Unpaired Panel
A recessed Dead LCD panel (same radius as the strip, 16px padding) shown instead of the keys. It has an uppercase condensed title in Lit Pixel White, and its instruction body is in system-ui at 14px/1.5. Inline code is in Lit Pixel White.

### Motion
All transitions are short and mechanical (70 to 300ms for state, 700ms for meter travel). Under `prefers-reduced-motion`, transitions are removed and the flashes collapse to 1ms.

## Do's and Don'ts

### Do:
- **Do** build every new surface out of the three materials: chassis (gradient from `chassis-hi` to `chassis-lo`), keycap (`cap-hi` to `cap-lo`, standing proud), and screen (`lcd`, recessed, with a glass sheen).
- **Do** show live information and messages inside a screen, such as the strip or a key LCD, rather than over the chassis.
- **Do** keep keys icon-only, with the real full-colour icon at 66% of the LCD and the label in `aria-label`.
- **Do** size keys by fitting the largest square, capped at 170px, and keep the silkscreen row, strip, and keys on one shared block width.
- **Do** keep touch targets at 44px or more, with visible glyphs aligned to the block edges.
- **Do** give every press physical feedback: 3px of travel, a short vibration, and an answer flashed in that key's own LCD.

### Don't:
- **Don't** use green, amber, or red for anything other than state, and don't add RGB lighting, glows, or LED halos.
- **Don't** put a visible text label on a key, or replace a real app icon with a generic glyph or a redrawn one.
- **Don't** use toasts, modals, or floating overlays. The device has no surface for them.
- **Don't** set chassis printing in white or in the system face. Silkscreen is Barlow Condensed in a print grey.
- **Don't** hide empty key slots. An unlit LCD is part of the device.
- **Don't** let the page scroll, or let any element break out of the centered block.
