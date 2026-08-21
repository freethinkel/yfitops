use std::sync::OnceLock;

use block::ConcreteBlock;
use cocoa::{
    base::{id, nil},
    foundation::{NSInteger, NSString},
};
use objc::{class, msg_send, runtime::YES, sel, sel_impl};
use tauri::{AppHandle, Emitter};

// The play/pause key belongs to whichever app claims it. Until we did, Spotify
// answered it and forwarded the command to us over Connect — out to their
// server and back, which is exactly the delay that was audible. Claiming the
// keys means handling them in this process.
#[link(name = "MediaPlayer", kind = "framework")]
unsafe extern "C" {}

static APP: OnceLock<AppHandle> = OnceLock::new();

/// MPRemoteCommandHandlerStatusSuccess
const HANDLED: NSInteger = 0;

/// Keys arrive on a system thread; the player lives elsewhere, so the press is
/// forwarded as an event and the frontend calls the same commands a click does.
fn press(key: &str) {
    if let Some(app) = APP.get() {
        let _ = app.emit("media-key", key);
    }
}

unsafe fn claim(center: id, selector: &str, key: &'static str) {
    let command: id = match selector {
        "toggle" => msg_send![center, togglePlayPauseCommand],
        "play" => msg_send![center, playCommand],
        "pause" => msg_send![center, pauseCommand],
        "next" => msg_send![center, nextTrackCommand],
        _ => msg_send![center, previousTrackCommand],
    };

    let handler = ConcreteBlock::new(move |_event: id| -> NSInteger {
        press(key);
        HANDLED
    })
    .copy();

    let _: id = msg_send![command, addTargetWithHandler: &*handler];
    let _: () = msg_send![command, setEnabled: YES];

    // the block has to outlive this call — the command centre keeps calling it
    std::mem::forget(handler);
}

pub fn install(app: AppHandle) {
    let _ = APP.set(app);

    unsafe {
        let center: id = msg_send![class!(MPRemoteCommandCenter), sharedCommandCenter];

        claim(center, "toggle", "toggle");
        claim(center, "play", "play");
        claim(center, "pause", "pause");
        claim(center, "next", "next");
        claim(center, "previous", "previous");
    }
}

unsafe fn string(value: &str) -> id {
    let raw: id = NSString::alloc(nil).init_str(value);
    // `init_str` hands back a +1 reference, and everything here is dropped
    // into the pool below rather than released by hand
    let _: id = msg_send![raw, autorelease];

    raw
}

unsafe fn number(value: f64) -> id {
    msg_send![class!(NSNumber), numberWithDouble: value]
}

/// Fills the system's Now Playing panel. Also what makes macOS hand us the
/// keys in the first place — an app that reports nothing is not playing
/// anything as far as the system is concerned. Called from the frontend, which
/// is where the track's metadata already lives.
#[tauri::command]
pub fn media_publish(
    title: String,
    artist: String,
    album: String,
    duration_ms: f64,
    position_ms: f64,
    playing: bool,
) {
    publish(&title, &artist, &album, duration_ms, position_ms, playing)
}

fn publish(
    title: &str,
    artist: &str,
    album: &str,
    duration_ms: f64,
    position_ms: f64,
    playing: bool,
) {
    unsafe {
        // this runs off the main thread, where there is no pool in place, and
        // it runs on every player event — the autoreleased strings, numbers
        // and the dictionary itself would pile up for the whole session
        let pool: id = msg_send![class!(NSAutoreleasePool), new];

        let info: id = msg_send![class!(NSMutableDictionary), dictionary];

        let title_key = string("title");
        let artist_key = string("artist");
        let album_key = string("albumTitle");
        let duration_key = string("playbackDuration");
        let elapsed_key = string("elapsedPlaybackTime");
        let rate_key = string("playbackRate");

        let _: () = msg_send![info, setObject: string(title) forKey: title_key];
        let _: () = msg_send![info, setObject: string(artist) forKey: artist_key];
        let _: () = msg_send![info, setObject: string(album) forKey: album_key];
        let _: () = msg_send![info, setObject: number(duration_ms / 1000.0) forKey: duration_key];
        let _: () = msg_send![info, setObject: number(position_ms / 1000.0) forKey: elapsed_key];
        let _: () =
            msg_send![info, setObject: number(if playing { 1.0 } else { 0.0 }) forKey: rate_key];

        let center: id = msg_send![class!(MPNowPlayingInfoCenter), defaultCenter];
        let _: () = msg_send![center, setNowPlayingInfo: info];

        // MPNowPlayingPlaybackState: 1 playing, 2 paused
        let state: NSInteger = if playing { 1 } else { 2 };
        let _: () = msg_send![center, setPlaybackState: state];

        let _: () = msg_send![pool, release];
    }
}
