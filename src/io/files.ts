import { isTauri } from '@tauri-apps/api/core'

export type FileKind = 'cutforge' | 'svg' | 'dxf' | 'gcode'

const FILTERS: Record<FileKind, { name: string; extensions: string[] }> = {
  cutforge: { name: 'CutForge Project', extensions: ['cutforge', 'json'] },
  svg: { name: 'SVG', extensions: ['svg'] },
  dxf: { name: 'DXF', extensions: ['dxf'] },
  gcode: { name: 'G-code', extensions: ['nc', 'gcode', 'gc'] },
}

function browserDownload(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function browserOpenText(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      resolve({ name: file.name, text: await file.text() })
    }
    input.click()
  })
}

/** Open a text file via Tauri dialog or browser picker. */
export async function openTextFile(
  kind: FileKind,
): Promise<{ path: string | null; name: string; text: string } | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const selected = await open({
      multiple: false,
      filters: [FILTERS[kind]],
      title: `Open ${FILTERS[kind].name}`,
    })
    if (!selected || Array.isArray(selected)) return null
    const text = await readTextFile(selected)
    const name = selected.split(/[/\\]/).pop() || selected
    return { path: selected, name, text }
  }
  const accept =
    kind === 'cutforge'
      ? '.cutforge,application/json'
      : kind === 'svg'
        ? '.svg,image/svg+xml'
        : kind === 'gcode'
          ? '.nc,.gcode,.gc,text/plain'
          : '.dxf'
  const file = await browserOpenText(accept)
  if (!file) return null
  return { path: null, name: file.name, text: file.text }
}

/** Save text via Tauri save dialog or browser download. */
export async function saveTextFile(
  kind: FileKind,
  defaultName: string,
  text: string,
  existingPath?: string | null,
): Promise<{ path: string | null; name: string } | null> {
  const mime =
    kind === 'svg'
      ? 'image/svg+xml'
      : kind === 'dxf'
        ? 'application/dxf'
        : kind === 'gcode'
          ? 'text/plain'
          : 'application/json'

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const path =
      existingPath ||
      (await save({
        defaultPath: defaultName,
        filters: [FILTERS[kind]],
        title: `Save ${FILTERS[kind].name}`,
      }))
    if (!path) return null
    await writeTextFile(path, text)
    const name = path.split(/[/\\]/).pop() || defaultName
    return { path, name }
  }

  browserDownload(defaultName, text, mime)
  return { path: null, name: defaultName }
}
