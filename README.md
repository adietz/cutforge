# CutForge

Vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js**.

## Features (v0.8.0)

- Editor, snap, booleans, text→outlines, image tracing, machine file export
- **Send to K1** — USB serial G-code with denser/angled/cross-hatch engrave fills
- **Send to Silhouette** — USB GPGL to Cameo / Portrait (open Graphtec protocol)
- SVG/DXF export remains; LightBurn optional

## Engrave fills (K1)

In **Send to K1**, Engrave paths that are **closed** are filled with hatch lines:

| Control | Default | Notes |
|---------|---------|--------|
| Hatch mm | 0.2 | Line spacing (denser = smaller) |
| Angle ° | 0 | 0 = horizontal |
| Cross-hatch | off | Second pass at angle+90° |

Cut and Score stay pure vectors. Cancel / disconnect still commands **M5**.

## Send to Silhouette (USB)

Top bar → **Send to Silhouette** (desktop app).

1. Plug Cameo / Portrait via USB → **Refresh**
2. Set speed/pressure per Cut / Score / Engrave
3. Preview GPGL → **Save .gpgl** or **Send to cutter**

**Mapping:** Cut → blade · Score → light blade (kiss) · Engrave → pen/draw (`FC0`).

**Models (USB VID `0x0b4d`, plus Cameo 5 Alpha `0x3844`):** Cameo 1–5 / Plus / Pro,
Portrait 1–4 (same family as [inkscape-silhouette](https://github.com/fablabnbg/inkscape-silhouette)).

| Platform | Notes |
|----------|--------|
| Linux | udev rule for `0b4d` or add user to `lp`; may need to detach usblp |
| macOS | Allow USB accessories when prompted |
| Windows | libusb via WinUSB/Zadig may be required; Studio cannot hold the device |
| Browser | Preview + save dump only — no USB |
| Bluetooth | Not in v0.8 |

**Fallback:** export SVG / GPGL dump and use Silhouette Studio or inkscape-silhouette.

## Send to IKIER K1

See v0.7 docs: serial 115200, mm absolute, origin lower-left Y-up. Desktop only.

## Run

```bash
npm install
npm run tauri:dev    # USB features
npm run build && cd src-tauri && cargo check
```

## Limits

- Silhouette send is a pragmatic GPGL subset (no reg-mark seek, no BLE)
- Engrave hatch is scanline-based (not bitmap)
- No Wi‑Fi machine links
