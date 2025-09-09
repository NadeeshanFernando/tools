// Renders a neutral button with disabled styling.
import React from "react";
export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
  <button {...props} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid #d0d0d0", background: props.disabled?"#f2f2f2":"#fafafa", cursor: props.disabled?"not-allowed":"pointer" }} />
);
