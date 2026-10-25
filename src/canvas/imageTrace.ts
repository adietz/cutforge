import ImageTracer from 'imagetracerjs'

export type TraceMode = 'mono' | 'color'

export interface TraceControls {
  mode: TraceMode
  /** 0–255 style threshold for mono (mapped to palette) */
  threshold: number
  /** Discard small paths (imagetracer pathomit) */
  pathomit: number
  /** Curve / line tolerance — higher = simpler */
  simplify: number
  /** Color palette size when mode=color */
  colors: number
  blur: number
}

export const DEFAULT_TRACE: TraceControls = {
  mode: 'mono',
  threshold: 128,
  pathomit: 8,
  simplify: 1,
  colors: 8,
  blur: 0,
}

export function controlsToOptions(c: TraceControls): Record<string, unknown> {
  if (c.mode === 'mono') {
    return {
      colorsampling: 0,
      numberofcolors: 2,
      // force near-B/W palette via colorquant — threshold applied pre-process
      ltres: c.simplify,
      qtres: c.simplify,
      pathomit: c.pathomit,
      blurradius: c.blur,
      blurdelta: 64,
      strokewidth: 0,
      linefilter: false,
      viewbox: true,
      desc: false,
    }
  }
  return {
    colorsampling: 2,
    numberofcolors: Math.max(2, Math.min(64, c.colors)),
    ltres: c.simplify,
    qtres: c.simplify,
    pathomit: c.pathomit,
    blurradius: c.blur,
    blurdelta: 64,
    strokewidth: 0,
    viewbox: true,
    desc: false,
  }
}

/** Apply mono threshold to ImageData (in place). */
export function applyThreshold(imgd: ImageData, threshold: number): ImageData {
  const d = imgd.data
  const t = Math.max(0, Math.min(255, threshold))
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const v = g < t ? 0 : 255
    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255
  }
  return imgd
}

export async function fileToImageData(file: File): Promise<{
  imageData: ImageData
  width: number
  height: number
}> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return {
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    width: canvas.width,
    height: canvas.height,
  }
}

export function traceImageData(
  imageData: ImageData,
  controls: TraceControls,
): string {
  const copy = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  )
  if (controls.mode === 'mono') applyThreshold(copy, controls.threshold)
  const options = controlsToOptions(controls)
  return ImageTracer.imagedataToSVG(copy, options)
}

/** Scale SVG so its width fits targetWidthPx (document pixels). */
export function wrapScaledSvg(svg: string, targetWidthPx: number): string {
  // Inject / override width if possible; Paper importSVG uses viewBox when present
  if (/viewBox=/i.test(svg)) return svg
  return svg.replace(
    /<svg\b([^>]*)>/i,
    `<svg$1 width="${targetWidthPx}" height="auto">`,
  )
}
