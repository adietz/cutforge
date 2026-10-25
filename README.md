# CutForge

Cross-platform vector design for **laser cutting / engraving** (IKIER K1 and
friends) and **Silhouette** (Cameo / Portrait). **Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.6.0)

- Dark UI: toolbar · rulers · align · canvas · inspector · layers
- Page presets including **IKIER K1 410×410 mm**, Cameo 4 / Plus, Portrait, Letter, A4
- Tools: select, rect, ellipse, line, polygon, freehand, text
- Marquee + Shift multi-select; move / resize / rotate; undo/redo
- Snap: grid, edges/endpoints, smart guides
- **Shift → 15°** for lines / polygons / rotate; square/circle for rect/ellipse
- `.cutforge` projects; autosave recovery; native Tauri dialogs
- Path ops: unite / subtract / intersect; kerf outset/inset
- Silhouette registration marks; Cut · Score · Engrave; hairline strokes
- **Text → outlines** (bundled OFL Inter / Open Sans via opentype.js)
- **Image tracing** (PNG/JPG → cut paths via imagetracer.js)
- **Machine export** — profiled one-click SVG/DXF for IKIER K1, Silhouette,
  LightBurn, Glowforge, generic laser

## Machine export (v0.6)

Top bar → **Machine export**.

| Profile | Default | Notes |
|---------|---------|--------|
| **IKIER K1** (primary laser) | LightBurn SVG, mm, 410×410 | Switch to DXF; open in LightBurn or LaserGRBL |
| Silhouette Cameo 4 / Plus / Portrait | Hairline SVG, inches | Studio import; optional reg marks |
| Generic laser | DXF mm (or SVG) | Layers CUT / SCORE / ENGRAVE |
| LightBurn-friendly SVG | Colored groups | Red cut / blue score / black engrave |
| Glowforge-style SVG | Color-mapped SVG | Simple stroke/fill mapping |

**Options:** units, hairline, registration marks, flatten text→outlines
(warns if text remains), exclude hidden/locked, apply suggested page size.

**Coordinates**

- **SVG:** origin top-left, **Y-down**
- **DXF:** origin bottom-left, **Y-up** (mm `$INSUNITS`)
- LightBurn typically uses a lower-left job origin on the machine after import

**Limit:** CutForge writes files only — **no USB / G-code send** to the IKIER
K1 or Silhouette. Use LightBurn, LaserGRBL, or Silhouette Studio to run jobs.

## Run

```bash
cd cutforge
npm install
npm run dev          # web UI
npm run tauri:dev    # desktop
npm run tauri:build
```

## Shortcuts

| Key | Action |
|-----|--------|
| V R E L P F T | Tools |
| Shift | 15° snap; square/circle |
| Ctrl/Cmd+A C V D | Select all / Copy / Paste / Duplicate |
| Ctrl/Cmd+Z · Shift+Z · Y | Undo / Redo |
| Ctrl/Cmd+S · Shift+S · O | Save / Save As / Open |
| Space+drag / Wheel | Pan / Zoom |
| Delete / Esc / ? | Delete / Cancel / Help |

## Text to outlines & image tracing

See inspector **Text & images**. Outlines use offline OFL fonts. Tracing is
best for high-contrast logos (images >1200px are downscaled).

## Known issues / limits

- No USB / G-code / machine send (export files only)
- Kerf offset is scale-about-center, not a true parallel curve
- Outlines: Regular Inter / Open Sans only; multi-line PointText → one string
- Image tracer ≠ Potrace; photos get noisy
- Booleans need closed paths
- Undo does not restore snap/reg-mark *settings*

## Layout

```
src/export/   SVG + DXF + machine profiles (IKIER K1, Silhouette, …)
src/canvas/   editor, snap, booleans, textOutlines, imageTrace
src/fonts/    bundled font catalog
public/fonts/ Inter + Open Sans (OFL)
src-tauri/    Tauri 2
```
