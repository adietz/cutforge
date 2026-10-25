# CutForge

Daily-driver vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js** · **v1.2.0**

## Feature summary

| Area | What you get |
|------|----------------|
| Editor | Tools, snap, layers, undo, booleans, text→outlines, image trace, `.cutforge` |
| **Import** | **SVG, DXF** (pure JS) · **AI/PDF, EPS, CDR, EMF/WMF** via desktop helpers |
| Kerf | True parallel inset/outset (Clipper) |
| K1 | USB G-code, bitmap raster engrave, experimental Wi‑Fi TCP, materials |
| Silhouette | USB GPGL · optical reg-mark seek · Print & Cut |
| Export | SVG / DXF machine profiles |

## Import (Illustrator, CorelDRAW, …)

Top bar → **Import**. Format table lists engines:

- **Pure JS:** SVG, SVGZ, DXF  
- **Desktop helpers:** PDF / AI (pdftocairo or LibreOffice), EPS (Ghostscript), CorelDRAW CDR (LibreOffice libcdr or Inkscape), EMF/WMF  

Details: [`docs/IMPORT.md`](docs/IMPORT.md). Without helpers, export SVG/PDF from the source app.

## Print & Cut / K1 / Silhouette

See Help in-app and prior release notes (v1.0–v1.1).

## Run

```bash
npm install
npm run tauri:dev
npm run build && cd src-tauri && cargo check
```

Optional helpers: `poppler-utils`, `ghostscript`, `libreoffice-draw`, `inkscape`.
