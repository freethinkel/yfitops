use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime},
};

use librespot_connect::{
    ConnectConfig, LoadContextOptions, LoadRequest, LoadRequestOptions, Options as ContextOptions,
    PlayingTrack, Spirc,
};
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
/// Only until the frontend has read the player's page once — see
/// `webPlayerVersion` in `src/lib/shared/api/pathfinder.ts`, which is where the
/// real one comes from. clienttoken refuses a version far enough behind, and
/// answers something that is not a version with a 400 and an empty body.
const WEB_PLAYER_VERSION_FALLBACK: &str = "1.2.98.104.ga2fc9a0c-development";

/// Port 4070 is filtered on some networks; 443 always answers.
const AP_PORT: u16 = 443;
const CLIENT_TOKEN_TTL: Duration = Duration::from_secs(1_209_600);

/// What was last handed to Spirc. Jumping to a track means loading the same
/// thing again and naming the track to start from — Spirc has no "skip to" of
/// its own, and going through Connect for it takes a round trip.
enum Loaded {
    Tracks(Vec<String>),
    Context(String),
}

/// What the interface has shuffle and repeat set to. Spirc resets both on
/// every load — `handle_load` starts with `reset_options`, and only the
/// options that arrive with the request put them back — so each load has to
/// carry them along or a skip would quietly turn shuffle off.
#[derive(Default, Clone, Copy)]
struct PlayOptions {
    shuffle: bool,
    repeat: bool,
    repeat_track: bool,
}

impl PlayOptions {
    fn load(&self, track: Option<PlayingTrack>, seek_to: u32) -> LoadRequestOptions {
        LoadRequestOptions {
            start_playing: true,
            playing_track: track,
            seek_to,
            context_options: Some(LoadContextOptions::Options(ContextOptions {
                shuffle: self.shuffle,
                repeat: self.repeat,
                repeat_track: self.repeat_track,
            })),
        }
    }
}

#[derive(Default)]
pub struct PlayerHandle(
    Mutex<Option<Spirc>>,
    Mutex<Option<Arc<Player>>>,
    Mutex<Option<Loaded>>,
    /// Bumped once per session. A session shut down to make room for the next
    /// one finishes its task afterwards, and without this it would clear the
    /// handles of the session that replaced it.
    AtomicU64,
    /// Kept so a renewed access token can be handed over without building a
    /// new session around it.
    Mutex<Option<Session>>,
    Mutex<PlayOptions>,
);

#[derive(Serialize, Clone)]
struct PlayerEventPayload {
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    uri: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position_ms: Option<u32>,
    /// Only on "options": what Spirc has shuffle and repeat set to. Everything
    /// else leaves them out, and the interface keeps what it had.
    #[serde(skip_serializing_if = "Option::is_none")]
    shuffle: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    repeat_mode: Option<u8>,
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
async fn fetch_client_token(device_id: &str, version: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "client_data": {
            "client_version": version,
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

    let answer = reqwest::Client::new()
        .post(CLIENT_TOKEN_URL)
        .header("accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    // a refusal comes back empty, and parsing that would say only that the
    // body could not be decoded — the status is the whole of what it tells us
    let status = answer.status();
    let body = answer.text().await.map_err(|err| err.to_string())?;
    let response: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| format!("client token refused: {status}"))?;

    response["granted_token"]["token"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("client token refused: {response}"))
}

/// Starts playback for this session and returns the device id — the queue is
/// still edited over Connect, which addresses devices by it. Safe to call
/// again: an existing device is shut down first. `expires_in` is how long the
/// access token has left, in seconds; a renewal afterwards goes through
/// `player_set_token` rather than through here.
#[tauri::command]
pub async fn player_start(
    app: AppHandle,
    token: String,
    expires_in: u64,
    version: String,
    name: String,
) -> Result<String, String> {
    let generation = {
        let handle = app.state::<PlayerHandle>();

        if let Some(spirc) = handle.0.lock().unwrap().take() {
            let _ = spirc.shutdown();
        }

        // whatever is left below belongs to the session just shut down: an
        // early return would leave it installed, and every command against a
        // stopped player would answer Ok
        *handle.1.lock().unwrap() = None;
        *handle.2.lock().unwrap() = None;
        *handle.4.lock().unwrap() = None;

        handle.3.fetch_add(1, Ordering::Relaxed) + 1
    };

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

    let client_token = fetch_client_token(
        &device_id,
        if version.is_empty() {
            WEB_PLAYER_VERSION_FALLBACK
        } else {
            &version
        },
    )
    .await?;
    session
        .spclient()
        .set_client_token(token_of(client_token, CLIENT_TOKEN_TTL));

    // login5 would refuse this token for being issued to another client, but
    // the token itself is good — Spirc only ever needed it to call spclient.
    // The lifetime has to be the real one: login5 serves the cached token
    // until it says it has expired, and an overstated one is served dead
    session
        .login5()
        .set_auth_token(token_of(token.clone(), Duration::from_secs(expires_in)));

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

    let player = Player::new(
        PlayerConfig::default(),
        session.clone(),
        volume,
        move || backend(None, AudioFormat::default()),
    );

    let mut events = player.get_player_event_channel();
    let emitter = app.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            // shutting a session down stops its player, and the stop is
            // reported like any other — arriving after the session that
            // replaced it, it would speak for a track nobody is on any more
            if emitter.state::<PlayerHandle>().3.load(Ordering::Relaxed) != generation {
                break;
            }

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
        session.clone(),
        Credentials::with_access_token(token),
        player.clone(),
        mixer,
    )
    .await
    .map_err(|err| err.to_string())?;

    // the access point drops the connection sooner or later, and Spirc ends
    // with it — every command after that hits a closed channel, so the
    // frontend is told to start a fresh session
    let gone = app.clone();

    tauri::async_runtime::spawn(async move {
        task.await;

        let handle = gone.state::<PlayerHandle>();
        if handle.3.load(Ordering::Relaxed) != generation {
            return;
        }

        *handle.0.lock().unwrap() = None;
        *handle.1.lock().unwrap() = None;
        *handle.4.lock().unwrap() = None;

        let _ = gone.emit("player-gone", ());
    });

    let handle = app.state::<PlayerHandle>();
    *handle.0.lock().unwrap() = Some(spirc);
    *handle.1.lock().unwrap() = Some(player);
    *handle.4.lock().unwrap() = Some(session);

    Ok(device_id)
}

/// The access token the app runs on lasts an hour and the session outlives it.
/// Without this every spclient call — metadata, CDN urls, audio keys — starts
/// answering 401 the moment it lapses.
#[tauri::command]
pub fn player_set_token(app: AppHandle, token: String, expires_in: u64) -> Result<(), String> {
    let handle = app.state::<PlayerHandle>();
    let guard = handle.4.lock().unwrap();
    let session = guard.as_ref().ok_or("session is not running")?;

    session
        .login5()
        .set_auth_token(token_of(token, Duration::from_secs(expires_in)));

    Ok(())
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
        Loading {
            track_id,
            position_ms,
            ..
        } => ("loading", Some(track_id.to_uri()), Some(*position_ms)),
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
        // Spirc is the one that knows: a load resets both, a transfer brings
        // somebody else's settings along, and the interface guessed until now
        ShuffleChanged { shuffle } => {
            return Some(PlayerEventPayload {
                kind: "options".to_string(),
                uri: None,
                position_ms: None,
                shuffle: Some(*shuffle),
                repeat_mode: None,
            })
        }
        RepeatChanged { context, track } => {
            return Some(PlayerEventPayload {
                kind: "options".to_string(),
                uri: None,
                position_ms: None,
                shuffle: None,
                repeat_mode: Some(if *track {
                    2
                } else if *context {
                    1
                } else {
                    0
                }),
            })
        }
        _ => return None,
    };

    Some(PlayerEventPayload {
        kind: kind.to_string(),
        uri: uri.and_then(|uri| uri.ok()),
        position_ms,
        shuffle: None,
        repeat_mode: None,
    })
}

fn with_spirc<T>(
    app: &AppHandle,
    run: impl FnOnce(&Spirc) -> Result<T, librespot_core::Error>,
) -> Result<T, String> {
    let handle = app.state::<PlayerHandle>();
    let guard = handle.0.lock().unwrap();
    let spirc = guard.as_ref().ok_or("spirc is not running")?;

    run(spirc).map_err(|err| err.to_string())
}

/// Straight to the player, not through Spirc: its task handles commands in one
/// queue together with its network chatter, so a pause could sit behind a
/// `connect-state` request and arrive audibly late. Spirc keeps up either way —
/// it tracks playback by the player's own events.
fn with_player(app: &AppHandle, run: impl FnOnce(&Player)) -> Result<(), String> {
    let handle = app.state::<PlayerHandle>();
    let guard = handle.1.lock().unwrap();
    let player = guard.as_ref().ok_or("player is not running")?;

    run(player);

    Ok(())
}

/// The player hears it first, so the sound reacts at once; Spirc is told after
/// so its own idea of the state keeps up. Without the second call it stays
/// convinced playback is paused, and the next track it loads is told not to
/// start playing.
#[tauri::command]
pub fn player_play(app: AppHandle) -> Result<(), String> {
    with_player(&app, |player| player.play())?;

    with_spirc(&app, |spirc| {
        // another device may have taken playback since — pressing play here is
        // the same claim as starting a track, and without it Spirc ignores
        // every command as long as it considers itself passive
        activated(spirc)?;
        spirc.play()
    })
}

#[tauri::command]
pub fn player_pause(app: AppHandle) -> Result<(), String> {
    with_player(&app, |player| player.pause())?;
    with_spirc(&app, |spirc| spirc.pause())
}

/// Silences the current track at once, for switching: the old one would
/// otherwise keep playing while the new one loads. Deliberately not told to
/// Spirc — it would take this for a pause and load the next track stopped.
#[tauri::command]
pub fn player_halt(app: AppHandle) -> Result<(), String> {
    with_player(&app, |player| player.stop())
}

#[tauri::command]
pub fn player_seek(app: AppHandle, position_ms: u32) -> Result<(), String> {
    with_player(&app, |player| player.seek(position_ms))
}

/// Remembered as well as sent: Spirc ignores every command while the device
/// is still passive, and a load resets what it does accept — so what the
/// interface asked for has to survive both, and it does that here.
#[tauri::command]
pub fn player_set_shuffle(app: AppHandle, shuffle: bool) -> Result<(), String> {
    app.state::<PlayerHandle>().5.lock().unwrap().shuffle = shuffle;

    with_spirc(&app, |spirc| spirc.shuffle(shuffle))
}

/// "off" | "context" | "track" — the three states the UI cycles through.
#[tauri::command]
pub fn player_set_repeat(app: AppHandle, mode: String) -> Result<(), String> {
    {
        let handle = app.state::<PlayerHandle>();
        let mut options = handle.5.lock().unwrap();

        options.repeat_track = mode == "track";
        options.repeat = mode == "context";
    }

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

fn options_for(app: &AppHandle, track: Option<PlayingTrack>, seek_to: u32) -> LoadRequestOptions {
    app.state::<PlayerHandle>()
        .5
        .lock()
        .unwrap()
        .load(track, seek_to)
}

fn remember(app: &AppHandle, loaded: Loaded) {
    *app.state::<PlayerHandle>().2.lock().unwrap() = Some(loaded);
}

/// Plays a playlist, album or artist by uri, optionally starting at a position.
#[tauri::command]
pub fn player_load_context(app: AppHandle, uri: String, index: Option<u32>) -> Result<(), String> {
    with_spirc(&app, |spirc| {
        activated(spirc)?;
        spirc.load(LoadRequest::from_context_uri(
            uri.clone(),
            options_for(&app, index.map(PlayingTrack::Index), 0),
        ))
    })?;

    remember(&app, Loaded::Context(uri));

    Ok(())
}

/// Plays a bare list of tracks — liked songs have no context uri of their own.
#[tauri::command]
pub fn player_load_tracks(
    app: AppHandle,
    uris: Vec<String>,
    index: Option<u32>,
    seek_to: Option<u32>,
) -> Result<(), String> {
    with_spirc(&app, |spirc| {
        activated(spirc)?;
        spirc.load(LoadRequest::from_tracks(
            uris.clone(),
            options_for(&app, index.map(PlayingTrack::Index), seek_to.unwrap_or(0)),
        ))
    })?;

    remember(&app, Loaded::Tracks(uris));

    Ok(())
}

/// Jumps to a track already in the queue. Spirc has no command for it, so what
/// was loaded is loaded again with that track named as the starting point —
/// which is instant, unlike asking Connect to skip for us.
///
/// With shuffle on this re-randomises what comes after: a load starts with
/// `reset_context`, which drops the shuffle seed, and the shuffle that follows
/// draws a new one. The right track still plays and the queue panel re-reads
/// the new order, so nothing lies — the order just does not hold still. Fixing
/// it means either forking `librespot-connect` to keep the seed, or stepping
/// with `Spirc::next`/`prev` instead of reloading, which carries its own rule
/// about what "previous" means over three seconds in.
#[tauri::command]
pub fn player_skip_to(app: AppHandle, uri: String) -> Result<(), String> {
    let handle = app.state::<PlayerHandle>();
    let guard = handle.2.lock().unwrap();

    let options = options_for(&app, Some(PlayingTrack::Uri(uri)), 0);

    let request = match guard.as_ref().ok_or("nothing is loaded")? {
        Loaded::Tracks(uris) => LoadRequest::from_tracks(uris.clone(), options),
        Loaded::Context(context) => LoadRequest::from_context_uri(context.clone(), options),
    };

    with_spirc(&app, |spirc| {
        activated(spirc)?;
        spirc.load(request)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Spirc resets shuffle and repeat at the start of every load, so a load
    /// that says nothing about them turns both off — and since a skip is a
    /// load, shuffle used to last exactly until the next track.
    #[test]
    fn a_load_carries_shuffle_and_repeat() {
        let options = PlayOptions {
            shuffle: true,
            repeat: true,
            repeat_track: false,
        };

        let request = options.load(Some(PlayingTrack::Index(3)), 0);

        match request.context_options {
            Some(LoadContextOptions::Options(carried)) => {
                assert!(carried.shuffle);
                assert!(carried.repeat);
                assert!(!carried.repeat_track);
            }
            other => panic!("the load says nothing about shuffle: {other:?}"),
        }
    }
}
