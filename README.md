# CutForge

Daily-driver vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js** · **v1.3.0**

## Feature summary

| Area | What you get |
|------|----------------|
| Editor | Tools, snap, layers, undo, booleans, text→outlines, image trace, `.cutforge` |
| Import | SVG, DXF (pure JS) · AI/PDF, EPS, CDR, EMF via desktop helpers — `docs/IMPORT.md` |
| **Materials** | Editable library (laser + Silhouette): power %, speed, passes, engrave interval, blade force — persisted locally |
| K1 | USB G-code, **jog / frame / origin**, bitmap engrave, experimental Wi‑Fi, job estimate |
| Silhouette | USB GPGL · optical reg-mark seek · Print & Cut |
| Kerf / export | Parallel Clipper kerf · SVG/DXF profiles |

## Materials library

Send to K1 or Silhouette → **Edit materials library…**

- Add / edit / delete presets (name, thickness, machine type).
- Laser: speed, power %, passes, engrave interval (hatch mm).
- Silhouette: speed, force (pressure), passes.
- Seeds: basswood, acrylic, cardboard, leather, vinyl, cardstock, sticker.
- Stored in **localStorage** (`cutforge-materials-v1`). Apply to the current job so send/export/estimates use those settings. Calibrate on scrap.

## K1 jog & frame

In **Send to K1** (USB connected):

1. Choose jog step **1 / 10 / 50 mm** — moves with laser **off**.
2. **Home** (`$H`) if the controller supports it; **Go origin** → `G0 X0 Y0`.
3. **Frame selection** or **Frame job** — rapid/feed around the bounding box. Default **M5** (laser off). Optional low-power S while tracing (LightBurn-style). **Not a cut.**
4. Connection status + WPos/MPos when GRBL reports them. Frame can also go over experimental Wi‑Fi TCP if USB is disconnected.

## Import / Print & Cut

See Help and `docs/IMPORT.md`.

## Run

```bash
npm install
npm run tauri:dev
npm run build && cd src-tauri && cargo check
```

**Hardware caveats:** Frame/jog assume GRBL-compatible firmware (IKIER K1 class). Homing needs `$H` enabled. Always verify origin and low-power frame on scrap before a real job. Wi‑Fi TCP is experimental.
