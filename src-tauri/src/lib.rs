use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

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
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            for (_, window) in _app.webview_windows().iter() {
                window.unified_titlebar();
                window.fancy_titlebar();
                window.with_webview(|wv| enable_glass(&wv))?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![create_auth_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
