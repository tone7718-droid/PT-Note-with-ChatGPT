/* ── AES 키를 OS 보안 저장소에 보관 ──
   localStorage 에 키를 두면 암호문과 같은 위치라 실질 보호가 안 되므로,
   데스크톱에서는 Windows 자격 증명 관리자 / macOS Keychain / Linux
   Secret Service 에 보관한다. 웹/모바일은 기존 localStorage 폴백. */

const KEYRING_SERVICE: &str = "pt-note3";
const KEYRING_ENTRY: &str = "enc-key-v1";

fn enc_key_entry() -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYRING_SERVICE, KEYRING_ENTRY).map_err(|e| e.to_string())
}

#[tauri::command]
fn keyring_get_enc_key() -> Result<Option<String>, String> {
  match enc_key_entry()?.get_password() {
    Ok(v) => Ok(Some(v)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn keyring_set_enc_key(value: String) -> Result<(), String> {
  enc_key_entry()?.set_password(&value).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![keyring_get_enc_key, keyring_set_enc_key])
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
    .expect("error while running tauri application");
}
