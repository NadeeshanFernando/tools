// Manages backup modal state and listens to backup progress events.
import { useEffect, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { BackupState } from "./progress.types";
import { FormState } from "../connections/types";
import { backupConnection } from "./tauri.client";

export function useBackup() {
  const [backup, setBackup] = useState<BackupState>({ open:false, stage:"starting", percent:0, log:[] });

  // Subscribes to "backup-progress" events.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    (async () => {
      unlisten = await listen<{ stage:string; percent?:number; detail?:string }>("backup-progress", (evt) => {
        const { stage, percent, detail } = evt.payload;
        setBackup(prev => ({
          open: true,
          stage,
          percent: typeof percent === "number" ? percent : null,
          detail,
          log: detail ? [...prev.log, `[${new Date().toLocaleTimeString()}] ${detail}`] : prev.log
        }));
      });
    })();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Starts a backup and opens the modal.
  async function startBackup(form: FormState, destPath: string, compress: boolean) {
    setBackup({ open:true, stage:"starting", percent:0, log:[], detail:"Starting…" });
    try { await backupConnection(form, destPath, compress); } catch (e:any) {
      setBackup(prev => ({ ...prev, stage:"error", percent:null, log:[...prev.log, String(e)], detail:String(e) }));
    }
  }

  // Closes and resets the backup modal state.
  function closeBackup() { setBackup({ open:false, stage:"starting", percent:0, log:[] }); }

  return { backup, startBackup, closeBackup, setBackup };
}
