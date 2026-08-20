use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

mod cookies;
mod player;
#[cfg(target_os = "macos")]
mod notification;
#[cfg(target_os = "macos")]
mod window_decorations;

#[cfg(target_os = "macos")]
use window_decorations::WindowExt;

#[derive(Serialize, Deserialize, Clone)]
pub struct OnNavigationPayload {
    pub url: String,
    pub label: String,
}

#[tauri::command]
fn create_auth_window(app: AppHandle, uri: String, label: String, title: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|err| err.to_string())?;
        return Ok(());
    }

    let url = Url::parse(&uri).map_err(|err| err.to_string())?;
    let emit_handle = app.clone();
    let emit_label = label.clone();

    let window = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
        .on_navigation(move |url| {
            let _ = emit_handle.emit(
                "change_navigation_url",
                OnNavigationPayload {
                    url: url.to_string(),
                    label: emit_label.clone(),
                },
            );

            true
        })
        .build()
        .map_err(|err| err.to_string())?;

    window.set_title(&title).map_err(|err| err.to_string())?;

    Ok(())
}

/// Private WebKit API: without `useSystemAppearance` the webview ignores
/// `-apple-visual-effect`, so the glass materials never render.
#[cfg(target_os = "macos")]
fn enable_glass(webview: &tauri::webview::PlatformWebview) {
    use cocoa::base::{id, nil, YES};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};

    unsafe {
        let wv = webview.inner() as id;
        let config: id = msg_send![wv, configuration];
        let prefs: id = msg_send![config, preferences];

        let key = NSString::alloc(nil).init_str("useSystemAppearance");
        let value: id = msg_send![class!(NSNumber), numberWithBool: YES];

        // an unknown key raises NSUnknownKeyException on older WebKit builds
        let result = objc_exception::r#try(|| {
            let _: () = msg_send![prefs, setValue: value forKey: key];
        });

        if result.is_err() {
            eprintln!("yfitops: useSystemAppearance is missing in this WebKit build");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Called from the mini player once its window exists: it keeps the titlebar
/// for the rounded corners and drops only the buttons.
#[tauri::command]
fn hide_window_buttons(_app: AppHandle, _label: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window = _app
            .get_webview_window(&_label)
            .ok_or_else(|| format!("no window labelled {_label}"))?;

        window.hide_buttons();
    }

    Ok(())
}

/// The console is reachable in release too — through the Help menu and the
/// right-click menu — so this has to work outside debug builds, which is what
/// the `devtools` feature on tauri buys.
#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

pub fn run() {
    // librespot reports what it is doing through `log`, and without a logger
    // a failing player is silent — set RUST_LOG=librespot=debug to hear it
    env_logger::init();

    tauri::Builder::default()
        .manage(player::PlayerHandle::default())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|_app| {
            // the config marks the window `create: false` and it is built here
            // instead, so the macOS titlebar work below runs against a window
            // that already exists
            let config = _app.config().app.windows[0].clone();
            WebviewWindowBuilder::from_config(_app, &config)?.build()?;

            #[cfg(target_os = "macos")]
            for (_, window) in _app.webview_windows().iter() {
                window.unified_titlebar();
                window.fancy_titlebar();
                window.with_webview(|wv| enable_glass(&wv))?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_auth_window,
            cookies::spotify_cookie,
            player::player_start,
            player::player_play_pause,
            player::player_next,
            player::player_previous,
            player::player_seek,
            player::player_set_volume,
            player::player_set_shuffle,
            player::player_set_repeat,
            player::player_load_context,
            player::player_load_tracks,
            hide_window_buttons,
            toggle_devtools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
