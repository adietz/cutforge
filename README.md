# CutForge

Cross-platform desktop vector design app for **laser cutting / engraving** and **Silhouette** machines (Cameo and friends). Built with **Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.1 scaffold)

- Dark UI: toolbar · canvas · inspector
- Page presets: Letter, A4, Silhouette Cameo 4 (12×12 in), Cameo 4 Plus (15×15 in), custom
- Units: mm / in
- Tools: select, rectangle, ellipse, line, polygon, freehand, text
- Selection: move, resize handles, rotate, delete, duplicate
- Cut types: **Cut** · **Score** · **Engrave** (visual stroke/fill conventions)
- Import SVG · Export SVG (Silhouette-friendly) · Export DXF (laser, mm)
- Zoom (wheel), pan (hold Space + drag), page grid

## Requirements

- Node.js 20+ (22 recommended)
- Rust toolchain **1.90+** via rustup (Tauri 2.12) — https://rustup.rs
- OS deps for Tauri:
  - **Linux**: `webkit2gtk-4.1`, GTK 3, `librsvg2`, `patchelf` (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))
  - **macOS**: Xcode CLT
  - **Windows**: WebView2 + MSVC build tools

## Quick start (web UI)

Useful for UI work without compiling the native shell:

```bash
cd cutforge
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

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

Artifacts land under `src-tauri/target/release/bundle/` (`.dmg` / `.msi` / `.AppImage` etc. depending on host OS).

## Shortcuts

| Key | Action |
|-----|--------|
| V | Select |
| R | Rectangle |
| E | Ellipse |
| L | Line |
| P | Polygon (Enter / double-click to close) |
| F | Freehand |
| T | Text |
| Space+drag | Pan |
| Wheel | Zoom |
| Delete | Delete selection |
| Ctrl/Cmd+D | Duplicate |
| Esc | Cancel polygon / back to select |

## Export notes

- **SVG**: page-sized `viewBox`, mm or in units, `data-cut-type` on paths — open in Silhouette Studio or send to laser software that accepts SVG.
- **DXF**: ASCII LWPOLYLINE / TEXT on layers `CUT`, `SCORE`, `ENGRAVE`, units mm — typical for LightBurn, LaserGRBL, and many CO₂ controllers.

## Project layout

```
src/                 React UI + Paper.js editor
src/canvas/          Editor engine
src/export/          SVG + DXF writers
src-tauri/           Tauri 2 / Rust shell
```

## Next iterations

- True multi-select marquee, align/distribute
- Undo/redo stack
- Layers panel + lock/hide
- Hairline stroke mode for Silhouette
- Direct USB / Send-to-Silhouette (machine SDK)
- DXF ellipses/arcs without polyline sampling
- Ruler chrome with live cursor readout
