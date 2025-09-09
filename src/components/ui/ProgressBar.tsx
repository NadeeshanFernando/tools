// Displays a linear progress bar (indeterminate when percent is null).
import React from "react";
export const ProgressBar: React.FC<{percent:number|null}> = ({ percent }) => (
  <div style={{ width:"100%", background:"#eee", borderRadius:8, height:10, overflow:"hidden" }}>
    <div style={{ width: percent===null ? "25%" : `${Math.max(0, Math.min(100, percent))}%`, height:"100%", transition:"width .25s ease", background:"#3b82f6", animation: percent===null ? "indef 1.2s linear infinite" : "none" }} />
    <style>{`@keyframes indef{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
  </div>
);
