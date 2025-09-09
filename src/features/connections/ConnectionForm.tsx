// Renders the DB-type-aware form and action buttons.
import React from "react";
import { Label } from "../../components/ui/Label";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { NoticeBar } from "../../components/ui/NoticeBar";
import { DbIcon } from "../../components/ui/DbIcon";
import { FormState, NetworkConn, SqliteConn } from "./types";
import { DB_META } from "./dbMeta";

// (Optional) show your logo instead of the gray box:
import octopusLogo from "../../../src-tauri/icons/Square44x44Logo.png";

export const ConnectionForm: React.FC<{
  form: FormState;
  setForm: (f:FormState)=>void;
  notice: {kind:"idle"|"ok"|"err"|"loading"; msg?:string};
  onDbTypeChange: (db:any)=>void;
  onSave: ()=>void;
  onTest: ()=>void;
  onBackup: ()=>void;
  onOpenRestore: ()=>void;
}> = ({ form, setForm, notice, onDbTypeChange, onSave, onTest, onBackup, onOpenRestore }) => {
  const meta = DB_META[form.dbType];

  return (
    <div style={{ padding:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, margin:"4px 0 8px" }}>
        <img src={octopusLogo} alt="Octopus Logo" style={{ width:50, height:50, borderRadius:6 }} />
        <h3 style={{ margin:0 }}>Octopus DB Backup</h3>
      </div>

      {notice.kind !== "idle" && (
        <NoticeBar
          kind={notice.kind === "loading" ? "loading" : (notice.kind as any)}
          msg={notice.msg || ""}
        />
      )}

      <div style={{ display:"grid", gap:10, maxWidth:700 }}>
        {/* DB Type */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <Label>Database Type</Label>
            <DbIcon type={form.dbType as any} />
          </div>
          <Select value={form.dbType} onChange={(e)=>onDbTypeChange(e.target.value)}>
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
            placeholder={`${meta.label} – My DB`}
            value={(form as any).name}
            onChange={(e)=>setForm({ ...(form as any), name: e.target.value })}
          />
        </div>

        {/* ----- CONDITIONAL FIELDS BY DB TYPE ----- */}

        {/* SQLite */}
        {form.dbType === "sqlite" ? (
          <div>
            <Label>SQLite file path</Label>
            <Field
              placeholder={meta.placeholders?.filePath || ""}
              value={(form as SqliteConn).filePath}
              onChange={(e)=>setForm({ ...(form as SqliteConn), filePath: e.target.value } as FormState)}
            />
            <div style={{ fontSize:11, color:"#666", marginTop:4 }}>
              Tip: point to an existing .db file (the app won’t create it during test).
            </div>
          </div>
        ) : form.dbType === "mongodb" ? (
          /* MongoDB */
          <>
            {/* URI mode */}
            <div>
              <Label>Connection URI (optional)</Label>
              <Field
                placeholder={meta.placeholders?.connectionUri || ""}
                value={(form as NetworkConn).connectionUri || ""}
                onChange={(e)=>setForm({ ...(form as NetworkConn), connectionUri: e.target.value } as FormState)}
              />
            </div>

            {/* Divider + manual mode */}
            <div style={{ height:1, background:"#eee", margin:"6px 0" }} />
            <div style={{ fontSize:12, color:"#666" }}>Or fill manual settings:</div>

            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
              <div>
                <Label>Host</Label>
                <Field
                  placeholder={meta.placeholders?.host || "localhost"}
                  value={(form as NetworkConn).host}
                  onChange={(e)=>setForm({ ...(form as NetworkConn), host: e.target.value } as FormState)}
                />
              </div>
              <div>
                <Label>Port</Label>
                <Field
                  placeholder={meta.defaultPort || "27017"}
                  value={(form as NetworkConn).port}
                  onChange={(e)=>setForm({ ...(form as NetworkConn), port: e.target.value } as FormState)}
                />
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div>
                <Label>Auth DB</Label>
                <Field
                  placeholder={meta.placeholders?.database || "admin"}
                  value={(form as NetworkConn).database || ""}
                  onChange={(e)=>setForm({ ...(form as NetworkConn), database: e.target.value } as FormState)}
                />
              </div>
              <div>
                <Label>User (optional)</Label>
                <Field
                  placeholder={meta.placeholders?.user || ""}
                  value={(form as NetworkConn).user}
                  onChange={(e)=>setForm({ ...(form as NetworkConn), user: e.target.value } as FormState)}
                />
              </div>
            </div>

            <div>
              <Label>Password (optional, not saved)</Label>
              <Field
                type="password"
                placeholder="••••••••"
                value={(form as any).password || ""}
                onChange={(e)=>setForm({ ...(form as any), password: e.target.value })}
              />
            </div>
          </>
        ) : (
          /* Other network DBs */
          <>
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
              <div>
                <Label>Host</Label>
                <Field
                  placeholder={meta.placeholders?.host || "localhost"}
                  value={(form as NetworkConn).host}
                  onChange={(e)=>setForm({ ...(form as NetworkConn), host: e.target.value } as FormState)}
                />
              </div>
              <div>
                <Label>Port</Label>
                <Field
                  placeholder={meta.defaultPort || ""}
                  value={(form as NetworkConn).port}
                  onChange={(e)=>setForm({ ...(form as NetworkConn), port: e.target.value } as FormState)}
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
                    onChange={(e)=>setForm({ ...(form as NetworkConn), serviceName: e.target.value } as FormState)}
                  />
                </div>
                <div>
                  <Label>User</Label>
                  <Field
                    placeholder={meta.placeholders?.user || ""}
                    value={(form as NetworkConn).user}
                    onChange={(e)=>setForm({ ...(form as NetworkConn), user: e.target.value } as FormState)}
                  />
                </div>
              </>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div>
                  <Label>Database</Label>
                  <Field
                    placeholder={meta.placeholders?.database || ""}
                    value={(form as NetworkConn).database || ""}
                    onChange={(e)=>setForm({ ...(form as NetworkConn), database: e.target.value } as FormState)}
                  />
                </div>
                <div>
                  <Label>User</Label>
                  <Field
                    placeholder={meta.placeholders?.user || ""}
                    value={(form as NetworkConn).user}
                    onChange={(e)=>setForm({ ...(form as NetworkConn), user: e.target.value } as FormState)}
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
                onChange={(e)=>setForm({ ...(form as any), password: e.target.value })}
              />
            </div>
          </>
        )}

        {/* Action buttons */}
        <div style={{ display:"flex", gap:8 }}>
          <Button onClick={onSave}>💾 Save</Button>
          <Button onClick={onTest} disabled={notice.kind==="loading"}>
            {notice.kind==="loading" ? "⏳ Testing…" : "🧪 Test Connection"}
          </Button>
          <Button onClick={onBackup}>🗄️ Backup</Button>
          <Button onClick={onOpenRestore}>🧩 Restore</Button>
        </div>
      </div>
    </div>
  );
};
