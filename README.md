# CutForge

Cross-platform vector design for **laser cutting / engraving** and **Silhouette** (Cameo). **Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.5.0)

- Dark UI: toolbar · rulers · align · canvas · inspector · layers
- Page presets (Letter, A4, Cameo 4 / Plus, custom); mm / in
- Tools: select, rect, ellipse, line, polygon, freehand, text
- Marquee + Shift multi-select; move / resize / rotate; undo/redo
- Snap: grid, edges/endpoints, smart guides (edge snap off while freehand)
- **Shift → 15°** for lines / polygons / rotate; square/circle for rect/ellipse
- `.cutforge` projects with Save / Open / Save As; 30s autosave recovery
- Native file dialogs in Tauri; browser pickers in `npm run dev`
- Path ops: unite / subtract / intersect (closed paths); kerf outset/inset
- Copy / paste / select-all; Esc cancels tool or clears selection
- Silhouette registration marks for print-and-cut
- Default **hairline** cut stroke; Cut · Score · Engrave
- Export SVG + DXF (curves as polylines)
- **Text → outlines** — convert selected text to editable vector paths using
  bundled OFL fonts (Inter, Open Sans) via opentype.js (offline)
- **Image tracing** — import PNG/JPG, vectorize with imagetracer.js controls
  (threshold, path omit, simplify, mono/color), preview, place as cut paths

## Run

```bash
cd cutforge
npm install
npm run dev          # web UI
npm run tauri:dev    # desktop (Rust 1.90+)
npm run tauri:build
```

## Shortcuts

| Key | Action |
|-----|--------|
| V R E L P F T | Tools |
| Shift | 15° snap (line/polygon/rotate); square/circle (rect/ellipse) |
| Drag empty / Shift+click | Marquee / toggle (no drag) |
| Ctrl/Cmd+A C V D | Select all / Copy / Paste / Duplicate |
| Ctrl/Cmd+Z · Shift+Z · Y | Undo / Redo |
| Ctrl/Cmd+S · Shift+S · O | Save / Save As / Open |
| Space+drag / Wheel | Pan / Zoom |
| Delete / Backspace | Delete |
| Esc | Cancel drawing, else clear selection |
| ? | Help |

## Text to outlines

1. Create text with the **T** tool (or select existing text).
2. In the inspector **Text & images** section, choose **Inter** or **Open Sans**.
3. Click **Convert text to outlines**.
4. Text is replaced by Paper.js paths/compound paths; Cut/Score/Engrave and
   stroke settings are preserved. Undo with Ctrl/Cmd+Z.

Fonts ship under `public/fonts/` (OFL). Conversion works offline after the
app loads those files. Only Regular weights are bundled; glyph coverage is
that of each font.

## Image tracing

1. Inspector → **Trace image…**
2. Choose a PNG / JPG / WebP.
3. Adjust **Mode** (mono line art vs color posterize), **Threshold** (mono),
   **Colors** (color mode), **Ignore small paths**, **Simplify**, **Blur**.
4. Preview updates live; **Place on canvas** inserts cut-styled paths scaled
   to fit ~85% of the page. Undoable.

Best for high-contrast logos and line art. Photos need aggressive threshold
or few colors. Images larger than 1200px on a side are downscaled before
tracing for performance.

## Known issues / limits

- Kerf offset is scale-about-center, not a true parallel curve
- Outlines use only the two bundled Regular fonts (not system fonts / bold)
- Multi-line PointText is converted as a single line string
- Image tracer is imagetracer.js (not true Potrace); complex photos get noisy
- Color traces produce filled regions; placement prefers cut stroke (fills cleared unless Engrave is active)
- Booleans need **closed** paths; open/self-intersecting paths often fail
- Undo does not restore snap/reg-mark *settings* (only geometry)
- Custom page W/H no longer re-fits zoom every keystroke (preset switch still fits)
- No machine send / multi-mat yet
- Web mode has no OS file dialogs

## Layout

```
src/canvas/   editor, snap, angles, booleans, reg marks, textOutlines, imageTrace
src/fonts/    bundled font catalog
public/fonts/ Inter + Open Sans (OFL)
src/export/   SVG + DXF
src/io/       Tauri / browser file helpers
src/project/  .cutforge + autosave
src-tauri/    Tauri 2 (dialog + fs)
```
