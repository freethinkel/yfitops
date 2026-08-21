use std::collections::HashMap;

use base64::Engine;
use regex::Regex;
use serde::Serialize;

const WEB_PLAYER_URL: &str = "https://open.spotify.com/";
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

#[derive(Serialize)]
pub struct Secret {
    secret: String,
    version: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleMeta {
    /// Operation name → persisted query hash.
    hashes: HashMap<String, String>,
    /// Newest first, the way the player itself reads them.
    secrets: Vec<Secret>,
    /// Chunk id → the name part of its filename.
    chunks: HashMap<String, String>,
    /// Chunk id → the content hash part of its filename.
    chunk_hashes: HashMap<String, String>,
    /// Empty when the page did not state one; the frontend has a fallback.
    version: String,
}

/// The bundle's filename carries a content hash, not a version — the page
/// states the version itself, in the base64 config it hands the player.
fn version_of(html: &str) -> String {
    let Ok(re) = Regex::new(r#"id="appServerConfig"[^>]*>([^<]+)<"#) else {
        return String::new();
    };

    let Some(raw) = re.captures(html).map(|caps| caps[1].to_string()) else {
        return String::new();
    };

    let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(raw) else {
        return String::new();
    };

    serde_json::from_slice::<serde_json::Value>(&decoded)
        .ok()
        .and_then(|config| config["clientVersion"].as_str().map(str::to_string))
        .unwrap_or_default()
}

/// `{4406:"xpui-routes-search",...}` → the pairs inside it. Both chunk maps are
/// written that way, and differ only in what leads up to the brace.
fn id_map(source: &str, around: &str) -> HashMap<String, String> {
    let Some(block) = Regex::new(around)
        .ok()
        .and_then(|re| re.captures(source).map(|caps| caps[1].to_string()))
    else {
        return HashMap::new();
    };

    let Ok(entry) = Regex::new(r#""?(\d+)"?:"([^"]+)""#) else {
        return HashMap::new();
    };

    entry
        .captures_iter(&block)
        .map(|caps| (caps[1].to_string(), caps[2].to_string()))
        .collect()
}

fn secrets_of(source: &str) -> Vec<Secret> {
    let quoted = r#"(?:'[^']*'|"(?:[^"\\]|\\.)*")"#;
    let entry = format!(r#"\{{secret:({quoted}),version:(\d+)\}}"#);

    let Some(block) = Regex::new(&format!(r#"\[{entry}(?:,{entry})*\]"#))
        .ok()
        .and_then(|re| re.find(source).map(|found| found.as_str().to_string()))
    else {
        return Vec::new();
    };

    let Ok(re) = Regex::new(&entry) else {
        return Vec::new();
    };

    re.captures_iter(&block)
        .filter_map(|caps| {
            let raw = &caps[1];
            // single quotes carry the text as it stands; only the JSON form of
            // the two needs unescaping
            let secret = if raw.starts_with('\'') {
                raw[1..raw.len() - 1].to_string()
            } else {
                serde_json::from_str::<String>(raw).ok()?
            };

            Some(Secret {
                secret,
                version: caps[2].parse().ok()?,
            })
        })
        .collect()
}

/// The player's main bundle carries every persisted query hash, the TOTP
/// secrets and the chunk maps at once — a few megabytes to keep a few hundred
/// bytes of. Read here rather than in the webview: the plugin hands a body over
/// in chunks, one round trip through the IPC each, and that was some five
/// hundred of them for a file nothing but this ever looks at.
#[tauri::command]
pub async fn web_player_meta() -> Result<BundleMeta, String> {
    let client = reqwest::Client::new();

    let html = client
        .get(WEB_PLAYER_URL)
        .header("user-agent", USER_AGENT)
        .send()
        .await
        .map_err(|err| format!("web player page: {err}"))?
        .text()
        .await
        .map_err(|err| format!("web player page: {err}"))?;

    let bundle_url =
        Regex::new(r"https://open\.spotifycdn\.com/cdn/build/web-player/web-player\.[\w-]+\.js")
            .map_err(|err| err.to_string())?
            .find(&html)
            .ok_or("Web player bundle not found")?
            .as_str()
            .to_string();

    let bundle = client
        .get(&bundle_url)
        .header("user-agent", USER_AGENT)
        .send()
        .await
        .map_err(|err| format!("web player bundle: {err}"))?
        .text()
        .await
        .map_err(|err| format!("web player bundle: {err}"))?;

    let hashes: HashMap<String, String> =
        Regex::new(r#"\.l\("([a-zA-Z0-9_]+)","(?:query|mutation)","([0-9a-f]{64})""#)
            .map_err(|err| err.to_string())?
            .captures_iter(&bundle)
            .map(|caps| (caps[1].to_string(), caps[2].to_string()))
            .collect();

    if hashes.is_empty() {
        return Err("No persisted queries in the bundle".into());
    }

    Ok(BundleMeta {
        hashes,
        secrets: secrets_of(&bundle),
        chunks: id_map(&bundle, r#"\.u=e=>""\+\(+\{([^}]+)\}"#),
        chunk_hashes: id_map(&bundle, r#"\)\[e\]\|\|e\)\+"\."\+\(+\{([^}]+)\}"#),
        version: version_of(&html),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // the shapes the bundle writes these in, and nothing else from it
    const BUNDLE: &str = concat!(
        r#"x.l("home","query","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),"#,
        r#"y.l("addToPlaylist","mutation","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),"#,
        r#"[{secret:',7/*F("rL',version:61},{secret:"a\"b",version:60}],"#,
        r#"n.u=e=>""+(({4406:"xpui-routes-search",17:"xpui-routes-track"})[e]||e)+"."+({4406:"deadbeef",17:"cafe1234"})[e]+".js""#,
    );

    #[test]
    fn reads_what_the_player_keeps_in_its_bundle() {
        let hashes: HashMap<String, String> =
            Regex::new(r#"\.l\("([a-zA-Z0-9_]+)","(?:query|mutation)","([0-9a-f]{64})""#)
                .unwrap()
                .captures_iter(BUNDLE)
                .map(|caps| (caps[1].to_string(), caps[2].to_string()))
                .collect();

        assert_eq!(hashes.len(), 2);
        assert_eq!(hashes["home"].len(), 64);

        let secrets = secrets_of(BUNDLE);
        assert_eq!(secrets.len(), 2);
        // newest first, and the single-quoted form keeps its punctuation
        assert_eq!(secrets[0].version, 61);
        assert_eq!(secrets[0].secret, r#",7/*F("rL"#);
        // the JSON form is the only one with anything to unescape
        assert_eq!(secrets[1].secret, r#"a"b"#);

        let chunks = id_map(BUNDLE, r#"\.u=e=>""\+\(+\{([^}]+)\}"#);
        assert_eq!(chunks["4406"], "xpui-routes-search");

        let hashed = id_map(BUNDLE, r#"\)\[e\]\|\|e\)\+"\."\+\(+\{([^}]+)\}"#);
        assert_eq!(hashed["17"], "cafe1234");
    }

    #[test]
    fn takes_the_version_off_the_page_and_not_off_a_filename() {
        let config = base64::engine::general_purpose::STANDARD
            .encode(r#"{"market":"RU","clientVersion":"1.2.99.21.gb8bef2a9-development"}"#);
        let html = format!(r#"<script id="appServerConfig" type="text/plain">{config}</script>"#);

        assert_eq!(version_of(&html), "1.2.99.21.gb8bef2a9-development");
        assert_eq!(version_of("<html>nothing here</html>"), "");
    }
}
