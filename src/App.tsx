import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** ---------- Types ---------- */
type DbType =
  | "postgres"
  | "mysql"
  | "mariadb"
  | "mssql"
  | "sqlite"
  | "oracle"
  | "mongodb";

type BaseConn = {
  id: string;
  name: string;
  dbType: DbType;
};

type NetworkConn = BaseConn & {
  host: string;
  port: string; // keep as string for inputs
  database?: string; // pg/mysql/mariadb/mssql; for MongoDB = Auth DB
  serviceName?: string; // oracle
  user: string; // may be empty for Mongo/no-auth
  // MongoDB convenience: full URI (if provided, we can skip host/port/user/password)
  connectionUri?: string;
};

type SqliteConn = BaseConn & {
  filePath: string; // sqlite only
};

type Conn = NetworkConn | SqliteConn;
type FormState =
  | (NetworkConn & { password?: string })
  | (SqliteConn & { password?: string });

type Notice =
  | { kind: "idle" }
  | { kind: "loading"; msg: string }
  | { kind: "ok"; msg: string }
  | { kind: "err"; msg: string };

/** ---------- Storage Keys ---------- */
const LS_KEY_V1 = "dbc_profiles_v1"; // old (postgres-only)
const LS_KEY = "dbc_profiles_v2"; // new (multi-DB)

/** ---------- DB Metadata ---------- */
const DB_META: Record<
  DbType,
  {
    label: string;
    defaultPort?: string;
    needs: (
      | "host"
      | "port"
      | "database"
      | "serviceName"
      | "user"
      | "password"
      | "filePath"
      | "connectionUri"
    )[];
    placeholders?: Partial<
      Record<
        | "host"
        | "port"
        | "database"
        | "serviceName"
        | "user"
        | "filePath"
        | "connectionUri",
        string
      >
    >;
  }
> = {
  postgres: {
    label: "PostgreSQL",
    defaultPort: "5432",
    needs: ["host", "port", "database", "user", "password"],
    placeholders: {
      host: "localhost",
      port: "5432",
      database: "postgres",
      user: "postgres",
    },
  },
  mysql: {
    label: "MySQL",
    defaultPort: "3306",
    needs: ["host", "port", "database", "user", "password"],
    placeholders: {
      host: "localhost",
      port: "3306",
      database: "mysql",
      user: "root",
    },
  },
  mariadb: {
    label: "MariaDB",
    defaultPort: "3306",
    needs: ["host", "port", "database", "user", "password"],
    placeholders: {
      host: "localhost",
      port: "3306",
      database: "mysql",
      user: "root",
    },
  },
  mssql: {
    label: "SQL Server",
    defaultPort: "1433",
    needs: ["host", "port", "database", "user", "password"],
    placeholders: {
      host: "localhost",
      port: "1433",
      database: "master",
      user: "sa",
    },
  },
  sqlite: {
    label: "SQLite",
    needs: ["filePath"],
    placeholders: { filePath: "C:\\data\\app.db" },
  },
  oracle: {
    label: "Oracle",
    defaultPort: "1521",
    needs: ["host", "port", "serviceName", "user", "password"],
    placeholders: {
      host: "localhost",
      port: "1521",
      serviceName: "XEPDB1",
      user: "system",
    },
  },
  mongodb: {
    label: "MongoDB",
    defaultPort: "27017",
    // If connectionUri is provided, we skip host/port/user/password checks.
    needs: ["connectionUri", "host", "port", "database", "user", "password"],
    placeholders: {
      connectionUri: "mongodb://user:pw@localhost:27017/?directConnection=true",
      host: "localhost",
      port: "27017",
      database: "admin", // Auth DB
      user: "root",
    },
  },
};

/** ---------- New Conn Templates ---------- */
const newNetworkConn = (dbType: Exclude<DbType, "sqlite">): NetworkConn => ({
  id: String(Date.now()),
  name: `${DB_META[dbType].label} Connection`,
  dbType,
  host: "localhost",
  port: DB_META[dbType].defaultPort || "",
  database:
    dbType === "postgres"
      ? "postgres"
      : dbType === "mssql"
      ? "master"
      : dbType === "mysql" || dbType === "mariadb"
      ? "mysql"
      : dbType === "mongodb"
      ? "admin" // Mongo Auth DB
      : undefined, // oracle uses serviceName instead
  serviceName: dbType === "oracle" ? "XEPDB1" : undefined,
  user:
    dbType === "mssql"
      ? "sa"
      : dbType === "postgres"
      ? "postgres"
      : dbType === "oracle"
      ? "system"
      : dbType === "mongodb"
      ? "" // allow no-auth by default
      : "root",
  connectionUri: dbType === "mongodb" ? "" : undefined,
});

const newSqliteConn = (): SqliteConn => ({
  id: String(Date.now()),
  name: "SQLite Connection",
  dbType: "sqlite",
  filePath: "",
});

/** ---------- Persist Profiles (with migration from v1) ---------- */
function loadProfilesV2(): Conn[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function migrateV1ToV2(): Conn[] {
  try {
    const raw = localStorage.getItem(LS_KEY_V1);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const mapped: Conn[] = arr.map((p: any) => ({
      id: p.id ?? String(Date.now()),
      name: p.name ?? "Migrated Connection",
      dbType: "postgres",
      host: p.host ?? "localhost",
      port: p.port ?? "5432",
      database: p.database ?? "postgres",
      user: p.user ?? "postgres",
    }));
    if (mapped.length) localStorage.setItem(LS_KEY, JSON.stringify(mapped));
    return mapped;
  } catch {
    return [];
  }
}

const loadProfiles = (): Conn[] => {
  const v2 = loadProfilesV2();
  if (v2.length) return v2;
  return migrateV1ToV2();
};

const saveProfiles = (arr: Conn[]) =>
  localStorage.setItem(LS_KEY, JSON.stringify(arr));

/** ---------- UI bits ---------- */
const Label = ({ children }: { children: React.ReactNode }) => (
  <label style={{ fontSize: 12, color: "#333" }}>{children}</label>
);

const Field = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    style={{
      width: "100%",
      padding: "8px 10px",
      border: "1px solid #cfcfcf",
      borderRadius: 6,
      outline: "none",
    }}
  />
);

const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    {...props}
    style={{
      width: "100%",
      padding: "8px 10px",
      border: "1px solid #cfcfcf",
      borderRadius: 6,
      outline: "none",
      background: "#fff",
    }}
  />
);

const Button = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    style={{
      padding: "8px 12px",
      borderRadius: 8,
      border: "1px solid #d0d0d0",
      background: props.disabled ? "#f2f2f2" : "#fafafa",
      cursor: props.disabled ? "not-allowed" : "pointer",
    }}
  />
);

/** ---------- DB Type Badges (icons) ---------- */
const DB_BADGE: Record<
  DbType,
  { bg: string; fg: string; label: string; title: string }
> = {
  postgres: { bg: "#336791", fg: "#ffffff", label: "PG", title: "PostgreSQL" },
  mysql: { bg: "#4479A1", fg: "#ffffff", label: "MY", title: "MySQL" },
  mariadb: { bg: "#1F305F", fg: "#ffffff", label: "MA", title: "MariaDB" },
  mssql: { bg: "#CC2927", fg: "#ffffff", label: "MS", title: "SQL Server" },
  sqlite: { bg: "#0E76A8", fg: "#ffffff", label: "SQ", title: "SQLite" },
  oracle: { bg: "#F80000", fg: "#ffffff", label: "OR", title: "Oracle" },
  mongodb: { bg: "#4DB33D", fg: "#ffffff", label: "MO", title: "MongoDB" },
};

function DbIcon({ type }: { type: DbType }) {
  const { bg, fg, label, title } = DB_BADGE[type];
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-label={title}
      role="img"
      style={{ flex: "0 0 22px" }}
    >
      <rect x="2" y="2" width="20" height="20" rx="6" fill={bg} />
      <text
        x="12"
        y="14.5"
        textAnchor="middle"
        fontFamily="Inter, system-ui, Arial"
        fontSize="9"
        fontWeight="700"
        fill={fg}
      >
        {label}
      </text>
    </svg>
  );
}

/** ---------- Helpers ---------- */
function friendlyMsg(raw: string, dbType: DbType) {
  const txt = String(raw).replace(/^db error:\s*/i, "");

  if (/does not exist|unknown database/i.test(txt))
    return "Database not found. Check database name.";
  if (
    /password authentication failed|access denied|login failed|Authentication failed|not authorized/i.test(
      txt
    )
  )
    return "Invalid credentials or not authorized.";
  if (
    /could not connect|connection refused|no such host|ENOTFOUND|ECONNREFUSED|closed connection/i.test(
      txt
    )
  )
    return "Cannot reach server. Check host/port and that the service is running.";
  if (/timeout|ETIMEDOUT|connect timed out/i.test(txt))
    return "Connection timed out. Check network/VPN and port.";
  if (/self[-\s]?signed|certificate|TLS/i.test(txt))
    return "SSL/TLS error. Verify SSL settings or try without SSL.";

  if (dbType === "mssql" && /port|login timeout/i.test(txt))
    return "SQL Server unreachable. Ensure TCP/IP is enabled and port 1433 is open.";
  if ((dbType === "mysql" || dbType === "mariadb") && /handshake/i.test(txt))
    return "Handshake failed. Check user host permissions and auth plugin.";
  if (dbType === "sqlite" && /unable to open database file/i.test(txt))
    return "Cannot open SQLite file. Check path and permissions.";
  if (dbType === "oracle") {
    if (/ORA-01017/i.test(txt))
      return "Invalid Oracle username or password (ORA-01017).";
    if (/ORA-12514/i.test(txt))
      return "Service name not registered (ORA-12514). Check serviceName.";
    if (/ORA-12541|TNS:no listener/i.test(txt))
      return "Listener not reachable (ORA-12541). Ensure port 1521 and listener are running.";
  }
  if (dbType === "mongodb") {
    if (/SRV|TXT record|dns/i.test(txt))
      return "DNS/SRV issue. Check your Mongo SRV URI or DNS.";
    if (/auth/i.test(txt))
      return "Mongo authentication failed. Check user/password and Auth DB.";
  }
  return txt;
}

function makeDefaultForm(dbType: DbType): FormState {
  return dbType === "sqlite"
    ? { ...newSqliteConn() }
    : { ...newNetworkConn(dbType), password: "" };
}

function validateForm(form: FormState): string | null {
  // Special-case MongoDB: if connectionUri provided, accept it and skip other checks.
  if (form.dbType === "mongodb") {
    const uri = (form as NetworkConn).connectionUri?.trim();
    if (uri && uri.length > 0) return null; // URI mode
    // Manual mode: require host/port; user/pw optional; database (auth DB) optional (defaults to admin)
    if (!(form as NetworkConn).host || !(form as NetworkConn).port) {
      return "Fill required fields: Host, Port (or provide a Connection URI).";
    }
    if ((form as any).port && !/^\d+$/.test((form as any).port))
      return "Port must be numeric.";
    return null;
  }

  const needs = DB_META[form.dbType].needs;
  const missing = needs.filter((k) => {
    // Skip connectionUri for non-mongo engines
    if (k === "connectionUri") return false;
    return !(form as any)[k] || String((form as any)[k]).trim() === "";
  });

  if (missing.length) {
    const label = (k: string) =>
      k === "filePath"
        ? "File path"
        : k === "serviceName"
        ? "Service name"
        : k === "connectionUri"
        ? "Connection URI"
        : k[0].toUpperCase() + k.slice(1);
    return `Fill required fields: ${missing.map(label).join(", ")}.`;
  }
  if ("port" in form && (form as any).port && !/^\d+$/.test((form as any).port))
    return "Port must be numeric.";
  return null;
}

/** ---------- App ---------- */
let lastReqId = 0;
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label = "operation"
): Promise<T> {
  const t = sleep(ms).then(() => {
    throw new Error(`${label} timed out`);
  });
  return Promise.race([p, t]) as Promise<T>;
}

export default function App() {
  const [profiles, setProfiles] = useState<Conn[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(makeDefaultForm("postgres"));
  const [notice, setNotice] = useState<Notice>({ kind: "idle" });

  useEffect(() => {
    const arr = loadProfiles();
    if (arr.length === 0) {
      const first = newNetworkConn("postgres");
      setProfiles([first]);
      setSelectedId(first.id);
      setForm({ ...first, password: "" });
    } else {
      setProfiles(arr);
      setSelectedId(arr[0].id);
      const f = arr[0];
      setForm(
        f.dbType === "sqlite"
          ? ({ ...f } as FormState)
          : ({ ...(f as NetworkConn), password: "" } as FormState)
      );
    }
  }, []);

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) || null,
    [profiles, selectedId]
  );

  /** ----- actions ----- */
  function select(id: string) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setSelectedId(id);
    setForm(
      p.dbType === "sqlite"
        ? ({ ...p } as FormState)
        : ({ ...(p as NetworkConn), password: "" } as FormState)
    );
    setNotice({ kind: "idle" });
  }

  function add() {
    const p = newNetworkConn("postgres");
    const next = [...profiles, p];
    setProfiles(next);
    saveProfiles(next);
    setSelectedId(p.id);
    setForm({ ...p, password: "" });
  }

  function duplicate() {
    if (!selected) return;
    const copy: Conn =
      selected.dbType === "sqlite"
        ? {
            ...(selected as SqliteConn),
            id: String(Date.now()),
            name: selected.name + " (copy)",
          }
        : {
            ...(selected as NetworkConn),
            id: String(Date.now()),
            name: selected.name + " (copy)",
          };
    const next = [...profiles, copy];
    setProfiles(next);
    saveProfiles(next);
    setSelectedId(copy.id);
    setForm(
      copy.dbType === "sqlite"
        ? ({ ...copy } as FormState)
        : ({ ...(copy as NetworkConn), password: "" } as FormState)
    );
  }

  function remove() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"?`)) return;
    const next = profiles.filter((p) => p.id !== selected.id);
    setProfiles(next);
    saveProfiles(next);
    const fallback = next[0] ?? newNetworkConn("postgres");
    if (!next[0]) {
      const fresh = [fallback];
      setProfiles(fresh);
      saveProfiles(fresh);
    }
    setSelectedId(fallback.id);
    setForm({ ...(fallback as NetworkConn), password: "" });
  }

  function save() {
    const { password, ...toSave } = form as any;
    const idx = profiles.findIndex((p) => p.id === (form as any).id);
    const next = profiles.slice();
    if (idx === -1) next.push(toSave as Conn);
    else next[idx] = toSave as Conn;
    setProfiles(next);
    saveProfiles(next);
    setNotice({ kind: "ok", msg: "Saved (password not stored)." });
  }

  function onDbTypeChange(nextType: DbType) {
    setForm((prev) => {
      const id = (prev as any).id || String(Date.now());
      const name =
        (prev as any).name || `${DB_META[nextType].label} Connection`;
      if (nextType === "sqlite")
        return { id, name, dbType: "sqlite", filePath: "" };
      const meta = DB_META[nextType];
      return {
        id,
        name,
        dbType: nextType,
        host: "localhost",
        port: meta.defaultPort || "",
        database:
          nextType === "postgres"
            ? "postgres"
            : nextType === "mssql"
            ? "master"
            : nextType === "mysql" || nextType === "mariadb"
            ? "mysql"
            : nextType === "mongodb"
            ? "admin"
            : undefined,
        serviceName: nextType === "oracle" ? "XEPDB1" : undefined,
        user:
          nextType === "mssql"
            ? "sa"
            : nextType === "postgres"
            ? "postgres"
            : nextType === "oracle"
            ? "system"
            : nextType === "mongodb"
            ? ""
            : "root",
        connectionUri: nextType === "mongodb" ? "" : undefined,
        password: "",
      } as FormState;
    });
  }

  async function testConnection() {
    const err = validateForm(form);
    if (err) {
      setNotice({ kind: "err", msg: err });
      return;
    }

    const reqId = ++lastReqId;
    setNotice({ kind: "loading", msg: "Testing connection…" });

    try {
      await invoke<string>("test_connection", { profile: form });
      if (reqId === lastReqId) {
        setNotice({ kind: "ok", msg: "Connection OK" });
      }
    } catch (e: any) {
      if (reqId === lastReqId) {
        setNotice({ kind: "err", msg: friendlyMsg(String(e), form.dbType) });
      }
    }
  }

  /** ----- render ----- */
  const meta = DB_META[form.dbType];

  // Helpers to render connection preview lines in the sidebar
  const previewFor = (p: Conn) => {
    if (p.dbType === "sqlite") return (p as SqliteConn).filePath || "No file";
    if (p.dbType === "oracle")
      return `${(p as NetworkConn).user}@${(p as NetworkConn).host}:${
        (p as NetworkConn).port
      }/${(p as NetworkConn).serviceName}`;
    if (p.dbType === "mongodb") {
      const uri = (p as NetworkConn).connectionUri?.trim();
      return uri && uri.length > 0
        ? uri
        : `${(p as NetworkConn).user || "(no-auth)"}@${
            (p as NetworkConn).host
          }:${(p as NetworkConn).port}/${
            (p as NetworkConn).database || "admin"
          }`;
    }
    return `${(p as NetworkConn).user}@${(p as NetworkConn).host}:${
      (p as NetworkConn).port
    }/${(p as NetworkConn).database}`;
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        fontFamily: "Inter, system-ui, Arial",
      }}
    >
      {/* Sidebar */}
      <aside style={{ borderRight: "1px solid #eee", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Button onClick={add}>＋ Add</Button>
          <Button onClick={duplicate} disabled={!selected}>
            ⎘ Duplicate
          </Button>
          <Button onClick={remove} disabled={!selected}>
            🗑 Delete
          </Button>
        </div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Connections</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            overflowY: "auto",
            maxHeight: "82vh",
          }}
        >
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => select(p.id)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #e5e5e5",
                background: selectedId === p.id ? "#eef6ff" : "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
              title={previewFor(p)}
            >
              <DbIcon type={p.dbType} />
              <div style={{ display: "grid" }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {DB_META[p.dbType].label} • {previewFor(p)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding: 14 }}>
        <h3 style={{ margin: "4px 0 8px" }}>DB Backup Client – Setup</h3>

        {/* Top notice bar */}
        {notice.kind !== "idle" && (
          <div
            style={{
              marginBottom: 10,
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 14,
              color:
                notice.kind === "ok"
                  ? "#0a4d23"
                  : notice.kind === "err"
                  ? "#721c24"
                  : "#333",
              background:
                notice.kind === "ok"
                  ? "#d4edda"
                  : notice.kind === "err"
                  ? "#f8d7da"
                  : "#f1f1f1",
              border:
                notice.kind === "ok"
                  ? "1px solid #c3e6cb"
                  : notice.kind === "err"
                  ? "1px solid #f5c6cb"
                  : "1px solid #ddd",
            }}
          >
            {notice.msg}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, maxWidth: 620 }}>
          {/* DB Type with badge */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <Label>Database Type</Label>
              <DbIcon type={form.dbType} />
            </div>
            <Select
              value={form.dbType}
              onChange={(e) => onDbTypeChange(e.target.value as DbType)}
            >
              <option value="postgres">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="mariadb">MariaDB</option>
              <option value="mssql">SQL Server</option>
              <option value="sqlite">SQLite</option>
              <option value="oracle">Oracle</option>
              <option value="mongodb">MongoDB</option>
            </Select>
          </div>

          {/* Name */}
          <div>
            <Label>Connection name</Label>
            <Field
              placeholder={`${DB_META[form.dbType].label} – My DB`}
              value={(form as any).name}
              onChange={(e) =>
                setForm({ ...(form as any), name: e.target.value })
              }
            />
          </div>

          {/* Conditional fields */}
          {form.dbType === "sqlite" ? (
            <div>
              <Label>SQLite file path</Label>
              <Field
                placeholder={meta.placeholders?.filePath || ""}
                value={(form as SqliteConn).filePath}
                onChange={(e) =>
                  setForm({ ...(form as SqliteConn), filePath: e.target.value })
                }
              />
              <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
                Tip: point to an existing .db file (the app won’t create it
                during test).
              </div>
            </div>
          ) : form.dbType === "mongodb" ? (
            <>
              {/* URI mode */}
              <div>
                <Label>Connection URI (optional)</Label>
                <Field
                  placeholder={meta.placeholders?.connectionUri || ""}
                  value={(form as NetworkConn).connectionUri || ""}
                  onChange={(e) =>
                    setForm({
                      ...(form as NetworkConn),
                      connectionUri: e.target.value,
                    })
                  }
                />
              </div>

              {/* Manual mode */}
              <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />
              <div style={{ fontSize: 12, color: "#666" }}>
                Or fill manual settings:
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <Label>Host</Label>
                  <Field
                    placeholder={meta.placeholders?.host || "localhost"}
                    value={(form as NetworkConn).host}
                    onChange={(e) =>
                      setForm({
                        ...(form as NetworkConn),
                        host: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Port</Label>
                  <Field
                    placeholder={meta.defaultPort || "27017"}
                    value={(form as NetworkConn).port}
                    onChange={(e) =>
                      setForm({
                        ...(form as NetworkConn),
                        port: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <Label>Auth DB</Label>
                  <Field
                    placeholder={meta.placeholders?.database || "admin"}
                    value={(form as NetworkConn).database || ""}
                    onChange={(e) =>
                      setForm({
                        ...(form as NetworkConn),
                        database: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>User (optional)</Label>
                  <Field
                    placeholder={meta.placeholders?.user || ""}
                    value={(form as NetworkConn).user}
                    onChange={(e) =>
                      setForm({
                        ...(form as NetworkConn),
                        user: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label>Password (optional, not saved)</Label>
                <Field
                  type="password"
                  placeholder="••••••••"
                  value={(form as any).password || ""}
                  onChange={(e) =>
                    setForm({ ...(form as any), password: e.target.value })
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <Label>Host</Label>
                  <Field
                    placeholder={meta.placeholders?.host || "localhost"}
                    value={(form as NetworkConn).host}
                    onChange={(e) =>
                      setForm({
                        ...(form as NetworkConn),
                        host: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Port</Label>
                  <Field
                    placeholder={meta.defaultPort || ""}
                    value={(form as NetworkConn).port}
                    onChange={(e) =>
                      setForm({
                        ...(form as NetworkConn),
                        port: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {/* Oracle uses serviceName; others use database */}
              {form.dbType === "oracle" ? (
                <>
                  <div>
                    <Label>Service name</Label>
                    <Field
                      placeholder={meta.placeholders?.serviceName || "XEPDB1"}
                      value={(form as NetworkConn).serviceName || ""}
                      onChange={(e) =>
                        setForm({
                          ...(form as NetworkConn),
                          serviceName: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>User</Label>
                    <Field
                      placeholder={meta.placeholders?.user || ""}
                      value={(form as NetworkConn).user}
                      onChange={(e) =>
                        setForm({
                          ...(form as NetworkConn),
                          user: e.target.value,
                        })
                      }
                    />
                  </div>
                </>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <Label>Database</Label>
                    <Field
                      placeholder={meta.placeholders?.database || ""}
                      value={(form as NetworkConn).database || ""}
                      onChange={(e) =>
                        setForm({
                          ...(form as NetworkConn),
                          database: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>User</Label>
                    <Field
                      placeholder={meta.placeholders?.user || ""}
                      value={(form as NetworkConn).user}
                      onChange={(e) =>
                        setForm({
                          ...(form as NetworkConn),
                          user: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div>
                <Label>Password (not saved)</Label>
                <Field
                  type="password"
                  placeholder="••••••••"
                  value={(form as any).password || ""}
                  onChange={(e) =>
                    setForm({ ...(form as any), password: e.target.value })
                  }
                />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={save}>💾 Save</Button>
            <Button
              onClick={testConnection}
              disabled={notice.kind === "loading"}
            >
              {notice.kind === "loading" ? "⏳ Testing…" : "🧪 Test Connection"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
