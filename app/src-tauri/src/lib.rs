use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{DragDropEvent, Manager, WindowEvent};

/// Paths the user physically dropped onto the window (collected from the
/// native drag-drop event). `read_file_base64` only serves these (or email
/// files) — the webview never gets an arbitrary-read primitive.
#[derive(Default)]
struct DroppedPaths(Mutex<HashSet<PathBuf>>);

/// Reflect the open-issue count onto the tray icon: the number as a title
/// (shown on macOS) plus a descriptive tooltip (all platforms).
#[tauri::command]
fn set_open_count(app: tauri::AppHandle, count: i64) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(if count > 0 { count.to_string() } else { String::new() }));
        let _ = tray.set_tooltip(Some(format!("ToDoList — {count} open")));
    }
}

/// Read a dropped file's bytes (base64) so the frontend can parse/attach it.
/// The OS drag only hands us a path, and the webview can't read arbitrary
/// paths itself.
#[tauri::command]
fn read_file_base64(path: String, dropped: tauri::State<DroppedPaths>) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    // Defense in depth: this is reachable from the webview, so only serve
    // email file types (importable without a drop, e.g. via file picker paths
    // from the drag event) or paths the user actually dropped onto the window
    // — never an arbitrary read.
    let lower = path.to_lowercase();
    let is_email = lower.ends_with(".eml") || lower.ends_with(".msg");
    let was_dropped = dropped
        .0
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?
        .contains(std::path::Path::new(&path));
    if !(is_email || was_dropped) {
        return Err("unsupported file type".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

/// Read a stored attachment's bytes (base64) — bounded to the attachments
/// dir via `safe_rel`. Used to render pasted images inline in Markdown.
#[tauri::command]
fn read_attachment_base64(app: tauri::AppHandle, rel_path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    safe_rel(&rel_path)?;
    let path = attachments_dir(&app)?.join(&rel_path);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
}

/// The on-disk directory for attachment bytes: `<appDataDir>/attachments`.
fn attachments_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Reject anything that could escape the attachments dir. `rel_path` is always
/// an id we generated, but this is cheap defense in depth.
fn safe_rel(rel: &str) -> Result<(), String> {
    if rel.is_empty() || rel.contains('/') || rel.contains('\\') || rel.contains("..") {
        return Err("invalid attachment path".into());
    }
    Ok(())
}

/// Decode base64 file bytes and write them to `<appData>/attachments/<id>`.
/// Returns the stored relative path (the id). Storing bytes on disk keeps the
/// SQLite DB small and avoids loading whole files into memory to list them.
#[tauri::command]
fn save_attachment(app: tauri::AppHandle, id: String, data: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    safe_rel(&id)?;
    let bytes = STANDARD.decode(data.as_bytes()).map_err(|e| e.to_string())?;
    let path = attachments_dir(&app)?.join(&id);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(id)
}

/// Copy a stored attachment to a user-chosen destination. The save dialog is
/// opened here in Rust — the webview never supplies a destination path, so a
/// compromised frontend can't use this as an arbitrary-write primitive.
/// Returns false when the user cancelled the dialog. (async so the blocking
/// dialog runs off the main thread.)
#[tauri::command]
async fn export_attachment(app: tauri::AppHandle, rel_path: String, filename: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    safe_rel(&rel_path)?;
    let src = attachments_dir(&app)?.join(&rel_path);
    if !src.exists() {
        return Err("attachment file is missing".into());
    }
    // Default the dialog to the attachment's real (base) name.
    let name = std::path::Path::new(&filename)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("attachment");
    let Some(dest) = app.dialog().file().set_file_name(name).blocking_save_file() else {
        return Ok(false); // dialog cancelled
    };
    let dest = dest.into_path().map_err(|e| e.to_string())?;
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Open a stored attachment with the OS default program. The bytes on disk are
/// named by a bare id (no extension), so the default-app association can't be
/// resolved from them directly — copy to a temp file that keeps the original
/// filename (hence its extension), then hand that to the opener.
#[tauri::command]
fn open_attachment(app: tauri::AppHandle, rel_path: String, filename: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    safe_rel(&rel_path)?;
    let src = attachments_dir(&app)?.join(&rel_path);
    if !src.exists() {
        return Err("attachment file is missing".into());
    }
    // Keep only the base name so a crafted filename can't redirect the copy.
    let name = std::path::Path::new(&filename)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("attachment");
    let dir = std::env::temp_dir().join("todolist-open");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(name);
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dest.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Remove an attachment's bytes from disk. Missing file is not an error so a
/// stale row can always be cleaned up.
#[tauri::command]
fn delete_attachment_file(app: tauri::AppHandle, rel_path: String) -> Result<(), String> {
    safe_rel(&rel_path)?;
    let path = attachments_dir(&app)?.join(&rel_path);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

const QUICK_ADD_FLAG: &str = "--quick-add";

/// Whether this process was launched with the quick-add flag (e.g. from an
/// OS-assigned shortcut on a `… ToDoList.exe --quick-add` launcher). The
/// frontend reads this once at startup to jump straight into a new task.
#[tauri::command]
fn launched_quick_add() -> bool {
    std::env::args().any(|a| a == QUICK_ADD_FLAG)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Work around a WebKitGTK/Wayland DMABUF-renderer bug (KWin and others) that
    // crashes the app with "Error 71 (Protocol error) dispatching to Wayland
    // display". Must be set before the webview initializes. Only applied if the
    // user/launcher hasn't already set it, so it stays overridable.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let mut builder = tauri::Builder::default();

    // Single instance must be the first plugin: a second launch (e.g. the OS
    // shortcut firing while we're already running) focuses the existing window
    // instead of spawning a duplicate that would fight over the SQLite file.
    #[cfg(desktop)]
    {
        use tauri::Emitter;
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            show_main_window(app);
            if argv.iter().any(|a| a == QUICK_ADD_FLAG) {
                let _ = app.emit("quick-add", ());
            }
        }));
        // Auto-update: checks GitHub releases (latest.json) from the frontend;
        // process plugin provides the relaunch after install.
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // No migrations — the frontend creates the schema on first connect.
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(DroppedPaths::default())
        .invoke_handler(tauri::generate_handler![
            set_open_count,
            read_file_base64,
            read_attachment_base64,
            launched_quick_add,
            save_attachment,
            export_attachment,
            open_attachment,
            delete_attachment_file
        ])
        .setup(|app| {
            // The DB lives at app_data_dir/todolist.db (an absolute path passed
            // from JS). The sql plugin won't create that dir for an absolute
            // path, so ensure it exists before the first connection.
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&dir);
            }

            // Tray icon: reuses the app icon, exposes a Show/Quit menu, and is
            // kept alive across window closes so the app lives in the background.
            let show = MenuItem::with_id(app, "show", "Show ToDoList", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("ToDoList")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Note: on Linux (libappindicator) click events are never
                    // delivered — the menu is the only way in there, hence the
                    // platform-specific left-click behavior below.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            // Linux: left-click can't run our handler, so open the menu (which
            // has "Show ToDoList"). Elsewhere: left-click shows the window
            // directly, menu stays on right-click.
            #[cfg(target_os = "linux")]
            let tray = tray.show_menu_on_left_click(true);
            #[cfg(not(target_os = "linux"))]
            let tray = tray.show_menu_on_left_click(false);

            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Close button hides to tray instead of quitting; real quit is
                // the tray's Quit item. Keeps the open-count badge available in
                // the background.
                WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                // Remember what was actually dropped so read_file_base64 can
                // verify the frontend only reads user-dropped files.
                WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                    if let Ok(mut set) = window.app_handle().state::<DroppedPaths>().0.lock() {
                        set.extend(paths.iter().cloned());
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_rel_accepts_a_plain_id() {
        assert!(safe_rel("a1b2c3d4-uuid").is_ok());
    }

    #[test]
    fn safe_rel_rejects_empty_separators_and_traversal() {
        assert!(safe_rel("").is_err());
        assert!(safe_rel("a/b").is_err());
        assert!(safe_rel("a\\b").is_err());
        assert!(safe_rel("..").is_err());
        assert!(safe_rel("../secret").is_err());
    }
}
