# CutForge

Daily-driver vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js** · **v1.5.0**

## Feature summary

| Area | What you get |
|------|----------------|
| Editor | Tools, snap, layers, undo, booleans, text→outlines, image trace |
| **Layers** | Named layers with color, cut type, visibility, lock, S/F/passes; cut order |
| Nest / Pack | AABB shelf pack onto the bed |
| Import | SVG, DXF · AI/PDF, EPS, CDR, EMF — `docs/IMPORT.md` |
| Materials | Editable laser + Silhouette library |
| K1 | USB G-code, jog/frame, bitmap engrave, Wi‑Fi TCP |
| Silhouette | USB GPGL · optical seek · Print & Cut |

## Layers (v1.5)

Inspector → **Layers** panel:

- **+** add layer; ↑/↓ reorder (**top = cut first** on export / Send to K1 / Silhouette).
- Eye = visible (hidden layers are **not** cut). Lock = no edit / no nest move (still cut if visible).
- Color swatch + operation (Cut / Score / Engrave / Print). Optional power **S**, speed **F**, passes overrides (else material / color map).
- Active layer (highlighted): new shapes land here. Move selection with **Move selection to…**.
- Persisted in `.cutforge` (`layers` + `activeLayerId`). Undo restores layer defs + objects.

## Nest / Materials / Import

See Help and `docs/IMPORT.md`.

## Run

```bash
npm install
npm run tauri:dev
npm run build && cd src-tauri && cargo check
```
