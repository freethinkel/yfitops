use std::{
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};

use librespot_connect::{ConnectConfig, LoadRequest, LoadRequestOptions, PlayingTrack, Spirc};
use librespot_core::{
    authentication::Credentials, cache::Cache, config::SessionConfig, token::Token, Session,
};
use librespot_playback::{
    audio_backend,
    config::{AudioFormat, PlayerConfig, VolumeCtrl},
    mixer::{softmixer::SoftMixer, Mixer, MixerConfig},
    player::Player,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// The same identity the app already presents to the gateway — see
/// `src/lib/shared/api/pathfinder.ts`.
const CLIENT_ID: &str = "d8a5ed958d274c2e8ee717e6a4b0971d";
const CLIENT_TOKEN_URL: &str = "https://clienttoken.spotify.com/v1/clienttoken";
const WEB_PLAYER_VERSION: &str = "1.2.98.104.ga2fc9a0c-development";

/// Port 4070 is filtered on some networks; 443 always answers.
const AP_PORT: u16 = 443;
const CLIENT_TOKEN_TTL: Duration = Duration::from_secs(1_209_600);
const TOKEN_TTL: Duration = Duration::from_secs(3_000);

#[derive(Default)]
pub struct PlayerHandle(Mutex<Option<Spirc>>, Mutex<Option<Arc<Player>>>);

#[derive(Serialize, Clone)]
struct PlayerEventPayload {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position_ms: Option<u32>,
}

fn token_of(access_token: String, ttl: Duration) -> Token {
    Token {
        access_token,
        expires_in: ttl,
        token_type: "Bearer".to_string(),
        scopes: vec![],
        timestamp: SystemTime::now(),
    }
}

/// librespot asks for this one with a protobuf describing a native client,
/// which our client id refuses. The JSON form of the same endpoint takes the
/// browser profile the app already uses, so we fetch it and hand it over.
async fn fetch_client_token(device_id: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "client_data": {
            "client_version": WEB_PLAYER_VERSION,
            "client_id": CLIENT_ID,
            "js_sdk_data": {
                "device_brand": "Apple",
                "device_model": "unknown",
                "os": "macos",
                "os_version": "10.15.7",
                "device_id": device_id,
                "device_type": "computer",
            }
        }
    });

    let response: serde_json::Value = reqwest::Client::new()
        .post(CLIENT_TOKEN_URL)
        .header("accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json()
        .await
        .map_err(|err| err.to_string())?;

    response["granted_token"]["token"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("client token refused: {response}"))
}

/// Starts playback for this session and returns the device id — the queue is
/// still edited over Connect, which addresses devices by it. Safe to call
/// again: an existing device is shut down first, which is what happens when
/// the access token is renewed.
#[tauri::command]
pub async fn player_start(app: AppHandle, token: String, name: String) -> Result<String, String> {
    if let Some(spirc) = app.state::<PlayerHandle>().0.lock().unwrap().take() {
        let _ = spirc.shutdown();
    }

    let mut config = SessionConfig::default();
    config.client_id = CLIENT_ID.to_string();
    config.ap_port = Some(AP_PORT);

    let cache = Cache::new(
        Some(app.path().app_cache_dir().map_err(|err| err.to_string())?),
        None,
        None,
        None,
    )
    .map_err(|err| err.to_string())?;

    let session = Session::new(config, Some(cache));
    let device_id = session.device_id().to_string();

    let client_token = fetch_client_token(&device_id).await?;
    session
        .spclient()
        .set_client_token(token_of(client_token, CLIENT_TOKEN_TTL));

    // login5 would refuse this token for being issued to another client, but
    // the token itself is good — Spirc only ever needed it to call spclient
    session
        .login5()
        .set_auth_token(token_of(token.clone(), TOKEN_TTL));

    // Playback stays at full scale and the system mixer is what the volume is
    // set with. Left to itself librespot starts at half, which its logarithmic
    // mapping turns into about three percent — quiet enough to read as broken.
    let mixer = Arc::new(
        SoftMixer::open(MixerConfig {
            volume_ctrl: VolumeCtrl::Fixed,
            ..Default::default()
        })
        .map_err(|err| err.to_string())?,
    );
    let volume = mixer.get_soft_volume();
    let backend = audio_backend::find(None).ok_or("no audio backend")?;

    let player = Player::new(PlayerConfig::default(), session.clone(), volume, move || {
        backend(None, AudioFormat::default())
    });

    let mut events = player.get_player_event_channel();
    let emitter = app.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let Some(payload) = to_payload(&event) {
                let _ = emitter.emit("player-event", payload);
            }
        }
    });

    let config = ConnectConfig {
        name,
        initial_volume: u16::MAX,
        // the mixer is fixed anyway, so a remote slider would only lie
        disable_volume: true,
        ..Default::default()
    };

    let (spirc, task) = Spirc::new(
        config,
        session,
        Credentials::with_access_token(token),
        player.clone(),
        mixer,
    )
    .await
    .map_err(|err| err.to_string())?;

    tauri::async_runtime::spawn(task);

    let handle = app.state::<PlayerHandle>();
    *handle.0.lock().unwrap() = Some(spirc);
    *handle.1.lock().unwrap() = Some(player);

    Ok(device_id)
}

fn to_payload(event: &librespot_playback::player::PlayerEvent) -> Option<PlayerEventPayload> {
    use librespot_playback::player::PlayerEvent::*;

    let (kind, uri, position_ms) = match event {
        Playing {
            track_id,
            position_ms,
            ..
        } => ("playing", Some(track_id.to_uri()), Some(*position_ms)),
        Paused {
            track_id,
            position_ms,
            ..
        } => ("paused", Some(track_id.to_uri()), Some(*position_ms)),
        Stopped { track_id, .. } => ("stopped", Some(track_id.to_uri()), None),
        TrackChanged { audio_item } => ("track", Some(audio_item.track_id.to_uri()), None),
        Seeked {
            track_id,
            position_ms,
            ..
        } => ("seeked", Some(track_id.to_uri()), Some(*position_ms)),
        PositionCorrection {
            track_id,
            position_ms,
            ..
        } => ("position", Some(track_id.to_uri()), Some(*position_ms)),
        EndOfTrack { .. } => ("end", None, None),
        _ => return None,
    };

    Some(PlayerEventPayload {
        kind: kind.to_string(),
        uri: uri.and_then(|uri| uri.ok()),
        position_ms,
    })
}

fn with_spirc<T>(app: &AppHandle, run: impl FnOnce(&Spirc) -> Result<T, librespot_core::Error>) -> Result<T, String> {
    let handle = app.state::<PlayerHandle>();
    let guard = handle.0.lock().unwrap();
    let spirc = guard.as_ref().ok_or("player is not running")?;

    run(spirc).map_err(|err| err.to_string())
}

/// Straight to the player, not through Spirc: its task handles commands in one
/// queue together with its network chatter, so a pause could sit behind a
/// `connect-state` request and arrive audibly late. Spirc keeps up either way —
/// it tracks playback by the player's own events.
fn with_player(
    app: &AppHandle,
    run: impl FnOnce(&Player),
) -> Result<(), String> {
    let handle = app.state::<PlayerHandle>();
    let guard = handle.1.lock().unwrap();
    let player = guard.as_ref().ok_or("player is not running")?;

    run(player);

    Ok(())
}

#[tauri::command]
pub fn player_play(app: AppHandle) -> Result<(), String> {
    with_player(&app, |player| player.play())
}

#[tauri::command]
pub fn player_pause(app: AppHandle) -> Result<(), String> {
    with_player(&app, |player| player.pause())
}

#[tauri::command]
pub fn player_next(app: AppHandle) -> Result<(), String> {
    with_spirc(&app, |spirc| spirc.next())
}

#[tauri::command]
pub fn player_previous(app: AppHandle) -> Result<(), String> {
    with_spirc(&app, |spirc| spirc.prev())
}

#[tauri::command]
pub fn player_seek(app: AppHandle, position_ms: u32) -> Result<(), String> {
    with_spirc(&app, |spirc| spirc.set_position_ms(position_ms))
}

#[tauri::command]
pub fn player_set_volume(app: AppHandle, volume: u16) -> Result<(), String> {
    with_spirc(&app, |spirc| spirc.set_volume(volume))
}

#[tauri::command]
pub fn player_set_shuffle(app: AppHandle, shuffle: bool) -> Result<(), String> {
    with_spirc(&app, |spirc| spirc.shuffle(shuffle))
}

/// "off" | "context" | "track" — the three states the UI cycles through.
#[tauri::command]
pub fn player_set_repeat(app: AppHandle, mode: String) -> Result<(), String> {
    with_spirc(&app, |spirc| {
        spirc.repeat_track(mode == "track")?;
        spirc.repeat(mode == "context")
    })
}

/// A registered device stays passive until something selects it, and Spirc
/// drops every load that arrives before that. Playing from our own UI is that
/// selection — but only then, so launching the app does not snatch playback
/// away from a phone.
fn activated(spirc: &Spirc) -> Result<(), librespot_core::Error> {
    spirc.activate()
}

/// Plays a playlist, album or artist by uri, optionally starting at a position.
#[tauri::command]
pub fn player_load_context(app: AppHandle, uri: String, index: Option<u32>) -> Result<(), String> {
    let options = LoadRequestOptions {
        start_playing: true,
        playing_track: index.map(PlayingTrack::Index),
        ..Default::default()
    };

    with_spirc(&app, |spirc| {
        activated(spirc)?;
        spirc.load(LoadRequest::from_context_uri(uri.clone(), options))
    })
}

/// Plays a bare list of tracks — liked songs have no context uri of their own.
#[tauri::command]
pub fn player_load_tracks(app: AppHandle, uris: Vec<String>, index: Option<u32>) -> Result<(), String> {
    let options = LoadRequestOptions {
        start_playing: true,
        playing_track: index.map(PlayingTrack::Index),
        ..Default::default()
    };

    with_spirc(&app, |spirc| {
        activated(spirc)?;
        spirc.load(LoadRequest::from_tracks(uris.clone(), options))
    })
}
