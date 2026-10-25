//! Experimental GRBL-over-TCP for IKIER-class Wi‑Fi hubs (often 192.168.4.1:8080).

use serde::Serialize;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TcpSendResult {
    pub host: String,
    pub port: u16,
    pub lines_sent: usize,
    pub message: String,
}

#[tauri::command]
pub fn grbl_tcp_send(
    host: String,
    port: u16,
    lines: Vec<String>,
) -> Result<TcpSendResult, String> {
    let addr = format!("{host}:{port}");
    let mut stream = TcpStream::connect_timeout(
        &addr
            .parse()
            .map_err(|e| format!("Bad address {addr}: {e}"))?,
        Duration::from_secs(5),
    )
    .map_err(|e| {
        format!(
            "TCP connect {addr} failed: {e}. Join the laser Wi‑Fi AP (often 192.168.4.1) and try port 8080. USB serial remains the reliable path."
        )
    })?;
    stream
        .set_write_timeout(Some(Duration::from_secs(10)))
        .ok();
    stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .ok();

    // Soft reset + metric absolute
    let _ = stream.write_all(&[0x18]);
    std::thread::sleep(Duration::from_millis(300));
    let preamble = b"M5\nG21\nG90\n";
    stream
        .write_all(preamble)
        .map_err(|e| format!("TCP write: {e}"))?;

    let mut sent = 0usize;
    for raw in &lines {
        let line = raw.trim();
        if line.is_empty() || line.starts_with(';') || line.starts_with('(') {
            continue;
        }
        let payload = format!("{line}\n");
        stream
            .write_all(payload.as_bytes())
            .map_err(|e| format!("TCP write line: {e}"))?;
        sent += 1;
        // Light pacing — hubs vary; drain any ok chatter
        let mut buf = [0u8; 128];
        let _ = stream.read(&mut buf);
    }
    let _ = stream.write_all(b"M5\n");
    let _ = stream.flush();

    Ok(TcpSendResult {
        host,
        port,
        lines_sent: sent,
        message: format!("Sent {sent} lines to {addr} (experimental Wi‑Fi)"),
    })
}
