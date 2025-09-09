// Composes sidebar + form + modals; orchestrates top-level state.
import { useState } from "react";
import { useConnections } from "../src/features/connections/useConnections";
import { ConnectionsSidebar } from "../src/features/connections/ConnectionsSidebar";
import { ConnectionForm } from "../src/features/connections/ConnectionForm";
import { useBackup } from "../src/features/backupRestore/useBackup";
import { useRestore } from "../src/features/backupRestore/useRestore";
import { BackupModal } from "../src/features/backupRestore/BackupModal";
import { RestoreModal } from "../src/features/backupRestore/RestoreModal";
import { validateForm } from "../src/features/connections/profiles.validation";
import { friendlyMsg } from "../src/lib/errors/friendlyMessage";
import { testConnection } from "../src/features/backupRestore/tauri.client";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

export default function App() {
  // Holds notice state for the form actions.
  const [notice, setNotice] = useState<{kind:"idle"|"ok"|"err"|"loading"; msg?:string}>({ kind:"idle" });

  // Connections feature state.
  const { profiles, selectedId, selected, form, setForm, select, add, duplicate, remove, saveConn, onDbTypeChange } = useConnections();

  // Backup & restore feature state.
  const { backup, startBackup, closeBackup } = useBackup();
  const { restore, openRestore, closeRestore, pickRestoreFile, startRestore, setRestore } = useRestore();

  // Tests the current connection via backend.
  async function onTest() {
    const err = validateForm(form); if (err) return setNotice({kind:"err", msg: err});
    setNotice({ kind:"loading", msg:"Testing connection…" });
    try { await testConnection(form); setNotice({ kind:"ok", msg:"Connection OK" }); }
    catch (e:any) { setNotice({ kind:"err", msg: friendlyMsg(String(e), form.dbType) }); }
  }

  // Starts a backup and opens the save dialog.
  async function onBackup() {
    const err = validateForm(form); if (err) return setNotice({kind:"err", msg: err});
    const ts = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    const base = `${(form as any).name || form.dbType}-${ts}`;
    const ext = form.dbType==="mssql"?"bak": form.dbType==="sqlite"?"db": form.dbType==="mongodb"?"archive": form.dbType==="postgres"?"dump":"sql";
    const dest = await saveDialog({ title:"Save backup as…", defaultPath:`${base}.${ext}`, filters:[{name:"All files",extensions:["*"]},{name:"SQL",extensions:["sql"]},{name:"Postgres custom dump",extensions:["dump"]},{name:"SQL Server BAK",extensions:["bak"]},{name:"Mongo archive",extensions:["archive"]},{name:"GZip",extensions:["gz"]}] });
    if (!dest || typeof dest !== "string") return;
    const compressDefault = form.dbType==="postgres" || form.dbType==="mongodb";
    const compress = form.dbType==="sqlite" || form.dbType==="mssql" ? false : compressDefault;
    await startBackup(form, dest, compress);
  }

  return (
    <div style={{ height:"100vh", display:"grid", gridTemplateColumns:"240px 1fr", fontFamily:"Inter, system-ui, Arial" }}>
      <ConnectionsSidebar profiles={profiles} selectedId={selectedId} onSelect={select} onAdd={add} onDup={duplicate} onDel={remove} />
      <div>
        {selected && (
          <ConnectionForm
            form={form} setForm={setForm}
            notice={notice}
            onDbTypeChange={onDbTypeChange}
            onSave={() => { saveConn(); setNotice({kind:"ok", msg:"Saved (password not stored)."}); }}
            onTest={onTest}
            onBackup={onBackup}
            onOpenRestore={() => {
              if (form.dbType !== "postgres") { setNotice({ kind:"err", msg:"Restore is currently implemented for PostgreSQL only." }); return; }
              openRestore();
            }}
          />
        )}
      </div>

      <BackupModal open={backup.open} state={backup} form={form} onClose={closeBackup} />

      <RestoreModal
        open={restore.open}
        state={restore}
        form={form}
        onClose={closeRestore}
        onBrowse={pickRestoreFile}
        onStart={() => startRestore(form)}
        setNewName={(s)=>setRestore(p=>({ ...p, newDbName:s }))}
        setModeDrop={()=>setRestore(p=>({ ...p, mode:"drop_and_restore" }))}
        setModeCreate={()=>setRestore(p=>({ ...p, mode:"create_new" }))}
      />
    </div>
  );
}
