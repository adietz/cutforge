mod serial_grbl;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      serial_grbl::list_serial_ports,
      serial_grbl::serial_connect,
      serial_grbl::serial_disconnect,
      serial_grbl::serial_is_connected,
      serial_grbl::serial_write_line,
      serial_grbl::serial_cancel_job,
      serial_grbl::serial_home,
      serial_grbl::serial_jog,
      serial_grbl::serial_send_gcode,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building CutForge");
}
