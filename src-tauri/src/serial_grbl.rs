//! GRBL serial transport for IKIER K1 / diode lasers.
//! Safety: always attempt M5 (laser off) on cancel and disconnect.

use once_cell::sync::Lazy;
use serde::Serialize;
use serialport::{DataBits, FlowControl, Parity, StopBits};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

static CANCEL: AtomicBool = AtomicBool::new(false);
static PORT: Lazy<Mutex<Option<Box<dyn serialport::SerialPort>>>> =
    Lazy::new(|| Mutex::new(None));

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub port_name: String,
    pub kind: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub product: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SendProgress {
    pub sent: usize,
    pub total: usize,
    pub line: String,
    pub done: bool,
    pub cancelled: bool,
    pub error: Option<String>,
}

fn with_port_mut<R>(
    f: impl FnOnce(&mut Box<dyn serialport::SerialPort>) -> Result<R, String>,
) -> Result<R, String> {
    let mut guard = PORT.lock().map_err(|e| e.to_string())?;
    let port = guard.as_mut().ok_or_else(|| "Not connected".to_string())?;
    f(port)
}

fn laser_off_best_effort() {
    let _ = with_port_mut(|p| {
        let _ = p.write_all(b"M5\n");
        let _ = p.flush();
        Ok(())
    });
}

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports
        .into_iter()
        // Prefer cu.* over tty.* on macOS (caller still sees both filtered)
        .filter(|p| !p.port_name.starts_with("/dev/tty."))
        .map(|p| {
            let (kind, vid, pid, product) = match p.port_type {
                serialport::SerialPortType::UsbPort(u) => {
                    ("USB".into(), Some(u.vid), Some(u.pid), u.product)
                }
                serialport::SerialPortType::PciPort => ("PCI".into(), None, None, None),
                serialport::SerialPortType::BluetoothPort => {
                    ("Bluetooth".into(), None, None, None)
                }
                serialport::SerialPortType::Unknown => ("Unknown".into(), None, None, None)
            };
            PortInfo {
                port_name: p.port_name,
                kind,
                vid,
                pid,
                product,
            }
        })
        .collect())
}

#[tauri::command]
pub fn serial_connect(path: String, baud: u32) -> Result<String, String> {
    // Close existing first (with laser off)
    {
        let should_close = PORT.lock().map_err(|e| e.to_string())?.is_some();
        if should_close {
            laser_off_best_effort();
            let mut guard = PORT.lock().map_err(|e| e.to_string())?;
            *guard = None;
        }
    }

    let port = serialport::new(&path, baud)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(200))
        .open()
        .map_err(|e| format!("Open {path} failed: {e}"))?;

    let mut guard = PORT.lock().map_err(|e| e.to_string())?;
    *guard = Some(port);
    CANCEL.store(false, Ordering::SeqCst);

    // Wake GRBL / clear
    let _ = with_port_mut(|p| {
        let _ = p.write_all(&[0x18]); // soft-reset
        let _ = p.flush();
        Ok(())
    });
    std::thread::sleep(Duration::from_millis(500));
    let _ = drain_port(800);
    // Ensure laser off + metric absolute
    let _ = serial_write_raw("M5\nG21\nG90\n")?;
    Ok(format!("Connected {path} @ {baud}"))
}

#[tauri::command]
pub fn serial_disconnect() -> Result<(), String> {
    laser_off_best_effort();
    CANCEL.store(true, Ordering::SeqCst);
    let mut guard = PORT.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn serial_is_connected() -> Result<bool, String> {
    let guard = PORT.lock().map_err(|e| e.to_string())?;
    Ok(guard.is_some())
}

fn serial_write_raw(data: &str) -> Result<(), String> {
    with_port_mut(|p| {
        p.write_all(data.as_bytes())
            .map_err(|e| format!("Write failed: {e}"))?;
        p.flush().map_err(|e| format!("Flush failed: {e}"))?;
        Ok(())
    })
}

#[tauri::command]
pub fn serial_write_line(line: String) -> Result<String, String> {
    let payload = if line.ends_with('\n') {
        line
    } else {
        format!("{line}\n")
    };
    serial_write_raw(&payload)?;
    // Brief read for ok/status
    let resp = drain_port(300)?;
    Ok(resp)
}

fn drain_port(timeout_ms: u64) -> Result<String, String> {
    with_port_mut(|p| {
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        let mut buf = [0u8; 256];
        let mut out = String::new();
        while Instant::now() < deadline {
            match p.read(&mut buf) {
                Ok(0) => std::thread::sleep(Duration::from_millis(5)),
                Ok(n) => out.push_str(&String::from_utf8_lossy(&buf[..n])),
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => break,
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(5));
                }
                Err(e) => return Err(format!("Read failed: {e}")),
            }
            if out.contains("ok") || out.contains("error") || out.contains("ALARM") {
                break;
            }
        }
        Ok(out)
    })
}

fn wait_for_ok(timeout_ms: u64) -> Result<String, String> {
    with_port_mut(|p| {
        let deadline = Instant::now() + Duration::from_millis(timeout_ms);
        let mut buf = [0u8; 256];
        let mut out = String::new();
        while Instant::now() < deadline {
            match p.read(&mut buf) {
                Ok(n) if n > 0 => {
                    out.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if out.to_ascii_lowercase().contains("ok") {
                        return Ok(out);
                    }
                    if out.contains("error") || out.contains("ALARM") {
                        return Err(format!("GRBL: {}", out.trim()));
                    }
                }
                Ok(_) => std::thread::sleep(Duration::from_millis(2)),
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                    std::thread::sleep(Duration::from_millis(2));
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(2));
                }
                Err(e) => return Err(format!("Read failed: {e}")),
            }
        }
        if out.is_empty() {
            // Some firmwares are quiet; treat timeout with no error as soft ok
            Ok(String::new())
        } else if out.to_ascii_lowercase().contains("ok") {
            Ok(out)
        } else {
            Err(format!("Timeout waiting for ok: {}", out.trim()))
        }
    })
}

#[tauri::command]
pub fn serial_cancel_job() -> Result<(), String> {
    CANCEL.store(true, Ordering::SeqCst);
    // Feed hold then laser off (best-effort)
    let _ = serial_write_raw("!\n");
    std::thread::sleep(Duration::from_millis(50));
    laser_off_best_effort();
    let _ = serial_write_raw("\x18");
    Ok(())
}

#[tauri::command]
pub fn serial_home() -> Result<String, String> {
    CANCEL.store(false, Ordering::SeqCst);
    serial_write_raw("M5\n")?;
    serial_write_raw("$H\n")?;
    let resp = drain_port(5000)?;
    Ok(resp)
}

#[tauri::command]
pub fn serial_jog(dx_mm: f64, dy_mm: f64, feed: f64) -> Result<String, String> {
    // Relative jog, laser off
    let f = feed.max(100.0);
    let cmd = format!("M5\nG91\nG0 X{dx_mm:.3} Y{dy_mm:.3} F{f:.0}\nG90\n");
    serial_write_raw(&cmd)?;
    let resp = drain_port(2000)?;
    Ok(resp)
}

/// Stream G-code lines to the machine. Emits `grbl-progress` events.
#[tauri::command]
pub fn serial_send_gcode(app: AppHandle, lines: Vec<String>) -> Result<SendProgress, String> {
    CANCEL.store(false, Ordering::SeqCst);
    let total = lines.len();
    let mut sent = 0usize;

    // Ensure absolute mm, laser off before start
    serial_write_raw("M5\nG21\nG90\n")?;
    let _ = wait_for_ok(1000);

    for raw in lines {
        if CANCEL.load(Ordering::SeqCst) {
            laser_off_best_effort();
            let prog = SendProgress {
                sent,
                total,
                line: String::new(),
                done: true,
                cancelled: true,
                error: None,
            };
            let _ = app.emit("grbl-progress", &prog);
            return Ok(prog);
        }

        let line = raw.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('(') {
            sent += 1;
            continue;
        }

        serial_write_raw(&format!("{line}\n"))?;
        match wait_for_ok(30_000) {
            Ok(_) => {}
            Err(e) => {
                laser_off_best_effort();
                let prog = SendProgress {
                    sent,
                    total,
                    line: line.to_string(),
                    done: true,
                    cancelled: false,
                    error: Some(e.clone()),
                };
                let _ = app.emit("grbl-progress", &prog);
                return Err(e);
            }
        }
        sent += 1;
        if sent % 5 == 0 || sent == total {
            let prog = SendProgress {
                sent,
                total,
                line: line.to_string(),
                done: false,
                cancelled: false,
                error: None,
            };
            let _ = app.emit("grbl-progress", &prog);
        }
    }

    laser_off_best_effort();
    let _ = serial_write_raw("G0 X0 Y0\n");
    let prog = SendProgress {
        sent,
        total,
        line: String::new(),
        done: true,
        cancelled: false,
        error: None,
    };
    let _ = app.emit("grbl-progress", &prog);
    Ok(prog)
}
