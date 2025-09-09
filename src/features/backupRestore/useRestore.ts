// Manages restore modal state, file picking, and progress events.
import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { FormState } from "../connections/types";
import { RestoreMode, RestoreState } from "./progress.types";
import { restoreConnection } from "./tauri.client";

export function useRestore() {
  const [restore, setRestore] = useState<RestoreState>({
    open:false, picking:false, inProgress:false, filePath:null, mode:"drop_and_restore", newDbName:"", stage:"starting", percent:0, log:[]
  });

  // Subscribes to "restore-progress" events.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      unlisten = await listen<{ stage:string; percent?:number; detail?:string }>("restore-progress", (evt) => {
        const { stage, percent, detail } = evt.payload;
        setRestore(prev => ({
          ...prev,
          inProgress: stage !== "done" && stage !== "error",
          stage,
          percent: typeof percent === "number" ? percent : null,
          detail,
          log: detail ? [...prev.log, `[${new Date().toLocaleTimeString()}] ${detail}`] : prev.log
        }));
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Opens the restore modal.
  function openRestore() { setRestore({ open:true, picking:false, inProgress:false, filePath:null, mode:"drop_and_restore", newDbName:"", stage:"starting", percent:0, log:[] }); }

  // Opens a file dialog to pick a restore source.
  async function pickRestoreFile() {
    setRestore(p => ({ ...p, picking:true }));
    const fp = await openDialog({ title:"Select backup file to restore", multiple:false, directory:false, filters:[{name:"Postgres dumps", extensions:["dump","sql","gz"]},{name:"All files",extensions:["*"]}] });
    setRestore(p => ({ ...p, picking:false, filePath: typeof fp === "string" ? fp : null }));
  }

  // Validates whether the restore can be started.
  function canStartRestore(): string | null {
    if (!restore.filePath) return "Pick a backup file to restore.";
    if (restore.mode === "create_new" && !restore.newDbName.trim()) return "Enter a new database name.";
    return null;
  }

  // Starts the restore process.
  async function startRestore(form: FormState) {
    if (canStartRestore()) return;
    setRestore(p => ({ ...p, inProgress:true, stage:"starting", percent:0, log:[] }));
    try {
      await restoreConnection(form, restore.filePath!, {
        strategy: restore.mode as RestoreMode,
        newDbName: restore.mode === "create_new" ? restore.newDbName.trim() : null,
      });
    } catch (e:any) {
      setRestore(prev => ({ ...prev, inProgress:false, stage:"error", percent:null, log:[...prev.log, String(e)], detail:String(e) }));
    }
  }

  // Closes the restore modal.
  function closeRestore() { setRestore(p => ({ ...p, open:false })); }

  return { restore, setRestore, openRestore, pickRestoreFile, canStartRestore, startRestore, closeRestore };
}
