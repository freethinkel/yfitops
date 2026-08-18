use std::{ffi::c_void, sync::Mutex};

use crate::notification::NSNotificationCenter;

use cocoa::{
    appkit::{NSColor, NSToolbar, NSWindow, NSWindowStyleMask, NSWindowTitleVisibility},
    base::{id, nil},
};
use objc::{
    msg_send,
    runtime::{BOOL, NO, YES},
    sel, sel_impl,
};
use tauri::WebviewWindow;

#[allow(dead_code)]
pub enum ToolbarThickness {
    Thick,
    Medium,
    Thin,
}

struct SafeWindow {
    window: id,
}

unsafe impl Send for SafeWindow {}

pub fn unified_titlebar_macos(window: *mut c_void) {
    let window = window as id;

    let style_mask = unsafe { window.styleMask() }
        | NSWindowStyleMask::NSUnifiedTitleAndToolbarWindowMask
        | NSWindowStyleMask::NSFullSizeContentViewWindowMask
        | NSWindowStyleMask::NSBorderlessWindowMask;
    unsafe { window.setStyleMask_(style_mask) };
    unsafe { window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden) };
    unsafe { window.setTitlebarAppearsTransparent_(YES) };
    let color =
        unsafe { NSColor::colorWithSRGBRed_green_blue_alpha_(nil, 255.0, 255.0, 255.0, 1.0) };
    unsafe { window.setBackgroundColor_(color) };
    unsafe { window.setHasShadow_(YES) };
}

pub fn set_titlebar_thickness(tauri_win: &WebviewWindow, thickness: ToolbarThickness) {
    let window = tauri_win.ns_window().unwrap() as id;

    match thickness {
        ToolbarThickness::Thick => {
            tauri_win.set_title("").expect("Title wasn't set to ''");
            unsafe {
                window.setToolbarStyle_(
                    cocoa::appkit::NSWindowToolbarStyle::NSWindowToolbarStyleUnified,
                )
            };
            // window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleVisible);
            unsafe { make_toolbar(window) };
        }
        ToolbarThickness::Medium => {
            unsafe { make_toolbar(window) };
        }
        ToolbarThickness::Thin => {}
    }
    let will_enter_notification = NSNotificationCenter::new(String::from("NSNotificationCenter"));
    let will_exit_notification = NSNotificationCenter::new(String::from("NSNotificationCenter"));
    let did_exit_notification = NSNotificationCenter::new(String::from("NSNotificationCenter"));

    let window_box_enter = Mutex::new(SafeWindow { window });
    let window_box_exit = Mutex::new(SafeWindow { window });
    let window_box_exit_did = Mutex::new(SafeWindow { window });

    will_enter_notification.listen(
        "NSWindowWillEnterFullScreenNotification".into(),
        move |_| {
            let window = window_box_enter.lock().unwrap().window;
            unsafe { window.toolbar().setIsVisible_(NO) };
        },
    );
    did_exit_notification.listen("NSWindowDidExitFullScreenNotification".into(), move |_| {
        let window = window_box_exit_did.lock().unwrap().window;
        unsafe { window.toolbar().setIsVisible_(YES) };
    });
    will_exit_notification.listen("NSWindowWillExitFullScreenNotification".into(), move |_| {
        let window = window_box_exit.lock().unwrap().window;
        unsafe { window.toolbar().setIsVisible_(YES) };
    });
}

#[cfg(target_os = "macos")]
unsafe fn make_toolbar(id: id) -> id {
    let new_toolbar = NSToolbar::alloc(id);
    new_toolbar.setShowsBaselineSeparator_(NO);
    new_toolbar.init_();
    id.setToolbar_(new_toolbar);

    new_toolbar
}

#[allow(non_snake_case)]
trait ChangeVisible: Sized {
    unsafe fn setIsVisible_(self, state: BOOL);
}

#[allow(non_snake_case)]
impl ChangeVisible for id {
    unsafe fn setIsVisible_(self, state: BOOL) {
        msg_send![self, setVisible: state]
    }
}
