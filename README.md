# CutForge

Cross-platform vector design for **laser cutting / engraving** and **Silhouette** (Cameo). Built with **Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.4)

- Dark UI: toolbar · rulers · align · canvas · inspector · layers
- Page presets: Letter, A4, Cameo 4 (12×12), Cameo 4 Plus (15×15), custom; mm / in
- Tools: select, rect, ellipse, line, polygon, freehand, text
- Marquee + Shift multi-select; move / resize / rotate; undo/redo
- **Snap**: grid, edges/endpoints, smart guides
- **Angle constraints**: hold **Shift** → **15°** snaps for lines, polygon segments, and rotation; Shift+rect/ellipse → square/circle
- **Projects**: `.cutforge` Save / Open / Save As; 30s autosave recovery
- **Native file dialogs** in the Tauri app (browser pickers under `npm run dev`)
- Path ops: unite / subtract / intersect; kerf outset/inset
- Copy / paste / select-all; Esc cancels tool or clears selection
- **Silhouette registration marks** (4 corner squares) for print-and-cut; SVG export aware
- Cut · Score · Engrave; hairline (0.001 in) SVG
- Export SVG + DXF (curves as polylines; CUT/SCORE/ENGRAVE)

## Run

```bash
cd cutforge
npm install
npm run dev          # web UI (browser file pickers)
npm run tauri:dev    # desktop (native dialogs; Rust 1.90+)
npm run tauri:build
```

## Shortcuts

| Key | Action |
|-----|--------|
| V R E L P F T | Tools |
| **Shift** | 15° angle snap (line / polygon / rotate); square/circle (rect / ellipse) |
| Drag empty / Shift+click | Marquee / toggle |
| Ctrl/Cmd+A C V D | Select all / Copy / Paste / Duplicate |
| Ctrl/Cmd+Z · Shift+Z · Y | Undo / Redo |
| Ctrl/Cmd+S · Shift+S · O | Save / Save As / Open |
| Space+drag / Wheel | Pan / Zoom |
| Delete / Backspace | Delete |
| Esc | Cancel drawing, otherwise clear selection |
| ? | Help |

## Export

- **SVG**: page `viewBox` in mm or in; optional hairline; registration marks when enabled. Text stays as `<text>` (no glyph outline engine).
- **DXF**: mm; ellipses/arcs → dense LWPOLYLINE; TEXT + bounds for text objects.

## Known limits

- Kerf offset is scale-about-center, not a true parallel curve
- Text-to-path requires bundling fonts (not included)
- Booleans need closed paths; open/self-intersecting paths may fail
- No machine send / multi-mat jobs yet
- Web mode cannot use OS file dialogs

## Project layout

```
src/canvas/     Paper.js editor, snap, angles, booleans, reg marks
src/export/     SVG + DXF
src/io/         Tauri / browser file helpers
src/project/    .cutforge format + autosave
src-tauri/      Tauri 2 shell (dialog + fs plugins)
```
