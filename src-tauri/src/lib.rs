use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Profile {
    pub id: String,
    pub dbType: String,   // "postgres"
    pub host: String,
    pub port: String,
    pub database: String,
    pub user: String,
    pub password: String, // <-- add password here
}

#[tauri::command]
async fn test_connection(profile: Profile) -> Result<(), String> {
    if profile.dbType.to_lowercase() != "postgres" {
        return Err("Only PostgreSQL is supported right now".into());
    }

    let conn_str = format!(
        "host={} port={} dbname={} user={} password={}",
        profile.host, profile.port, profile.database, profile.user, profile.password
    );

    let (client, connection) =
        tokio_postgres::connect(&conn_str, tokio_postgres::NoTls).await.map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn(async move {
        let _ = connection.await;
    });

    client
        .simple_query("SELECT 1")
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![test_connection])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
