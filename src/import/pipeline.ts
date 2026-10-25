import { invoke, isTauri } from '@tauri-apps/api/core'
import { dxfToSvg } from './dxfImport'
import { formatByExtension, type ImportFormatInfo } from './formats'

export interface HelperStatus {
  inkscape: boolean
  pdftocairo: boolean
  ghostscript: boolean
  libreoffice: boolean
  notes: string[]
}

export interface ImportResult {
  svg: string
  sourceName: string
  tool: string
  message: string
  format?: ImportFormatInfo
}

export async function getHelperStatus(): Promise<HelperStatus> {
  if (!isTauri()) {
    return {
      inkscape: false,
      pdftocairo: false,
      ghostscript: false,
      libreoffice: false,
      notes: [
        'Browser mode: SVG and DXF import in pure JS. PDF / AI / CDR / EMF need the CutForge desktop app (LibreOffice / pdftocairo / Inkscape helpers), or export SVG from the source app.',
      ],
    }
  }
  return invoke<HelperStatus>('vector_helper_status')
}

export async function importVectorFile(
  file: File | { name: string; data: Uint8Array | ArrayBuffer | string },
): Promise<ImportResult> {
  const name = file.name
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const format = formatByExtension(ext)

  let bytes: Uint8Array
  let text: string | null = null
  if (file instanceof File) {
    if (ext === 'svg' || ext === 'dxf') {
      text = await file.text()
      bytes = new TextEncoder().encode(text)
    } else {
      bytes = new Uint8Array(await file.arrayBuffer())
      if (ext === 'svg' || looksLikeText(bytes)) {
        text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      }
    }
  } else if (typeof file.data === 'string') {
    text = file.data
    bytes = new TextEncoder().encode(text)
  } else {
    bytes =
      file.data instanceof Uint8Array
        ? file.data
        : new Uint8Array(file.data)
    if (ext === 'svg' || ext === 'dxf' || looksLikeText(bytes)) {
      text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    }
  }

  // SVGZ: gunzip if magic
  if (ext === 'svgz') {
    const svg = await inflateSvgz(bytes)
    return {
      svg,
      sourceName: name,
      tool: 'pure-js (svgz)',
      message: 'Decompressed SVGZ',
      format,
    }
  }

  if (ext === 'svg' && text) {
    return {
      svg: text,
      sourceName: name,
      tool: 'pure-js',
      message: 'SVG imported directly',
      format,
    }
  }

  if (ext === 'dxf' && text) {
    const { svg, pathCount } = dxfToSvg(text)
    return {
      svg,
      sourceName: name,
      tool: 'pure-js (dxf-parser)',
      message: `DXF → SVG (${pathCount} paths)`,
      format,
    }
  }

  // Helper path (Tauri)
  if (isTauri()) {
    const result = await invoke<{
      svg: string
      tool: string
      message: string
    }>('convert_vector_to_svg', {
      filename: name,
      data: Array.from(bytes),
    })
    return {
      svg: result.svg,
      sourceName: name,
      tool: result.tool,
      message: result.message,
      format,
    }
  }

  // Browser fallback for PDF-based AI: not available
  const label = format?.label || ext.toUpperCase()
  throw new Error(
    `${label} import needs the CutForge desktop app (uses LibreOffice / pdftocairo / Ghostscript / Inkscape). ` +
      `In the source app, export SVG or PDF and import that — or open this file in the desktop build.`,
  )
}

function looksLikeText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 64)
  let printable = 0
  for (let i = 0; i < n; i++) {
    const b = bytes[i]
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable++
  }
  return printable / n > 0.85
}

async function inflateSvgz(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('SVGZ needs DecompressionStream or desktop app')
  }
  const ds = new DecompressionStream('gzip')
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const stream = new Blob([ab]).stream().pipeThrough(ds)
  const buf = await new Response(stream).arrayBuffer()
  return new TextDecoder().decode(buf)
}
