#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--smoke-test") {
        println!("CriaCord Tauri smoke-test OK");
        return;
    }
    criacord_lib::run();
}
