# CutForge

Daily-driver vector design for **IKIER K1** (GRBL diode laser) and **Silhouette** cutters.  
**Tauri 2 + React + TypeScript + Paper.js** · **v1.7.0**

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

## Job pause / resume / cancel (K1)

While **Send to K1 (USB)** is running, use **Pause** / **Resume** / **Cancel/Stop**:

| Control | GRBL | Effect |
|--------|------|--------|
| Pause | `!` (feed hold) | Stops motion; laser mode blanks the diode |
| Resume | `~` (cycle start) | Continues the held job |
| Cancel | `!` → `M5` → soft-reset `0x18` → `M5` | Laser off, buffer cleared |

**Caveats:** Pause/resume is USB serial only (Wi‑Fi send is a one-shot stream). After a long pause, verify work origin before Resume. Cancel soft-resets GRBL — start a fresh job afterward; do not expect mid-job resume after Cancel.

## Machine profiles

**Machine → Edit profiles…** (or the profile dropdown in K1 / Silhouette panels).

Each profile stores: name, type (laser GRBL / Silhouette), bed W×H mm, origin corner, USB baud or Wi‑Fi host:port, notes. Selecting **Save & apply** sets the document bed size and connection defaults. Seeded: **IKIER K1 USB**, **IKIER K1 Wi‑Fi**, **Silhouette Cameo 4**. Stored in `localStorage`.


## Nest / Materials / Import

See Help and `docs/IMPORT.md`.


## Shape editing (Corel-like)

- **Shape tool (`A`)** or **double-click** a path: edit nodes (vertices + bezier handles).
- **Add node:** double-click a segment (inserts at the nearest point on that edge).
- **Delete node:** double-click a node, or select node(s) + Delete; also via right-click.
- **Move:** drag nodes (Shift+click multi-select). Drag white handles for curves.
- **To line / To curve / Cusp / Smooth / Break / Join:** right-click menu (Shape mode).
- Select tool still uses transform box; corner/edge handles resize both smaller and larger (trackpad-safe).

## Install from GitHub Releases

Prebuilt installers are published at:

**https://github.com/adietz/cutforge/releases**

Tag a version (`v1.6.0`, …) or run the **Release** workflow; GitHub Actions builds:

| OS | Download |
|----|----------|
| **macOS** (Apple Silicon / Intel) | `.dmg` (or `.app.tar.gz`) |
| **Windows** | NSIS `*-setup.exe` (and/or `.msi`) |
| **Linux** | `.AppImage` and/or `.deb` |

### Unsigned builds (v1)

CI does **not** sign with an Apple Developer ID or a Windows Authenticode certificate yet. That is expected for this release line:

- **macOS Gatekeeper** — first open may say the app is damaged / can’t be opened. Right‑click → **Open**, or remove the quarantine flag:  
  `xattr -cr /Applications/CutForge.app`  
  (or on the `.dmg` / extracted app). An Apple Developer account + notarization will remove this later.
- **Windows SmartScreen** — “Windows protected your PC”. Choose **More info** → **Run anyway**.
- **Linux** — mark AppImage executable: `chmod +x CutForge_*.AppImage`, then run it. `.deb` installs with `sudo dpkg -i …`.

### Local desktop build

```bash
npm install
npm run tauri:build
# artifacts under src-tauri/target/release/bundle/
```

Linux needs WebKitGTK 4.1 and friends (`libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf`, …). See the Release workflow for the exact apt list.

## Develop / run from source

```bash
npm install
npm run tauri:dev
npm run build && cd src-tauri && cargo check
```
