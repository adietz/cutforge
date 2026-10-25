import type { PagePreset } from '../types'

export interface RasterEngraveOptions {
  /** Target scan resolution (dots per inch) */
  dpi: number
  minPower: number
  maxPower: number
  /** Feed while engraving mm/min */
  speed: number
  travel: number
  /** Place image top-left at mm (canvas Y-down → machine Y-up flip) */
  originXmm?: number
  originYmm?: number
  /** Skip near-white pixels below this gray (0–255) */
  whiteThreshold?: number
  page: PagePreset
}

/**
 * Convert grayscale ImageData into GRBL raster-scan G-code (bidirectional).
 * Machine coords: mm, absolute, origin lower-left Y-up.
 */
export function rasterImageToGcode(
  imageData: ImageData,
  opts: RasterEngraveOptions,
): string {
  const {
    dpi,
    minPower,
    maxPower,
    speed,
    travel,
    page,
    whiteThreshold = 245,
  } = opts
  const pxPerMm = dpi / 25.4
  const wMm = imageData.width / pxPerMm
  const hMm = imageData.height / pxPerMm
  const ox = opts.originXmm ?? (page.widthMm - wMm) / 2
  // top of image in canvas Y-down → convert to machine Y-up later
  const topMm = opts.originYmm ?? (page.heightMm - hMm) / 2

  const lines: string[] = []
  lines.push('; CutForge bitmap engrave (GRBL raster scan)')
  lines.push(
    `; ${imageData.width}x${imageData.height}px @ ${dpi}dpi → ${wMm.toFixed(1)}x${hMm.toFixed(1)}mm`,
  )
  lines.push(`; Power S ${minPower}–${maxPower}, F${speed}`)
  lines.push('G21')
  lines.push('G90')
  lines.push('G94')
  lines.push('M5')
  lines.push(`G0 X0 Y0 F${Math.round(travel)}`)

  const data = imageData.data
  const w = imageData.width
  const h = imageData.height

  for (let row = 0; row < h; row++) {
    const yCanvasMm = topMm + row / pxPerMm
    const yMachine = page.heightMm - yCanvasMm
    const ltr = row % 2 === 0
    const cols = ltr
      ? Array.from({ length: w }, (_, i) => i)
      : Array.from({ length: w }, (_, i) => w - 1 - i)

    let runStart: number | null = null
    let runPower = 0

    const flush = (endCol: number) => {
      if (runStart == null) return
      const x0 = ox + runStart / pxPerMm
      const x1 = ox + endCol / pxPerMm
      lines.push('M5')
      lines.push(
        `G0 X${fmt(ltr ? x0 : x1)} Y${fmt(yMachine)} F${Math.round(travel)}`,
      )
      lines.push(`M4 S${Math.round(runPower)}`)
      lines.push(
        `G1 X${fmt(ltr ? x1 : x0)} Y${fmt(yMachine)} F${Math.round(speed)}`,
      )
      lines.push('M5')
      runStart = null
    }

    for (const col of cols) {
      const i = (row * w + col) * 4
      const gray =
        0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      // Darker → more power
      if (gray >= whiteThreshold) {
        flush(col)
        continue
      }
      const t = 1 - gray / 255
      const power = minPower + t * (maxPower - minPower)
      if (runStart == null) {
        runStart = col
        runPower = power
      } else if (Math.abs(power - runPower) > 40) {
        flush(col)
        runStart = col
        runPower = power
      }
    }
    if (runStart != null) flush(ltr ? w - 1 : 0)
  }

  lines.push('M5')
  lines.push(`G0 X0 Y0 F${Math.round(travel)}`)
  lines.push('M2')
  return lines.join('\n') + '\n'
}

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toFixed(3)
}

export async function fileToImageData(file: File): Promise<ImageData> {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  return ctx.getImageData(0, 0, c.width, c.height)
}
