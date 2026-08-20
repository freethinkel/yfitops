use tauri::{AppHandle, Manager, Url};

/// Spotify's internal services take the token the web player gets in exchange
/// for its `sp_dc` cookie. The cookie lands on the webview during login, and
/// only Rust can read it back — to the frontend that domain is somebody else's.
///
/// Every window is searched rather than just the main one: the login happens in
/// a window of its own, and whether the two share a cookie store is a platform
/// detail, not a promise.
#[tauri::command]
pub async fn spotify_cookie(app: AppHandle) -> Result<Option<String>, String> {
    let url = Url::parse("https://open.spotify.com").map_err(|err| err.to_string())?;

    for (_, window) in app.webview_windows().iter() {
        let cookies = match window.cookies_for_url(url.clone()) {
            Ok(cookies) => cookies,
            Err(_) => continue,
        };

        if let Some(cookie) = cookies.into_iter().find(|cookie| cookie.name() == "sp_dc") {
            return Ok(Some(cookie.value().to_string()));
        }
    }

    Ok(None)
}
