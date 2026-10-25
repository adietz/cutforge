import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface PortInfo {
  portName: string
  kind: string
  vid: number | null
  pid: number | null
  product: string | null
}

export interface SendProgress {
  sent: number
  total: number
  line: string
  done: boolean
  cancelled: boolean
  error: string | null
}

export function serialAvailable(): boolean {
  return isTauri()
}

export async function listSerialPorts(): Promise<PortInfo[]> {
  if (!isTauri()) return []
  return invoke<PortInfo[]>('list_serial_ports')
}

export async function serialConnect(path: string, baud: number): Promise<string> {
  return invoke('serial_connect', { path, baud })
}

export async function serialDisconnect(): Promise<void> {
  return invoke('serial_disconnect')
}

export async function serialIsConnected(): Promise<boolean> {
  if (!isTauri()) return false
  return invoke<boolean>('serial_is_connected')
}

export async function serialWriteLine(line: string): Promise<string> {
  return invoke('serial_write_line', { line })
}

export async function serialCancelJob(): Promise<void> {
  return invoke('serial_cancel_job')
}

export async function serialHome(): Promise<string> {
  return invoke('serial_home')
}

export async function serialJog(
  dxMm: number,
  dyMm: number,
  feed: number,
): Promise<string> {
  return invoke('serial_jog', { dxMm, dyMm, feed })
}

export async function serialSendGcode(lines: string[]): Promise<SendProgress> {
  return invoke('serial_send_gcode', { lines })
}

export async function onGrblProgress(
  cb: (p: SendProgress) => void,
): Promise<UnlistenFn> {
  return listen<SendProgress>('grbl-progress', (e) => cb(e.payload))
}


export interface TcpSendResult {
  host: string
  port: number
  linesSent: number
  message: string
}

/** Experimental IKIER / GRBL hub Wi‑Fi (often 192.168.4.1:8080). */
export async function grblTcpSend(
  host: string,
  port: number,
  lines: string[],
): Promise<TcpSendResult> {
  return invoke<TcpSendResult>('grbl_tcp_send', { host, port, lines })
}
