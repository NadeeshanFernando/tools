// Renders a styled input field.
import React from "react";
export const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) =>
  <input {...props} style={{ width:"100%", padding:"8px 10px", border:"1px solid #cfcfcf", borderRadius:6, outline:"none" }} />;
