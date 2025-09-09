// Presents restore UI (file pick, mode, progress, logs).
import React from "react";
import { Backdrop } from "../../components/ui/Backdrop";
import { DbIcon } from "../../components/ui/DbIcon";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Button } from "../../components/ui/Button";
import { Label } from "../../components/ui/Label";
import { Field } from "../../components/ui/Field";
import { RestoreState } from "./progress.types";
import { FormState } from "../connections/types";

export const RestoreModal: React.FC<{
  open:boolean; state:RestoreState; form:FormState;
  onClose:()=>void; onBrowse:()=>void; onStart:()=>void;
  setNewName:(s:string)=>void; setModeDrop:()=>void; setModeCreate:()=>void;
}> = ({ open, state, form, onClose, onBrowse, onStart, setNewName, setModeDrop, setModeCreate }) => {
  if (!open) return null;
  return (
    <Backdrop>
      <div style={{ display:"grid", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <DbIcon type={form.dbType as any} />
          <div>
            <div style={{ fontWeight:700, fontSize:16 }}>Restore – {(form as any).name || form.dbType}</div>
            <div style={{ fontSize:12, color:"#555" }}>{state.stage}</div>
          </div>
        </div>

        <div style={{ display:"grid", gap:8 }}>
          <div>
            <Label>Backup file</Label>
            <div style={{ display:"flex", gap:8 }}>
              <Field placeholder="Choose a .dump / .sql / .gz file…" value={state.filePath ?? ""} readOnly />
              <Button onClick={onBrowse} disabled={state.picking || state.inProgress}>{state.picking ? "Picking…" : "Browse…"}</Button>
            </div>
            <div style={{ fontSize:11, color:"#666", marginTop:4 }}>• Custom format (*.dump) uses pg_restore; plain SQL (*.sql) uses psql.</div>
          </div>

          <div>
            <Label>Restore mode</Label>
            <div style={{ display:"grid", gap:6, marginTop:6 }}>
              <label style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="radio" name="restore-mode" checked={state.mode==="drop_and_restore"} onChange={setModeDrop} disabled={state.inProgress} />
                <div>
                  <div style={{ fontWeight:600 }}>Drop all & restore into current database</div>
                  <div style={{ fontSize:12, color:"#666" }}>Drops all objects in <strong>{(form as any).database || "postgres"}</strong> then restores.</div>
                </div>
              </label>

              <label style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input type="radio" name="restore-mode" checked={state.mode==="create_new"} onChange={setModeCreate} disabled={state.inProgress} />
                <div style={{ width:"100%" }}>
                  <div style={{ fontWeight:600 }}>Create new database & restore</div>
                  <div style={{ fontSize:12, color:"#666", marginBottom:6 }}>Creates a fresh database and restores into it.</div>
                  <Field placeholder="new_database_name" value={state.newDbName} onChange={(e)=>setNewName(e.target.value)} disabled={state.inProgress || state.mode!=="create_new"} />
                </div>
              </label>
            </div>
          </div>
        </div>

        <ProgressBar percent={state.percent ?? null} />
        {state.detail && <div style={{ fontSize:12, color:"#444" }}>{state.detail}</div>}

        <div style={{ maxHeight:180, overflow:"auto", background:"#fafafa", border:"1px solid #eee", borderRadius:8, padding:8, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize:12 }}>
          {state.log.length===0 ? <div style={{color:"#888"}}>No messages yet…</div> : state.log.map((l,i)=><div key={i}>{l}</div>)}
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          {!state.inProgress ? (<><Button onClick={onClose}>Close</Button><Button onClick={onStart} disabled={!state.filePath || (state.mode==="create_new" && !state.newDbName.trim())}>Start Restore</Button></>) : (<Button disabled>Restoring…</Button>)}
        </div>
      </div>
    </Backdrop>
  );
};
