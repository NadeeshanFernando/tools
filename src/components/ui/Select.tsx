// Renders a styled select element.
import React from "react";
export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) =>
  <select {...props} style={{ width:"100%", padding:"8px 10px", border:"1px solid #cfcfcf", borderRadius:6, outline:"none", background:"#fff" }} />;
