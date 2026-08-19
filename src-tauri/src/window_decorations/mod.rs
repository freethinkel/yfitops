mod macos;

use self::macos::{
    hide_standard_buttons, set_titlebar_thickness, unified_titlebar_macos, ToolbarThickness,
};
use tauri::WebviewWindow;

pub trait WindowExt {
    fn unified_titlebar(&self);
    fn fancy_titlebar(&self);
    fn hide_buttons(&self);
}

impl WindowExt for WebviewWindow {
    fn unified_titlebar(&self) {
        unified_titlebar_macos(self.ns_window().unwrap());
    }
    fn fancy_titlebar(&self) {
        set_titlebar_thickness(self, ToolbarThickness::Medium);
    }
    fn hide_buttons(&self) {
        hide_standard_buttons(self.ns_window().unwrap());
    }
}
