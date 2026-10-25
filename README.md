# CutForge

Vector design for **laser** (IKIER K1 / GRBL diode) and **Silhouette**.  
**Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.7.0)

- Editor: tools, snap, booleans, layers, undo, `.cutforge` projects
- Text → outlines (OFL fonts) · image tracing
- **Send to K1** — generate GRBL G-code and stream over USB serial (bypasses LightBurn)
- Machine file export (SVG/DXF) still available; LightBurn is **optional**
- Page presets including IKIER K1 **410×410 mm**

## Send to IKIER K1 (v0.7)

Top bar → **Send to K1** (desktop app only).

1. Plug the K1 via **USB Type-C**.
2. **Refresh ports** → select the serial device → baud **115200** → **Connect**.
3. Optional: **Home** (`$H` if enabled on the controller), **Jog** (laser stays off).
4. Set Cut / Score / Engrave **speed** (mm/min) and **power** (GRBL `S`, usually 0–1000).
5. Preview G-code · **Save .nc** dry-run · or **Send job**.
6. **Cancel / laser off** or disconnect always attempts **M5**.

### G-code conventions

| | |
|--|--|
| Units | mm (`G21`), absolute (`G90`) |
| Origin | Page **lower-left**, **Y-up** (canvas Y-down is flipped) |
| Cut | Vector `G1` with `M4 S…` |
| Score | Same, lower default power / higher speed |
| Engrave | Horizontal hatch fill (spacing configurable); open paths stroke |
| End | `M5`, optional return to `X0 Y0`, `M2` |

**Safety:** wear eye protection / follow your laser’s rules. Defaults are starting
points only — **calibrate on scrap**. Cancel and disconnect command laser off.

### Platform notes

| | |
|--|--|
| **Works** | CutForge **Tauri** desktop (Windows / macOS / Linux) |
| **Not in v0.7** | Browser `npm run dev` serial (preview + save `.nc` only) · Wi‑Fi / vendor app |
| Linux | User in `dialout` (or `uucp`) group for `/dev/ttyUSB*` / `ttyACM*` |
| macOS | Allow USB accessories; prefer `/dev/cu.*` |
| Windows | Install CH340 / CP210x drivers if the port is missing |

## File export (optional)

**Export file** → machine profiles (IKIER K1 SVG/DXF, Silhouette hairline SVG,
LightBurn colors, Glowforge). Use if you still want LightBurn/LaserGRBL/Studio.

## Run

```bash
cd cutforge
npm install
npm run dev          # web UI (no serial send)
npm run tauri:dev    # desktop with USB serial
npm run tauri:build
```

## Layout

```
src/machine/     G-code + serial bridge
src/export/      SVG / DXF / profiles
src-tauri/src/serial_grbl.rs   GRBL serial (list/connect/stream/cancel)
```

## Limits

- No Wi‑Fi / IKIER app bridge
- Engrave hatch is simple (not adaptive/bitmap)
- Homing requires GRBL hard-limits / `$H` enabled
- Power scale assumes GRBL `$30≈1000` — adjust presets to your firmware
