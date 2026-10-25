//! Silhouette / Graphtec USB send (GPGL).
//! Protocol adapted from inkscape-silhouette (GPL-2) / robocut ideas:
//! VID 0x0b4d (Graphtec), bulk OUT 0x01, bulk IN 0x82, commands end with 0x03.

use rusb::{Context, DeviceHandle, Direction, TransferType, UsbContext};
use serde::Serialize;
use std::time::Duration;

const VENDOR_GRAPHTEC: u16 = 0x0b4d;
const VENDOR_CAMEO5ALPHA: u16 = 0x3844;
const TIMEOUT: Duration = Duration::from_millis(5000);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SilhouetteDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: String,
    pub bus: u8,
    pub address: u8,
}

fn known_name(vid: u16, pid: u16) -> String {
    match (vid, pid) {
        (0x0b4d, 0x1121) => "Silhouette Cameo".into(),
        (0x0b4d, 0x112b) => "Silhouette Cameo 2".into(),
        (0x0b4d, 0x112f) => "Silhouette Cameo 3".into(),
        (0x0b4d, 0x1137) => "Silhouette Cameo 4".into(),
        (0x0b4d, 0x1138) => "Silhouette Cameo 4 Plus".into(),
        (0x0b4d, 0x1139) => "Silhouette Cameo 4 Pro".into(),
        (0x0b4d, 0x1140) => "Silhouette Cameo 5".into(),
        (0x0b4d, 0x1141) => "Silhouette Cameo 5 Plus".into(),
        (0x0b4d, 0x1123) => "Silhouette Portrait".into(),
        (0x0b4d, 0x1132) => "Silhouette Portrait 2".into(),
        (0x0b4d, 0x113a) => "Silhouette Portrait 3".into(),
        (0x0b4d, 0x113f) => "Silhouette Portrait 4".into(),
        (0x3844, 0x0001) => "Silhouette Cameo 5 Alpha".into(),
        (0x3844, 0x0002) => "Silhouette Cameo 5 Alpha Plus".into(),
        (v, p) => format!("Graphtec/Silhouette 0x{v:04x}:0x{p:04x}"),
    }
}

#[tauri::command]
pub fn list_silhouette_devices() -> Result<Vec<SilhouetteDeviceInfo>, String> {
    let ctx = Context::new().map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for device in ctx.devices().map_err(|e| e.to_string())?.iter() {
        let desc = match device.device_descriptor() {
            Ok(d) => d,
            Err(_) => continue,
        };
        let vid = desc.vendor_id();
        let pid = desc.product_id();
        if vid != VENDOR_GRAPHTEC && vid != VENDOR_CAMEO5ALPHA {
            continue;
        }
        out.push(SilhouetteDeviceInfo {
            vendor_id: vid,
            product_id: pid,
            name: known_name(vid, pid),
            bus: device.bus_number(),
            address: device.address(),
        });
    }
    Ok(out)
}

fn open_device(vid: u16, pid: u16) -> Result<DeviceHandle<Context>, String> {
    let ctx = Context::new().map_err(|e| e.to_string())?;
    let mut found = None;
    for device in ctx.devices().map_err(|e| e.to_string())?.iter() {
        let desc = device.device_descriptor().map_err(|e| e.to_string())?;
        if desc.vendor_id() == vid && desc.product_id() == pid {
            found = Some(device);
            break;
        }
    }
    let device = found.ok_or_else(|| format!("Device {vid:04x}:{pid:04x} not found"))?;
    let handle = device.open().map_err(|e| {
        format!(
            "Open failed: {e}. On Linux you may need udev rules or dialout/lp group; on macOS grant USB access."
        )
    })?;

    // Detach kernel driver on Linux if present
    if handle.kernel_driver_active(0).unwrap_or(false) {
        let _ = handle.detach_kernel_driver(0);
    }
    handle
        .claim_interface(0)
        .map_err(|e| format!("claim_interface(0): {e}"))?;

    // Find bulk OUT endpoint (prefer 0x01)
    let _ = find_bulk_out(&handle).ok_or_else(|| "No bulk OUT endpoint".to_string())?;
    Ok(handle)
}

fn find_bulk_out<T: UsbContext>(handle: &DeviceHandle<T>) -> Option<u8> {
    let device = handle.device();
    let config = device.active_config_descriptor().ok()?;
    for interface in config.interfaces() {
        for desc in interface.descriptors() {
            for ep in desc.endpoint_descriptors() {
                if ep.transfer_type() == TransferType::Bulk
                    && ep.direction() == Direction::Out
                {
                    return Some(ep.address());
                }
            }
        }
    }
    Some(0x01) // fallback common Graphtec endpoint
}

fn find_bulk_in<T: UsbContext>(handle: &DeviceHandle<T>) -> u8 {
    let device = handle.device();
    if let Ok(config) = device.active_config_descriptor() {
        for interface in config.interfaces() {
            for desc in interface.descriptors() {
                for ep in desc.endpoint_descriptors() {
                    if ep.transfer_type() == TransferType::Bulk
                        && ep.direction() == Direction::In
                    {
                        return ep.address();
                    }
                }
            }
        }
    }
    0x82
}

fn write_all(handle: &DeviceHandle<Context>, data: &[u8]) -> Result<(), String> {
    let ep = find_bulk_out(handle).unwrap_or(0x01);
    let mut offset = 0;
    const CHUNK: usize = 1024;
    while offset < data.len() {
        let end = (offset + CHUNK).min(data.len());
        // Prefer ending on ETX boundary inside chunk
        let mut chunk_end = end;
        if end < data.len() {
            if let Some(rel) = data[offset..end].iter().rposition(|&b| b == 0x03) {
                chunk_end = offset + rel + 1;
            }
        }
        let written = handle
            .write_bulk(ep, &data[offset..chunk_end], TIMEOUT)
            .map_err(|e| format!("USB write: {e}"))?;
        if written == 0 {
            return Err("USB write returned 0 bytes".into());
        }
        offset += written;
        // Light pace so we don't overrun buffer
        std::thread::sleep(Duration::from_millis(5));
    }
    Ok(())
}

fn read_status(handle: &DeviceHandle<Context>) -> Result<String, String> {
    let ep_out = find_bulk_out(handle).unwrap_or(0x01);
    let ep_in = find_bulk_in(handle);
    // ESC ENQ
    let _ = handle.write_bulk(ep_out, &[0x1b, 0x05], TIMEOUT);
    let mut buf = [0u8; 64];
    match handle.read_bulk(ep_in, &mut buf, Duration::from_millis(1500)) {
        Ok(n) => Ok(String::from_utf8_lossy(&buf[..n]).to_string()),
        Err(_) => Ok(String::new()),
    }
}

/// Send a GPGL command stream (already ETX-delimited ASCII).
/// When `wait_regmark` is true, allow up to ~40s for optical seek (TB123/TB23).
#[tauri::command]
pub fn silhouette_send_gpgl(
    vendor_id: u16,
    product_id: u16,
    data: String,
    wait_regmark: Option<bool>,
) -> Result<String, String> {
    let handle = open_device(vendor_id, product_id)?;
    let _ = handle.write_bulk(
        find_bulk_out(&handle).unwrap_or(0x01),
        &[0x1b, 0x04],
        TIMEOUT,
    );
    std::thread::sleep(Duration::from_millis(200));
    let _ = read_status(&handle);

    let seeking = wait_regmark.unwrap_or(false)
        || data.contains("TB123")
        || data.contains("TB23");

    write_all(&handle, data.as_bytes())?;

    // Longer poll when optical registration may be running
    let polls = if seeking { 160 } else { 40 }; // ~40s vs ~10s
    let mut last = String::new();
    for _ in 0..polls {
        last = read_status(&handle).unwrap_or_default();
        if last.contains('0') {
            break;
        }
        // Moving / unloaded while seeking
        std::thread::sleep(Duration::from_millis(250));
    }

    let _ = handle.release_interface(0);
    let note = if seeking {
        format!(" (reg-mark seek; last status {:?})", last.trim())
    } else {
        String::new()
    };
    Ok(format!(
        "Sent {} bytes to {}{}",
        data.len(),
        known_name(vendor_id, product_id),
        note
    ))
}
