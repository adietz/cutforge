# CutForge

Daily-driver vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js** · **v1.4.0**

## Feature summary

| Area | What you get |
|------|----------------|
| Editor | Tools, snap, layers, undo, booleans, text→outlines, image trace |
| **Nest / Pack** | Shelf pack selection or all onto the bed (gap/margin, optional 90°) |
| Import | SVG, DXF · AI/PDF, EPS, CDR, EMF via helpers — `docs/IMPORT.md` |
| Materials | Editable laser + Silhouette library (localStorage) |
| K1 | USB G-code, jog/frame/origin, bitmap engrave, Wi‑Fi TCP |
| Silhouette | USB GPGL · optical seek · Print & Cut |

## Nest / Pack (v1.4)

On the Arrange bar (above the canvas):

1. Set **Gap** (between parts, default 2.5 mm) and **Margin** (from sheet edge, default 3 mm).
2. Optionally allow **90°** rotations.
3. **Nest selection** or **Nest all** (unlocked, visible shapes only).
4. Status reports how many placed / did not fit. **Undo** restores previous positions & rotations.

Uses the **current page size** as the bed (e.g. IKIER K1 410×410 mm).

**Algorithm limits:** axis-aligned bounding-box **shelf packing** only — no arbitrary-angle nesting, no true shape NFP interlocking. Irregular parts pack by their AABB, so concave waste is not recovered.

## Materials / K1 frame / Import

See in-app Help and prior docs (`docs/IMPORT.md`).

## Run

```bash
npm install
npm run tauri:dev
npm run build && cd src-tauri && cargo check
```
