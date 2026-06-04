use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

/// Reflect the open-issue count onto the tray icon: the number as a title
/// (shown on macOS) plus a descriptive tooltip (all platforms).
#[tauri::command]
fn set_open_count(app: tauri::AppHandle, count: i64) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(if count > 0 { count.to_string() } else { String::new() }));
        let _ = tray.set_tooltip(Some(format!("ToDoList — {count} open")));
    }
}

/// Read a dropped file's bytes (base64) so the frontend can parse it. Used for
/// dragging `.eml` / `.msg` email files onto the window — the OS drag only
/// hands us a path, and the webview can't read arbitrary paths itself.
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    // Defense in depth: this is reachable from the webview, so restrict it to
    // the email file types the drop handler imports — not an arbitrary read.
    let lower = path.to_lowercase();
    if !(lower.ends_with(".eml") || lower.ends_with(".msg")) {
        return Err("unsupported file type".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(bytes))
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
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:todolist.db",
                    vec![
                        tauri_plugin_sql::Migration {
                            version: 1,
                            description: "initial schema",
                            sql: include_str!("../migrations/001_initial.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 2,
                            description: "manual sort order",
                            sql: include_str!("../migrations/002_sort_order.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 3,
                            description: "email source metadata",
                            sql: include_str!("../migrations/003_email_source.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                        tauri_plugin_sql::Migration {
                            version: 4,
                            description: "settings key-value store",
                            sql: include_str!("../migrations/004_settings.sql"),
                            kind: tauri_plugin_sql::MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_open_count, read_file_base64, launched_quick_add])
        .setup(|app| {
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
            // Close button hides to tray instead of quitting; real quit is the
            // tray's Quit item. Keeps the open-count badge available in background.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
