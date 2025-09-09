// Shows a compact DB badge icon.
import React from "react";
const BADGE: Record<string, {bg:string;fg:string;label:string;title:string}> = {
  postgres:{bg:"#336791",fg:"#fff",label:"PG",title:"PostgreSQL"},
  mysql:{bg:"#4479A1",fg:"#fff",label:"MY",title:"MySQL"},
  mariadb:{bg:"#1F305F",fg:"#fff",label:"MA",title:"MariaDB"},
  mssql:{bg:"#CC2927",fg:"#fff",label:"MS",title:"SQL Server"},
  sqlite:{bg:"#0E76A8",fg:"#fff",label:"SQ",title:"SQLite"},
  oracle:{bg:"#F80000",fg:"#fff",label:"OR",title:"Oracle"},
  mongodb:{bg:"#4DB33D",fg:"#fff",label:"MO",title:"MongoDB"},
};
export const DbIcon: React.FC<{type:keyof typeof BADGE}> = ({ type }) => {
  const { bg, fg, label, title } = BADGE[type];
  return (<svg width="22" height="22" viewBox="0 0 24 24" aria-label={title} role="img" style={{flex:"0 0 22px"}}>
    <rect x="2" y="2" width="20" height="20" rx="6" fill={bg} />
    <text x="12" y="14.5" textAnchor="middle" fontFamily="Inter, system-ui, Arial" fontSize="9" fontWeight="700" fill={fg}>{label}</text>
  </svg>);
};
