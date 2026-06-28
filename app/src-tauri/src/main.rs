// На Windows в релизе прячем консольное окно.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    noet_lib::run();
}
