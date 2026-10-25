import { invoke, isTauri } from '@tauri-apps/api/core'

export interface SilhouetteDeviceInfo {
  vendorId: number
  productId: number
  name: string
  bus: number
  address: number
}

export function silhouetteUsbAvailable(): boolean {
  return isTauri()
}

export async function listSilhouetteDevices(): Promise<SilhouetteDeviceInfo[]> {
  if (!isTauri()) return []
  return invoke<SilhouetteDeviceInfo[]>('list_silhouette_devices')
}

export async function silhouetteSendGpgl(
  vendorId: number,
  productId: number,
  data: string,
): Promise<string> {
  return invoke('silhouette_send_gpgl', { vendorId, productId, data })
}
