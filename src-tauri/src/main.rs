#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // crate name db-backup-client → db_backup_client in Rust
  db_backup_client::run();
}
