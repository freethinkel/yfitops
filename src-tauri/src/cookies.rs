use tauri::{AppHandle, Manager, Url};

/// Spotify's internal services take the token the web player gets in exchange
/// for its `sp_dc` cookie. The cookie lands on the webview during login, and
/// only Rust can read it back — to the frontend that domain is somebody else's.
///
/// Asked of the main window alone, and deliberately so. Every webview here
/// shares the default data store, so the cookie the login window leaves behind
/// is visible from this one too — while asking a window that is closing panics
/// the runtime outright: it answers such a request by dropping the reply
/// channel, and `cookies_for_url` unwraps the receive.
#[tauri::command]
pub async fn spotify_cookie(app: AppHandle) -> Result<Option<String>, String> {
    let url = Url::parse("https://open.spotify.com").map_err(|err| err.to_string())?;

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "no main window".to_string())?;

    let cookies = window
        .cookies_for_url(url)
        .map_err(|err| err.to_string())?;

    Ok(cookies
        .into_iter()
        .find(|cookie| cookie.name() == "sp_dc")
        .map(|cookie| cookie.value().to_string()))
}
