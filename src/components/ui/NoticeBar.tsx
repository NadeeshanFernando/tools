// Renders a colored notice bar (ok/err/loading).
import React from "react";
export const NoticeBar: React.FC<{kind:"ok"|"err"|"loading"; msg:string}> = ({ kind, msg }) => {
  const style = kind==="ok" ? {bg:"#d4edda", border:"#c3e6cb", color:"#0a4d23"}
               : kind==="err" ? {bg:"#f8d7da", border:"#f5c6cb", color:"#721c24"}
               : {bg:"#f1f1f1", border:"#ddd", color:"#333"};
  return (<div style={{ marginBottom:10, padding:"8px 12px", borderRadius:6, fontSize:14, color:style.color, background:style.bg, border:`1px solid ${style.border}` }}>{msg}</div>);
};
