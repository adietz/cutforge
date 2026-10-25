# CutForge

Daily-driver vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js** · **v1.0.0**

## Feature summary

| Area | What you get |
|------|----------------|
| Editor | Tools, snap, layers, undo, booleans, text→outlines, image trace, `.cutforge` |
| Kerf | **True parallel** inset/outset (Clipper) on closed paths |
| Colors | Free stroke/fill · color→laser power map |
| K1 | USB G-code, materials, hatch engrave, job time estimate, M5 safety |
| Silhouette | USB GPGL · **Print & Cut** (print PNG/PDF + cut SVG/GPGL + reg marks) |
| Export | SVG / DXF machine profiles (LightBurn optional) |

## Print & Cut (Silhouette)

1. Enable **Print & Cut mode** (inspector) — turns on registration marks.
2. Style inkjet artwork as **print**; knife paths as **Cut** / **Score**.
3. **Print PNG** or **Print PDF** → inkjet (marks included).
4. Load the print on the mat; **Cut SVG** or **Send to Silhouette** (print objects skipped).
5. Optical sensor seek is limited in-app — for full Studio-style registration, open the Cut SVG in Silhouette Studio after printing.

## Kerf / materials / estimate

- Path ops → Kerf offset (parallel outset/inset, undoable).
- Send to K1 → material starters (plywood / acrylic / cardboard) + rough job time from G-code length÷feed.

## Run

```bash
npm install
npm run tauri:dev
npm run build && cd src-tauri && cargo check
```

## Still open

- No Wi‑Fi send; Silhouette BLE / full reg-mark sensor seek not implemented
- Job estimate ignores accel/pierce; material numbers are starters only
- Kerf needs closed paths; engrave hatch is scanline not bitmap
