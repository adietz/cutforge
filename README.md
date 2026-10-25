# CutForge

Cross-platform desktop vector design app for **laser cutting / engraving** and **Silhouette** machines. **Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.3)

- Dark UI: toolbar · rulers · align bar · canvas · inspector · layers
- Page presets (Letter, A4, Cameo 4 / 4 Plus, custom); mm / in
- Tools: select, rect, ellipse, line, polygon, freehand, text
- Marquee + Shift multi-select; move / resize / rotate; undo/redo
- **Snap**: grid, edge/endpoint, smart guides (inspector toggles)
- **Projects**: `.cutforge` JSON Save / Open / Save As; autosave recovery (~30s)
- **Path ops**: unite / subtract / intersect; kerf outset/inset
- Copy / paste / duplicate / select-all
- Cut · Score · Engrave; hairline SVG for Silhouette
- Export SVG + DXF (curves as dense polylines; CUT/SCORE/ENGRAVE layers)
- Help cheatsheet (`?`)

## Run

```bash
cd cutforge
npm install
npm run dev          # web UI
npm run tauri:dev    # native (Rust 1.90+)
npm run tauri:build
```

## Shortcuts

| Key | Action |
|-----|--------|
| V R E L P F T | Tools |
| Drag empty / Shift+click | Marquee / toggle select |
| Ctrl/Cmd+A C V D | Select all / Copy / Paste / Duplicate |
| Ctrl/Cmd+Z / Shift+Z / Y | Undo / Redo |
| Ctrl/Cmd+S / Shift+S / O | Save / Save As / Open |
| Space+drag / Wheel | Pan / Zoom |
| Delete / Esc / ? | Delete / Cancel / Help |

## Export notes

- **SVG**: mm or in `viewBox`; optional hairline `0.001in`. Text remains `<text>` (no glyph outline engine without bundling fonts).
- **DXF**: mm; ellipses/arcs/beziers → LWPOLYLINE sampling; TEXT + bounds rect for text; layers CUT / SCORE / ENGRAVE.

## Project file

`.cutforge` JSON includes page, units, style, snap settings, and Paper.js object JSON. Recovery is stored in `localStorage` while the document is dirty.

## Remaining gaps

- True parallel curve offset (current kerf offset is scale-about-center)
- Snap-to-angle / constrain while drawing
- Native file dialogs via Tauri (currently browser download/upload)
- Font-based text-to-path (opentype) if/when fonts are bundled
- Boolean robustness on open paths / self-intersections
- Multi-mat jobs, registration marks, machine send
