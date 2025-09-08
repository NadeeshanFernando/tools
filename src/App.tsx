import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** ---------- Types ---------- */
type Conn = {
  id: string;
  name: string;
  dbType: "postgres";
  host: string;
  port: string;
  database: string;
  user: string;
};
type FormState = Conn & { password: string };

type Notice =
  | { kind: "idle" }
  | { kind: "loading"; msg: string }
  | { kind: "ok"; msg: string }
  | { kind: "err"; msg: string };

/** ---------- Helpers ---------- */
const LS_KEY = "dbc_profiles_v1";
const newConn = (): Conn => ({
  id: String(Date.now()),
  name: "New Connection",
  dbType: "postgres",
  host: "localhost",
  port: "5432",
  database: "postgres",
  user: "postgres",
});
const loadProfiles = (): Conn[] => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const saveProfiles = (arr: Conn[]) => localStorage.setItem(LS_KEY, JSON.stringify(arr));

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

function friendlyMsg(raw: string) {
  if (/does not exist/i.test(raw)) return "Database not found. Check database name.";
  if (/password authentication failed/i.test(raw)) return "Invalid username or password.";
  if (/could not connect|connection refused|no such host/i.test(raw))
    return "Cannot reach server. Check host/port and that PostgreSQL is running.";
  if (/timeout/i.test(raw)) return "Connection timed out. Check network/VPN and port.";
  return raw.replace(/^db error:\s*/i, "");
}

/** ---------- App ---------- */
export default function App() {
  // saved profiles
  const [profiles, setProfiles] = useState<Conn[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // form (includes non-persisted password)
  const [form, setForm] = useState<FormState>({ ...newConn(), password: "" });

  // notice bar
  const [notice, setNotice] = useState<Notice>({ kind: "idle" });

  // load on mount
  useEffect(() => {
    const arr = loadProfiles();
    if (arr.length === 0) {
      const first = newConn();
      setProfiles([first]);
      setSelectedId(first.id);
      setForm({ ...first, password: "" });
    } else {
      setProfiles(arr);
      setSelectedId(arr[0].id);
      setForm({ ...arr[0], password: "" });
    }
  }, []);

  const selected = useMemo(() => profiles.find(p => p.id === selectedId) || null, [profiles, selectedId]);

  /** ----- actions ----- */
  function select(id: string) {
    const p = profiles.find(x => x.id === id);
    if (!p) return;
    setSelectedId(id);
    setForm({ ...p, password: "" });
    setNotice({ kind: "idle" });
  }

  function add() {
    const p = newConn();
    const next = [...profiles, p];
    setProfiles(next);
    saveProfiles(next);
    setSelectedId(p.id);
    setForm({ ...p, password: "" });
  }

  function duplicate() {
    if (!selected) return;
    const copy: Conn = { ...selected, id: String(Date.now()), name: selected.name + " (copy)" };
    const next = [...profiles, copy];
    setProfiles(next);
    saveProfiles(next);
    setSelectedId(copy.id);
    setForm({ ...copy, password: "" });
  }

  function remove() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"?`)) return;
    const next = profiles.filter(p => p.id !== selected.id);
    setProfiles(next);
    saveProfiles(next);
    const fallback = next[0] ?? newConn();
    if (!next[0]) {
      const fresh = [fallback];
      setProfiles(fresh);
      saveProfiles(fresh);
    }
    setSelectedId(fallback.id);
    setForm({ ...fallback, password: "" });
  }

  function save() {
    const { password, ...toSave } = form;
    const idx = profiles.findIndex(p => p.id === form.id);
    const next = profiles.slice();
    if (idx === -1) next.push(toSave);
    else next[idx] = toSave;
    setProfiles(next);
    saveProfiles(next);
    setNotice({ kind: "ok", msg: "Saved (password not stored)." });
  }

  async function testConnection() {
    if (!form.host || !form.port || !form.database || !form.user) {
      setNotice({ kind: "err", msg: "Fill host, port, database, and user." });
      return;
    }
    setNotice({ kind: "loading", msg: "Testing connection…" });
    try {
      await invoke("test_connection", { profile: form });
      setNotice({ kind: "ok", msg: "Connection OK" });
    } catch (e: any) {
      setNotice({ kind: "err", msg: friendlyMsg(String(e)) });
    }
  }

  /** ----- render ----- */
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
          <Button onClick={duplicate} disabled={!selected}>⎘ Duplicate</Button>
          <Button onClick={remove} disabled={!selected}>🗑 Delete</Button>
        </div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Connections</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: "82vh" }}>
          {profiles.map(p => (
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
              }}
              title={`${p.user}@${p.host}:${p.port}/${p.database}`}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "#666" }}>
                {p.user}@{p.host}:{p.port}/{p.database}
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
              color: notice.kind === "ok" ? "#0a4d23" : notice.kind === "err" ? "#721c24" : "#333",
              background:
                notice.kind === "ok" ? "#d4edda" : notice.kind === "err" ? "#f8d7da" : "#f1f1f1",
              border:
                notice.kind === "ok" ? "1px solid #c3e6cb" : notice.kind === "err" ? "1px solid #f5c6cb" : "1px solid #ddd",
            }}
          >
            {notice.msg}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <div>
            <Label>Connection name</Label>
            <Field
              placeholder="My database"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>
              <Label>Host</Label>
              <Field
                placeholder="localhost"
                value={form.host}
                onChange={e => setForm({ ...form, host: e.target.value })}
              />
            </div>
            <div>
              <Label>Port</Label>
              <Field
                placeholder="5432"
                value={form.port}
                onChange={e => setForm({ ...form, port: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Label>Database</Label>
              <Field
                placeholder="postgres"
                value={form.database}
                onChange={e => setForm({ ...form, database: e.target.value })}
              />
            </div>
            <div>
              <Label>User</Label>
              <Field
                placeholder="postgres"
                value={form.user}
                onChange={e => setForm({ ...form, user: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Password (not saved)</Label>
            <Field
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={save}>💾 Save</Button>
            <Button onClick={testConnection}>🧪 Test Connection</Button>
          </div>
        </div>
      </main>
    </div>
  );
}
