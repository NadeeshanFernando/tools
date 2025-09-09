// Renders a small label text.
import React from "react";
export const Label: React.FC<{children:React.ReactNode}> = ({children}) =>
  <label style={{ fontSize:12, color:"#333" }}>{children}</label>;
