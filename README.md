# CutForge

Cross-platform desktop vector design app for **laser cutting / engraving** and **Silhouette** machines (Cameo and friends). Built with **Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.2)

- Dark UI: toolbar · rulers · canvas · inspector · layers
- Page presets: Letter, A4, Silhouette Cameo 4 (12×12 in), Cameo 4 Plus (15×15 in), custom
- Units: mm / in with live cursor readout
- Tools: select, rectangle, ellipse, line, polygon, freehand, text
- Selection: marquee, Shift-click toggle, move / resize / rotate, delete, duplicate
- Align / distribute for multi-selection
- **Undo / redo** history (draw, transform, style, delete, duplicate, import, layer ops)
- Layers panel: visibility, lock, rename, reorder
- Cut types: **Cut** · **Score** · **Engrave**
- **Hairline (0.001 in)** stroke for Silhouette SVG export
- Import SVG · Export SVG · Export DXF (laser, mm)
- Zoom (wheel), pan (Space+drag), page grid, Help cheatsheet (`?`)

## Requirements

- Node.js 20+ (22 recommended)
- Rust toolchain **1.90+** via rustup (Tauri 2.12) — https://rustup.rs
- OS deps for Tauri:
  - **Linux**: `webkit2gtk-4.1`, GTK 3, `librsvg2`, `patchelf` (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))
  - **macOS**: Xcode CLT
  - **Windows**: WebView2 + MSVC build tools

## Quick start (web UI)

```bash
cd cutforge
npm install
npm run dev
```

## Desktop app (Tauri)

```bash
cd cutforge
npm install
npm run tauri:dev
```

Production installers:

```bash
npm run tauri:build
```

Artifacts under `src-tauri/target/release/bundle/`.

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| V | Select |
| R | Rectangle |
| E | Ellipse |
| L | Line |
| P | Polygon (Enter / double-click to close) |
| F | Freehand |
| T | Text |
| Drag empty canvas | Marquee multi-select |
| Shift+click | Add/remove from selection |
| Space+drag | Pan |
| Wheel | Zoom |
| Delete / Backspace | Delete selection |
| Ctrl/Cmd+D | Duplicate |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| Esc | Cancel polygon / back to select |
| ? | Shortcuts cheatsheet |

Also available from **Help** in the top bar.

## Export notes

- **SVG**: page-sized `viewBox`, mm or in units, `data-cut-type` on paths. Enable **Hairline (0.001 in)** for Silhouette Studio cut lines.
- **DXF**: ASCII LWPOLYLINE / TEXT on layers `CUT`, `SCORE`, `ENGRAVE`, units mm — LightBurn, LaserGRBL, many CO₂ controllers.

## Project layout

```
src/                 React UI + Paper.js editor
src/canvas/          Editor engine + history
src/export/          SVG + DXF writers
src-tauri/           Tauri 2 / Rust shell
```

## Remaining gaps (toward daily driver)

- True boolean ops / path offset / nested cut holes
- Snap to grid / guides / object edges
- Persist `.cutforge` project files; autosave
- Print-to-cut registration marks
- Direct send to Silhouette / LightBurn
- DXF arcs/ellipses without polyline sampling
- Multi-page / multi-mat jobs
- Better text-to-path for cutters that ignore fonts
