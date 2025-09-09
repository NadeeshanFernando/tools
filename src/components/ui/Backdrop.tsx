// Provides a centered modal container with backdrop.
import React from "react";
export const Backdrop: React.FC<{children:React.ReactNode}> = ({ children }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.25)", display:"grid", placeItems:"center", zIndex:50 }}>
    <div style={{ width:560, maxWidth:"92vw", background:"#fff", borderRadius:12, padding:16, boxShadow:"0 8px 30px rgba(0,0,0,.25)" }}>{children}</div>
  </div>
);
