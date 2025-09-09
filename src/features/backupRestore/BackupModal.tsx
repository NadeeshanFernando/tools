// Presents backup progress UI and log.
import React from "react";
import { Backdrop } from "../../components/ui/Backdrop";
import { DbIcon } from "../../components/ui/DbIcon";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Button } from "../../components/ui/Button";
import { BackupState } from "./progress.types";
import { FormState } from "../connections/types";

export const BackupModal: React.FC<{
  open:boolean; state:BackupState; form:FormState; onClose:()=>void;
}> = ({ open, state, form, onClose }) => {
  if (!open) return null;
  return (
    <Backdrop>
      <div style={{ display:"grid", gap:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <DbIcon type={form.dbType as any} />
          <div>
            <div style={{ fontWeight:700, fontSize:16 }}>Backing up: {(form as any).name || form.dbType}</div>
            <div style={{ fontSize:12, color:"#555" }}>{state.stage}</div>
          </div>
        </div>
        <ProgressBar percent={state.percent ?? null} />
        {state.detail && <div style={{ fontSize:12, color:"#444" }}>{state.detail}</div>}
        <div style={{ maxHeight:160, overflow:"auto", background:"#fafafa", border:"1px solid #eee", borderRadius:8, padding:8, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize:12 }}>
          {state.log.length===0 ? <div style={{color:"#888"}}>No messages yet…</div> : state.log.map((l,i)=><div key={i}>{l}</div>)}
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Backdrop>
  );
};
