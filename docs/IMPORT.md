# CutForge vector import (v1.2)

## Pure JavaScript (works in browser + desktop)

| Format | How |
|--------|-----|
| **SVG / SVGZ** | Paper.js `importSVG`. Stroke/fill hues → cut types. |
| **DXF** | `dxf-parser` → SVG (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, SPLINE approx). |

## Desktop helpers (Tauri)

CutForge shells out to tools on your PATH when you import binary / proprietary formats:

| Format | Preferred tools |
|--------|-----------------|
| **PDF**, **AI** (PDF-based) | `pdftocairo` (poppler-utils) → SVG; else LibreOffice Draw |
| **EPS / PS**, legacy **AI** | Ghostscript (`gs`) → PDF → pdftocairo; else LibreOffice / Inkscape |
| **CDR / CMX** (CorelDRAW) | LibreOffice Draw (**libcdr** filter); **Inkscape** if installed |
| **EMF / WMF** | LibreOffice Draw; Inkscape preferred when available |

### Install helpers (Linux example)

```bash
# Debian/Ubuntu
sudo apt install poppler-utils ghostscript libreoffice-draw inkscape
```

macOS: Homebrew `poppler ghostscript libreoffice inkscape`.  
Windows: install LibreOffice + optional Inkscape; Poppler/Ghostscript recommended for PDF/EPS.

### Without helpers

In Illustrator / CorelDRAW / etc.: **Export → SVG** or **PDF**, then Import that file. SVG is always the most reliable path.

## Color → cut type

| Color (approx) | Cut type |
|----------------|----------|
| Red | cut |
| Blue / cyan | score (LightBurn convention) |
| Orange / yellow | score |
| Black / gray | engrave |
| Magenta / purple | print |

Adjust types in the inspector after import.
