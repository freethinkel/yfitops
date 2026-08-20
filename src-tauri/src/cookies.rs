use tauri::{AppHandle, Manager};

/// Spotify's internal services take the token the web player gets in exchange
/// for its `sp_dc` cookie. The cookie lands on the webview during login, and
/// only Rust can read it back — to the frontend that domain is somebody else's.
///
/// Asked of the main window alone, and deliberately so. Every webview here
/// shares the default data store, so the cookie the login window leaves behind
/// is visible from this one too — while asking a window that is closing panics
/// the runtime outright: it answers such a request by dropping the reply
/// channel, and `cookies_for_url` unwraps the receive.
/// Spotify sets it on `.spotify.com`, and a cookie's domain covers its
/// subdomains — but `cookies_for_url` compares the two as plain strings, so
/// asking it about any concrete host filters this one out. Hence the whole
/// jar and the suffix match by hand.
fn spotify_domain(domain: Option<&str>) -> bool {
    domain
        .map(|domain| domain.trim_start_matches('.'))
        .is_some_and(|domain| domain == "spotify.com" || domain.ends_with(".spotify.com"))
}

#[tauri::command]
pub async fn spotify_cookie(app: AppHandle) -> Result<Option<String>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "no main window".to_string())?;

    let cookies = window.cookies().map_err(|err| err.to_string())?;

    Ok(cookies
        .into_iter()
        .find(|cookie| cookie.name() == "sp_dc" && spotify_domain(cookie.domain()))
        .map(|cookie| cookie.value().to_string()))
}

#[cfg(test)]
mod tests {
    use super::spotify_domain;

    #[test]
    fn matches_spotify_domains_only() {
        assert!(spotify_domain(Some(".spotify.com")));
        assert!(spotify_domain(Some("spotify.com")));
        assert!(spotify_domain(Some("open.spotify.com")));
        assert!(spotify_domain(Some("accounts.spotify.com")));

        assert!(!spotify_domain(Some("notspotify.com")));
        assert!(!spotify_domain(Some("spotify.com.evil.com")));
        assert!(!spotify_domain(None));
    }
}
