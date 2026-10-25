# CutForge

Daily-driver vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js** · **v1.1.0**

## Feature summary

| Area | What you get |
|------|----------------|
| Editor | Tools, snap, layers, undo, booleans, text→outlines, image trace, `.cutforge` |
| Kerf | **True parallel** inset/outset (Clipper) on closed paths |
| Colors | Free stroke/fill · color→laser power map |
| K1 | USB G-code, **bitmap raster engrave**, materials, hatch, job estimate, M5 safety |
| K1 Wi‑Fi | Experimental TCP to hub (often `192.168.4.1:8080`); Save .nc → TF if needed |
| Silhouette | USB GPGL · **optical reg-mark seek** (TB123/TB23) · Print & Cut pack |
| Export | SVG / DXF machine profiles (LightBurn optional) |

## Print & Cut (Silhouette)

1. Enable **Print & Cut mode** (inspector) — turns on registration marks.
2. Style inkjet artwork as **print**; knife paths as **Cut** / **Score**.
3. **1 · Print PNG** or Print PDF → inkjet (marks included).
4. Load the print on the mat; **Send to Silhouette** with optical seek **Auto (TB123)**, or **2 · Cut SVG** → Silhouette Studio for full sensor registration.
5. If USB seek fails or firmware rejects TB commands, Studio + Cut SVG is the supported fallback.

## Bitmap engrave (K1)

Send to K1 → **Import raster → engrave G-code**: grayscale bidirectional GRBL scan with configurable DPI, min/max power (S), and speed. Then **Send to K1 (USB)** or experimental Wi‑Fi / Save .nc.

## Wi‑Fi send (K1)

Join the laser’s Wi‑Fi AP (many IKIER hubs use `192.168.4.1`). CutForge tries TCP port **8080** (LightBurn-style). USB remains primary. If network send is unavailable, **Save .nc (dry-run / TF)** and copy to the controller’s TF/SD card.

## Kerf / materials / estimate

- Path ops → Kerf offset (parallel outset/inset, undoable).
- Send to K1 → material starters + rough job time from G-code length÷feed.

## Run

```bash
npm install
npm run tauri:dev
npm run build && cd src-tauri && cargo check
```

## Still open

- Silhouette BLE; some Cameo firmware variants may need Studio for sensor cut
- Job estimate ignores accel/pierce; material numbers are starters only
- Wi‑Fi protocol varies by hub firmware — treat TCP send as experimental
