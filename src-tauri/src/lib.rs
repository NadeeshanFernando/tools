use serde::Deserialize;

/* ----------------------------- Incoming payload ---------------------------- */
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub db_type: String,           // "postgres" | "mysql" | "mariadb" | "mssql" | "sqlite" | "oracle" | "mongodb"

    // network engines
    pub host: Option<String>,
    pub port: Option<String>,
    pub database: Option<String>,      // pg/mysql/mariadb/mssql; for Mongo = Auth DB (default "admin")
    pub service_name: Option<String>,  // oracle
    pub user: Option<String>,
    pub password: Option<String>,

    // sqlite
    pub file_path: Option<String>,

    // mongodb convenience
    pub connection_uri: Option<String>,
}

/* --------------------------------- Command -------------------------------- */
#[tauri::command]
async fn test_connection(profile: Profile) -> Result<(), String> {
    match profile.db_type.as_str() {
        "postgres"              => test_pg(&profile).await,
        "mysql" | "mariadb"     => test_mysql(&profile).await,
        "mssql"                 => test_mssql(&profile).await,
        "sqlite"                => test_sqlite(&profile),
        "oracle"                => test_oracle_sqlplus(&profile).await,
        "mongodb"               => test_mongodb(&profile).await,
        other                   => Err(format!("Unsupported dbType: {other}")),
    }
}

/* ------------------------------- PostgreSQL -------------------------------- */
async fn test_pg(p: &Profile) -> Result<(), String> {
    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("5432");
    let db   = p.database.as_deref().unwrap_or("postgres");
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let conn_str = format!(
        "host={} port={} dbname={} user={} password={}",
        host, port, db, user, pass
    );

    let (client, connection) =
        tokio_postgres::connect(&conn_str, tokio_postgres::NoTls)
            .await
            .map_err(|e| format!("db error: {e}"))?;

    tauri::async_runtime::spawn(async move {
        let _ = connection.await;
    });

    client.simple_query("SELECT 1").await.map_err(|e| format!("db error: {e}"))?;
    Ok(())
}

/* ---------------------------- MySQL / MariaDB ------------------------------ */
async fn test_mysql(p: &Profile) -> Result<(), String> {
    use mysql_async::{Pool, OptsBuilder};
    use tokio::time::{timeout, Duration};

    // Host/IP
    let mut host = p.host.as_deref().unwrap_or("localhost").to_string();
    if host.eq_ignore_ascii_case("localhost") {
        host = "127.0.0.1".to_string(); // avoid IPv6 (::1) surprises on Windows
    }

    let port: u16 = p.port.as_deref().unwrap_or("3306").parse().unwrap_or(3306);
    let db   = p.database.as_deref().unwrap_or("mysql").to_string();
    let user = p.user.as_deref().ok_or("Missing user")?.to_string();
    let pass = p.password.as_deref().unwrap_or("").to_string();

    eprintln!("[mysql] will connect host={host} port={port} db={db} user={user}");

    // Build options (explicitly disable SSL for now to avoid TLS negotiation hangs)
    let opts = OptsBuilder::default()
        .ip_or_hostname(host)
        .tcp_port(port)
        .db_name(Some(db))
        .user(Some(user))
        .pass(Some(pass))
        .tcp_nodelay(true)
        .ssl_opts(None); // <-- important for local dev; we can re-enable later

    let pool = Pool::new(opts);

    // CONNECT (hard timeout)
    eprintln!("[mysql] connecting…");
    let mut conn = timeout(Duration::from_secs(10), pool.get_conn())
        .await
        .map_err(|_| "db error: connect timed out".to_string())?
        .map_err(|e| { eprintln!("[mysql] connect error: {e}"); format!("db error: {e}") })?;
    eprintln!("[mysql] connected.");

    // PROBE QUERY (hard timeout)
    use mysql_async::prelude::Queryable;
    eprintln!("[mysql] running probe: SELECT 1");
    timeout(Duration::from_secs(5), Queryable::query_drop(&mut conn, "SELECT 1"))
        .await
        .map_err(|_| "db error: query timed out".to_string())?
        .map_err(|e| { eprintln!("[mysql] query error: {e}"); format!("db error: {e}") })?;
    eprintln!("[mysql] probe OK.");

    // CLEANUP
    let _ = pool.disconnect().await;
    eprintln!("[mysql] disconnected.");
    Ok(())
}

/* -------------------------------- SQL Server ------------------------------- */
async fn test_mssql(p: &Profile) -> Result<(), String> {
    use tiberius::{AuthMethod, Client, Config};
    use tokio::net::TcpStream;
    use tokio::time::{timeout, Duration};
    use tokio_util::compat::TokioAsyncReadCompatExt; // compat wrapper

    let host = p.host.as_deref().unwrap_or("localhost");
    let port: u16 = p.port.as_deref().unwrap_or("1433").parse().unwrap_or(1433);
    let db   = p.database.as_deref().unwrap_or("master");
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let mut config = Config::new();
    config.host(host);
    config.port(port);
    config.database(db);
    config.authentication(AuthMethod::sql_server(user.to_string(), pass.to_string()));
    config.trust_cert(); // dev only

    let addr = format!("{host}:{port}");
    let stream = timeout(Duration::from_secs(10), TcpStream::connect(addr))
        .await
        .map_err(|_| "db error: connect timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;

    stream.set_nodelay(true).ok();

    let compat = stream.compat();

    let _client: Client<_> =
        Client::connect(config, compat)
            .await
            .map_err(|e| format!("db error: {e}"))?;

    Ok(())
}

/* ---------------------------------- SQLite --------------------------------- */
fn test_sqlite(p: &Profile) -> Result<(), String> {
    use rusqlite::Connection;
    let path = p.file_path.as_deref().ok_or("Missing filePath")?;
    let conn = Connection::open(path).map_err(|e| format!("db error: {e}"))?;
    conn.execute("SELECT 1", []).map_err(|e| format!("db error: {e}"))?;
    Ok(())
}

/* --------------------------------- Oracle ---------------------------------- */
async fn test_oracle_sqlplus(p: &Profile) -> Result<(), String> {
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("1521");
    let svc  = p.service_name.as_deref().ok_or("Missing serviceName")?;
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let conn = format!("{user}/{pass}@{host}:{port}/{svc}");

    let mut cmd = Command::new("sqlplus");
    cmd.arg("-L").arg("-S").arg(&conn).arg("EXIT");

    let output = timeout(Duration::from_secs(10), cmd.output())
        .await
        .map_err(|_| "db error: connect timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stderr).to_string();
        let out = String::from_utf8_lossy(&output.stdout).to_string();
        let msg = if !err.trim().is_empty() { err } else { out };
        Err(format!("db error: {}", msg.trim()))
    }
}

/* --------------------------------- MongoDB --------------------------------- */
async fn test_mongodb(p: &Profile) -> Result<(), String> {
    use mongodb::{Client, options::{ClientOptions, ServerAddress, Credential}};
    use bson::doc;
    use tokio::time::{timeout, Duration};

    // URI path (Atlas or custom): parse options async, then ping with timeout
    if let Some(uri) = &p.connection_uri {
        let mut opts = timeout(Duration::from_secs(10), ClientOptions::parse(uri.as_str()))
            .await
            .map_err(|_| "db error: connect timed out".to_string())?
            .map_err(|e| format!("db error: {e}"))?;
        opts.server_selection_timeout = Some(Duration::from_secs(10));
        opts.connect_timeout = Some(Duration::from_secs(10));
        let client = Client::with_options(opts).map_err(|e| format!("db error: {e}"))?;
        let admin = client.database("admin");
        timeout(Duration::from_secs(12), admin.run_command(doc! {"ping": 1}, None))
            .await
            .map_err(|_| "db error: connect timed out".to_string())?
            .map_err(|e| format!("db error: {e}"))?;
        return Ok(());
    }

    // Manual host/port mode
    let host = p.host.as_deref().unwrap_or("localhost").to_string();
    let port: u16 = p.port.as_deref().unwrap_or("27017").parse().unwrap_or(27017);
    let auth_db = p.database.as_deref().unwrap_or("admin").to_string();
    let user = p.user.clone();
    let pass = p.password.clone();

    let mut opts = ClientOptions::default();
    opts.hosts = vec![ServerAddress::Tcp { host, port: Some(port) }];
    opts.direct_connection = Some(true);
    opts.server_selection_timeout = Some(Duration::from_secs(10));
    opts.connect_timeout = Some(Duration::from_secs(10));

    if user.is_some() || pass.is_some() {
        opts.credential = Some(
            Credential::builder()
                .username(user)
                .password(pass)
                .source(Some(auth_db))
                .build()
        );
    }

    let client = Client::with_options(opts).map_err(|e| format!("db error: {e}"))?;
    let admin = client.database("admin");
    timeout(Duration::from_secs(12), admin.run_command(doc! {"ping": 1}, None))
        .await
        .map_err(|_| "db error: connect timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;
    Ok(())
}

/* -------------------------------- App wiring ------------------------------- */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![test_connection])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
