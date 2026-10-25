# CutForge

Cross-platform vector design for **laser cutting / engraving** and **Silhouette** (Cameo). **Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.4.1)

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

## Known issues / limits

- Kerf offset is scale-about-center, not a true parallel curve
- Text stays as text on export (no glyph outlines without bundled fonts)
- Booleans need **closed** paths; open/self-intersecting paths often fail
- Undo does not restore snap/reg-mark *settings* (only geometry)
- Custom page W/H no longer re-fits zoom every keystroke (preset switch still fits)
- No machine send / multi-mat yet
- Web mode has no OS file dialogs

## Layout

```
src/canvas/   editor, snap, angles, booleans, reg marks
src/export/   SVG + DXF
src/io/       Tauri / browser file helpers
src/project/  .cutforge + autosave
src-tauri/    Tauri 2 (dialog + fs)
```
