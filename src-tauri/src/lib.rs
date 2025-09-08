use serde::{Deserialize, Serialize};
use tauri::{Emitter, Window}; // Emitter for win.emit()

/* ----------------------------- Incoming payload ---------------------------- */
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub db_type: String, // "postgres" | "mysql" | "mariadb" | "mssql" | "sqlite" | "oracle" | "mongodb"

    // network engines
    pub host: Option<String>,
    pub port: Option<String>,
    pub database: Option<String>, // pg/mysql/mariadb/mssql; for Mongo = Auth DB (default "admin")
    pub service_name: Option<String>, // oracle
    pub user: Option<String>,
    pub password: Option<String>,

    // sqlite
    pub file_path: Option<String>,

    // mongodb convenience
    pub connection_uri: Option<String>,
}

/* ---------------------------- Progress event types --------------------------- */
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackupProgress {
    stage: String,          // "starting" | "dumping" | "compressing" | "done" | "error"
    percent: Option<u8>,    // Some(0..=100) or None when indeterminate
    detail: Option<String>, // user-friendly line
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RestoreProgress {
    stage: String,          // "starting" | "preparing" | "dropping" | "creating" | "restoring" | "done" | "error"
    percent: Option<u8>,
    detail: Option<String>,
}

fn emit_progress_backup(win: &Window, payload: BackupProgress) {
    let _ = win.emit("backup-progress", payload);
}
fn emit_progress_restore(win: &Window, payload: RestoreProgress) {
    let _ = win.emit("restore-progress", payload);
}

/* ------------------------------- Utilities --------------------------------- */
// Preflight: ensure external CLI tool exists on PATH (e.g., pg_dump/psql/pg_restore)
fn ensure_cmd_available(name: &str) -> Result<(), String> {
    which::which(name)
        .map(|_| ())
        .map_err(|_| format!("Required tool not found in PATH: `{}`", name))
}

/* --------------------------------- Commands -------------------------------- */
#[tauri::command]
async fn test_connection(profile: Profile) -> Result<(), String> {
    match profile.db_type.as_str() {
        "postgres" => test_pg(&profile).await,
        "mysql" | "mariadb" => test_mysql(&profile).await,
        "mssql" => test_mssql(&profile).await,
        "sqlite" => test_sqlite(&profile),
        "oracle" => test_oracle_sqlplus(&profile).await,
        "mongodb" => test_mongodb(&profile).await,
        other => Err(format!("Unsupported dbType: {other}")),
    }
}

#[tauri::command]
async fn backup_connection(window: Window, profile: Profile, dest_path: String, compress: bool) -> Result<(), String> {
    emit_progress_backup(&window, BackupProgress {
        stage: "starting".into(),
        percent: Some(0),
        detail: Some("Preparing backup…".into()),
    });

    let res = match profile.db_type.as_str() {
        "postgres" => backup_pg(&window, &profile, &dest_path, compress).await,
        "mysql" | "mariadb" => backup_mysql(&window, &profile, &dest_path, compress).await,
        "mssql" => backup_mssql(&window, &profile, &dest_path).await,
        "sqlite" => backup_sqlite(&window, &profile, &dest_path, compress).await,
        "mongodb" => backup_mongodb(&window, &profile, &dest_path, compress).await,
        "oracle" => Err("Oracle export not yet supported (expdp required)".into()),
        other => Err(format!("Unsupported dbType: {other}")),
    };

    match res {
        Ok(()) => {
            emit_progress_backup(&window, BackupProgress {
                stage: "done".into(),
                percent: Some(100),
                detail: Some("Backup completed".into()),
            });
            Ok(())
        }
        Err(e) => {
            emit_progress_backup(&window, BackupProgress {
                stage: "error".into(),
                percent: None,
                detail: Some(e.clone()),
            });
            Err(e)
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreOptions {
    // For postgres only (for now)
    strategy: String,          // "drop_and_restore" | "create_new"
    new_db_name: Option<String>,
}

/** Restore command (dispatch by dbType; implemented for Postgres) */
#[tauri::command]
async fn restore_connection(window: Window, profile: Profile, src_path: String, opts: RestoreOptions) -> Result<(), String> {
    emit_progress_restore(&window, RestoreProgress {
        stage: "starting".into(),
        percent: Some(0),
        detail: Some("Preparing restore…".into()),
    });

    let res = match profile.db_type.as_str() {
        "postgres" => restore_pg(&window, &profile, &src_path, &opts).await,
        other => Err(format!("Restore not implemented for dbType: {other}")),
    };

    match res {
        Ok(()) => {
            emit_progress_restore(&window, RestoreProgress {
                stage: "done".into(),
                percent: Some(100),
                detail: Some("Restore completed".into()),
            });
            Ok(())
        }
        Err(e) => {
            emit_progress_restore(&window, RestoreProgress {
                stage: "error".into(),
                percent: None,
                detail: Some(e.clone()),
            });
            Err(e)
        }
    }
}

/* ------------------------------- PostgreSQL -------------------------------- */
async fn test_pg(p: &Profile) -> Result<(), String> {
    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("5432");
    let db = p.database.as_deref().unwrap_or("postgres");
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let conn_str = format!(
        "host={} port={} dbname={} user={} password={}",
        host, port, db, user, pass
    );

    let (client, connection) = tokio_postgres
        ::connect(&conn_str, tokio_postgres::NoTls).await
        .map_err(|e| format!("db error: {e}"))?;

    tauri::async_runtime::spawn(async move {
        let _ = connection.await;
    });

    client.simple_query("SELECT 1").await.map_err(|e| format!("db error: {e}"))?;
    Ok(())
}

async fn backup_pg(win: &Window, p: &Profile, dest: &str, compress: bool) -> Result<(), String> {
    ensure_cmd_available("pg_dump")?;

    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("5432");
    let db   = p.database.as_deref().unwrap_or("postgres");
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let mut cmd = Command::new("pg_dump");
    let mut args = vec!["-h", host, "-p", port, "-U", user, "-d", db, "-v"];
    if compress {
        args.extend_from_slice(&["-F", "c", "-f", dest]); // custom .dump
    } else {
        args.extend_from_slice(&["-F", "p", "-f", dest]); // plain SQL
    }
    cmd.args(args).env("PGPASSWORD", pass);

    emit_progress_backup(win, BackupProgress {
        stage: "dumping".into(),
        percent: Some(10),
        detail: Some("Running pg_dump…".into()),
    });

    let out = timeout(Duration::from_secs(60*30), cmd.output()).await
        .map_err(|_| "db error: backup timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;

    if out.status.success() {
        emit_progress_backup(win, BackupProgress { stage: "dumping".into(), percent: Some(90), detail: Some("Finalizing…".into()) });
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        Err(format!("db error: {}", err.trim()))
    }
}

async fn restore_pg(win: &Window, p: &Profile, src: &str, opts: &RestoreOptions) -> Result<(), String> {
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    // Tools we might need
    ensure_cmd_available("psql")?;
    ensure_cmd_available("pg_restore")?;
    ensure_cmd_available("createdb")?;
    ensure_cmd_available("dropdb")?;

    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("5432");
    let target_db = p.database.as_deref().unwrap_or("postgres"); // existing db (for drop & restore)
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    // Determine if the dump is custom or plain SQL by extension
    let lower = src.to_ascii_lowercase();
    let is_custom = lower.ends_with(".dump") || lower.ends_with(".custom");

    emit_progress_restore(win, RestoreProgress {
        stage: "preparing".into(),
        percent: Some(10),
        detail: Some(format!("Using {} format", if is_custom { "custom" } else { "plain SQL" })),
    });

    // Helper to run command with PGPASSWORD
    async fn run_cmd(mut cmd: Command) -> Result<std::process::Output, String> {
        use tokio::time::{timeout, Duration};
        let out = timeout(Duration::from_secs(60 * 45), cmd.output()).await
            .map_err(|_| "db error: restore timed out".to_string())?
            .map_err(|e| format!("db error: {e}"))?;
        Ok(out)
    }

    match opts.strategy.as_str() {
        "create_new" => {
            let new_db = opts.new_db_name.as_deref().ok_or("Missing newDbName for create_new")?;

            emit_progress_restore(win, RestoreProgress {
                stage: "creating".into(),
                percent: Some(20),
                detail: Some(format!("Creating database `{}`…", new_db)),
            });

            // createdb
            let mut createdb = Command::new("createdb");
            createdb
                .args(["-h", host, "-p", port, "-U", user, new_db])
                .env("PGPASSWORD", pass);
            let out = run_cmd(createdb).await?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr).to_string();
                return Err(format!("db error: {}", err.trim()));
            }

            emit_progress_restore(win, RestoreProgress {
                stage: "restoring".into(),
                percent: Some(40),
                detail: Some("Restoring into new database…".into()),
            });

            if is_custom {
                // pg_restore to new_db
                let mut restore = Command::new("pg_restore");
                restore
                    .args(["-h", host, "-p", port, "-U", user, "-d", new_db, "-v"])
                    .arg(src)
                    .env("PGPASSWORD", pass);
                let out = run_cmd(restore).await?;
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    return Err(format!("db error: {}", err.trim()));
                }
            } else {
                // psql -d new_db -f src
                let mut psql = Command::new("psql");
                psql
                    .args(["-h", host, "-p", port, "-U", user, "-d", new_db, "-v", "ON_ERROR_STOP=1", "-f"])
                    .arg(src)
                    .env("PGPASSWORD", pass);
                let out = run_cmd(psql).await?;
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    return Err(format!("db error: {}", err.trim()));
                }
            }
        }
        "drop_and_restore" => {
            // Strategy: drop DB and recreate (more reliable than dropping schema piecemeal)
            emit_progress_restore(win, RestoreProgress {
                stage: "dropping".into(),
                percent: Some(20),
                detail: Some(format!("Dropping and recreating `{}`…", target_db)),
            });

            // dropdb --if-exists
            let mut dropdb = Command::new("dropdb");
            dropdb
                .args(["-h", host, "-p", port, "-U", user, "--if-exists", target_db])
                .env("PGPASSWORD", pass);
            let _ = run_cmd(dropdb).await?; // ignore non-zero? We asked --if-exists

            // createdb (fresh)
            let mut createdb = Command::new("createdb");
            createdb
                .args(["-h", host, "-p", port, "-U", user, target_db])
                .env("PGPASSWORD", pass);
            let out = run_cmd(createdb).await?;
            if !out.status.success() {
                let err = String::from_utf8_lossy(&out.stderr).to_string();
                return Err(format!("db error: {}", err.trim()));
            }

            emit_progress_restore(win, RestoreProgress {
                stage: "restoring".into(),
                percent: Some(40),
                detail: Some("Restoring into target database…".into()),
            });

            if is_custom {
                // pg_restore with verbose
                let mut restore = Command::new("pg_restore");
                restore
                    .args(["-h", host, "-p", port, "-U", user, "-d", target_db, "-v"])
                    .arg(src)
                    .env("PGPASSWORD", pass);
                let out = run_cmd(restore).await?;
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    return Err(format!("db error: {}", err.trim()));
                }
            } else {
                // psql -d target -f src
                let mut psql = Command::new("psql");
                psql
                    .args(["-h", host, "-p", port, "-U", user, "-d", target_db, "-v", "ON_ERROR_STOP=1", "-f"])
                    .arg(src)
                    .env("PGPASSWORD", pass);
                let out = run_cmd(psql).await?;
                if !out.status.success() {
                    let err = String::from_utf8_lossy(&out.stderr).to_string();
                    return Err(format!("db error: {}", err.trim()));
                }
            }
        }
        _ => {
            return Err("Unknown restore strategy".into());
        }
    }

    emit_progress_restore(win, RestoreProgress {
        stage: "restoring".into(),
        percent: Some(90),
        detail: Some("Finalizing…".into()),
    });

    Ok(())
}

/* ---------------------------- MySQL / MariaDB ------------------------------ */
async fn test_mysql(p: &Profile) -> Result<(), String> {
    use mysql_async::{ Pool, OptsBuilder };
    use tokio::time::{ timeout, Duration };

    let mut host = p.host.as_deref().unwrap_or("localhost").to_string();
    if host.eq_ignore_ascii_case("localhost") {
        host = "127.0.0.1".to_string(); // avoid IPv6 (::1) on Windows
    }

    let port: u16 = p.port.as_deref().unwrap_or("3306").parse().unwrap_or(3306);
    let db = p.database.as_deref().unwrap_or("mysql").to_string();
    let user = p.user.as_deref().ok_or("Missing user")?.to_string();
    let pass = p.password.as_deref().unwrap_or("").to_string();

    let opts = OptsBuilder::default()
        .ip_or_hostname(host)
        .tcp_port(port)
        .db_name(Some(db))
        .user(Some(user))
        .pass(Some(pass))
        .tcp_nodelay(true)
        .ssl_opts(None);

    let pool = Pool::new(opts);
    let mut conn = timeout(Duration::from_secs(10), pool.get_conn()).await
        .map_err(|_| "db error: connect timed out".to_string())?
        .map_err(|e| { format!("db error: {e}") })?;

    use mysql_async::prelude::Queryable;
    timeout(Duration::from_secs(5), Queryable::query_drop(&mut conn, "SELECT 1")).await
        .map_err(|_| "db error: query timed out".to_string())?
        .map_err(|e| { format!("db error: {e}") })?;

    let h = pool.disconnect();
    tauri::async_runtime::spawn(async move {
        let _ = h.await;
    });
    Ok(())
}

async fn backup_mysql(win: &Window, p: &Profile, dest: &str, _compress: bool) -> Result<(), String> {
    ensure_cmd_available("mysqldump")?;

    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("3306");
    let db   = p.database.as_deref().unwrap_or("mysql");
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let mut cmd = Command::new("mysqldump");
    cmd.args([
        "-h", host, "-P", port, "-u", user,
        "--protocol=TCP",
        "--routines", "--events",
        db,
    ]);
    if !pass.is_empty() {
        cmd.arg(format!("--password={}", pass));
    }
    cmd.arg(format!("--result-file={}", dest)); // write .sql directly

    emit_progress_backup(win, BackupProgress { stage: "dumping".into(), percent: None, detail: Some("Running mysqldump…".into()) });

    let out = timeout(Duration::from_secs(60*30), cmd.output()).await
        .map_err(|_| "db error: backup timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;

    if out.status.success() { Ok(()) }
    else {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        Err(format!("db error: {}", err.trim()))
    }
}

/* -------------------------------- SQL Server ------------------------------- */
async fn test_mssql(p: &Profile) -> Result<(), String> {
    use tiberius::{ AuthMethod, Client, Config };
    use tokio::net::TcpStream;
    use tokio::time::{ timeout, Duration };
    use tokio_util::compat::TokioAsyncReadCompatExt;

    let host = p.host.as_deref().unwrap_or("localhost");
    let port: u16 = p.port.as_deref().unwrap_or("1433").parse().unwrap_or(1433);
    let db = p.database.as_deref().unwrap_or("master");
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let mut config = Config::new();
    config.host(host);
    config.port(port);
    config.database(db);
    config.authentication(AuthMethod::sql_server(user.to_string(), pass.to_string()));
    config.trust_cert(); // dev only

    let addr = format!("{host}:{port}");
    let stream = timeout(Duration::from_secs(10), TcpStream::connect(addr)).await
        .map_err(|_| "db error: connect timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;

    stream.set_nodelay(true).ok();
    let compat = stream.compat();

    let _client: Client<_> = Client::connect(config, compat).await
        .map_err(|e| format!("db error: {e}"))?;

    Ok(())
}

async fn backup_mssql(win: &Window, p: &Profile, dest_bak: &str) -> Result<(), String> {
    ensure_cmd_available("sqlcmd")?;

    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("1433");
    let db   = p.database.as_deref().unwrap_or("master");
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let server = format!("{},{}", host, port);
    let query = format!(
        "BACKUP DATABASE [{}] TO DISK = N'{}' WITH INIT, COMPRESSION, STATS = 10;",
        db, dest_bak
    );

    emit_progress_backup(win, BackupProgress { stage: "dumping".into(), percent: None, detail: Some("Running BACKUP DATABASE…".into()) });

    let out = timeout(Duration::from_secs(60*60),
        Command::new("sqlcmd")
            .args(["-S", &server, "-U", user, "-P", pass, "-Q", &query, "-b"])
            .output()
    ).await
     .map_err(|_| "db error: backup timed out".to_string())?
     .map_err(|e| format!("db error: {e}"))?;

    if out.status.success() { Ok(()) }
    else {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        let out_s = String::from_utf8_lossy(&out.stdout).to_string();
        Err(format!("db error: {}", if err.trim().is_empty(){ out_s } else { err }))
    }
}

/* ---------------------------------- SQLite --------------------------------- */
fn test_sqlite(p: &Profile) -> Result<(), String> {
    use rusqlite::Connection;
    let path = p.file_path.as_deref().ok_or("Missing filePath")?;
    let conn = Connection::open(path).map_err(|e| format!("db error: {e}"))?;
    conn.execute("SELECT 1", []).map_err(|e| format!("db error: {e}"))?;
    Ok(())
}

async fn backup_sqlite(win: &Window, p: &Profile, dest: &str, _compress: bool) -> Result<(), String> {
    use tokio::fs;
    use tokio::time::{sleep, Duration};

    let from = p.file_path.as_deref().ok_or("Missing filePath")?;
    emit_progress_backup(win, BackupProgress { stage: "dumping".into(), percent: Some(5), detail: Some("Copying SQLite file…".into()) });

    fs::copy(from, dest).await.map_err(|e| format!("db error: {e}"))?;
    for pct in [25u8, 50, 75, 90] {
        sleep(Duration::from_millis(120)).await;
        emit_progress_backup(win, BackupProgress { stage: "dumping".into(), percent: Some(pct), detail: None });
    }
    Ok(())
}

/* --------------------------------- Oracle ---------------------------------- */
async fn test_oracle_sqlplus(p: &Profile) -> Result<(), String> {
    use tokio::process::Command;
    use tokio::time::{ timeout, Duration };

    let host = p.host.as_deref().unwrap_or("localhost");
    let port = p.port.as_deref().unwrap_or("1521");
    let svc = p.service_name.as_deref().ok_or("Missing serviceName")?;
    let user = p.user.as_deref().ok_or("Missing user")?;
    let pass = p.password.as_deref().unwrap_or("");

    let conn = format!("{user}/{pass}@{host}:{port}/{svc}");

    let mut cmd = Command::new("sqlplus");
    cmd.arg("-L").arg("-S").arg(&conn).arg("EXIT");

    let output = timeout(Duration::from_secs(10), cmd.output()).await
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
    use mongodb::{ Client, options::{ ClientOptions, ServerAddress, Credential } };
    use bson::doc;
    use tokio::time::{ timeout, Duration };

    if let Some(uri) = &p.connection_uri {
        let mut opts = timeout(Duration::from_secs(10), ClientOptions::parse(uri.as_str())).await
            .map_err(|_| "db error: connect timed out".to_string())?
            .map_err(|e| format!("db error: {e}"))?;
        opts.server_selection_timeout = Some(Duration::from_secs(10));
        opts.connect_timeout = Some(Duration::from_secs(10));
        let client = Client::with_options(opts).map_err(|e| format!("db error: {e}"))?;
        let admin = client.database("admin");
        timeout(Duration::from_secs(12), admin.run_command(doc! { "ping": 1 }, None)).await
            .map_err(|_| "db error: connect timed out".to_string())?
            .map_err(|e| format!("db error: {e}"))?;
        return Ok(());
    }

    let host = p.host.as_deref().unwrap_or("localhost").to_string();
    let port: u16 = p.port.as_deref().unwrap_or("27017").parse().unwrap_or(27017);
    let auth_db = p.database.as_deref().unwrap_or("admin").to_string();
    let user = p.user.clone();
    let pass = p.password.clone();

    let mut opts = mongodb::options::ClientOptions::default();
    opts.hosts = vec![ServerAddress::Tcp { host, port: Some(port) }];
    opts.direct_connection = Some(true);
    opts.server_selection_timeout = Some(Duration::from_secs(10));
    opts.connect_timeout = Some(Duration::from_secs(10));

    if user.is_some() || pass.is_some() {
        opts.credential = Some(
            Credential::builder().username(user).password(pass).source(Some(auth_db)).build()
        );
    }

    let client = Client::with_options(opts).map_err(|e| format!("db error: {e}"))?;
    let admin = client.database("admin");
    timeout(Duration::from_secs(12), admin.run_command(doc! { "ping": 1 }, None)).await
        .map_err(|_| "db error: connect timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;
    Ok(())
}

async fn backup_mongodb(win: &Window, p: &Profile, dest: &str, compress: bool) -> Result<(), String> {
    ensure_cmd_available("mongodump")?;

    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    let mut cmd = Command::new("mongodump");
    emit_progress_backup(win, BackupProgress { stage: "dumping".into(), percent: None, detail: Some("Running mongodump…".into()) });

    if let Some(uri) = &p.connection_uri {
        cmd.args(["--uri", uri, "--archive", dest]);
        if compress { cmd.arg("--gzip"); }
    } else {
        let host = p.host.as_deref().unwrap_or("localhost");
        let port = p.port.as_deref().unwrap_or("27017");
        cmd.args(["--host", host, "--port", port, "--archive", dest]);
        if compress { cmd.arg("--gzip"); }
        if let Some(u) = &p.user { cmd.args(["-u", u]); }
        if let Some(pass) = &p.password { if !pass.is_empty() { cmd.args(["-p", pass]); } }
        if let Some(db) = &p.database { cmd.args(["--authenticationDatabase", db]); }
    }

    let out = timeout(Duration::from_secs(60*45), cmd.output()).await
        .map_err(|_| "db error: backup timed out".to_string())?
        .map_err(|e| format!("db error: {e}"))?;

    if out.status.success() { Ok(()) }
    else {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        Err(format!("db error: {}", err.trim()))
    }
}

/* -------------------------------- App wiring ------------------------------- */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init()) // dialog plugin (v2)
        .invoke_handler(tauri::generate_handler![
            test_connection,
            backup_connection,
            restore_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
