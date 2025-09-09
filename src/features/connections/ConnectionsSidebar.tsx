// Renders the sidebar with profiles and actions.
import React from "react";
import { Button } from "../../components/ui/Button";
import { DbIcon } from "../../components/ui/DbIcon";
import { Conn } from "./types";
import { previewFor } from "./preview.util";
import { DB_META } from "./dbMeta";

export const ConnectionsSidebar: React.FC<{
  profiles: Conn[]; selectedId: string|null;
  onSelect:(id:string)=>void; onAdd:()=>void; onDup:()=>void; onDel:()=>void;
}> = ({ profiles, selectedId, onSelect, onAdd, onDup, onDel }) => (
  <aside style={{ borderRight:"1px solid #eee", padding:12 }}>
    <div style={{ display:"flex", gap:8, marginBottom:10 }}>
      <Button onClick={onAdd}>＋ Add</Button>
      <Button onClick={onDup} disabled={!selectedId}>⎘ Duplicate</Button>
      <Button onClick={onDel} disabled={!selectedId}>🗑 Delete</Button>
    </div>
    <div style={{ fontWeight:600, marginBottom:6 }}>Connections</div>
    <div style={{ display:"flex", flexDirection:"column", gap:6, overflowY:"auto", maxHeight:"82vh" }}>
      {profiles.map((p) => (
        <button key={p.id} onClick={() => onSelect(p.id)}
          style={{ textAlign:"left", padding:"8px 10px", borderRadius:8, border:"1px solid #e5e5e5", background: selectedId===p.id ? "#eef6ff":"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}
          title={previewFor(p)}>
          <DbIcon type={p.dbType as any} />
          <div style={{ display:"grid" }}>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>{p.name}</div>
            <div style={{ fontSize:11, color:"#666" }}>{DB_META[p.dbType].label} • {previewFor(p)}</div>
          </div>
        </button>
      ))}
    </div>
  </aside>
);
