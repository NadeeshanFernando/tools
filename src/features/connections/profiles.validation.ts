// Validates forms and builds defaults for a given DB type.
import { DB_META, newNetworkConn, newSqliteConn } from "./dbMeta";
import { FormState } from "./types";

// Creates a default form for a DB type.
export function makeDefaultForm(dbType: any): FormState {
  return dbType === "sqlite" ? { ...newSqliteConn() } : { ...newNetworkConn(dbType), password: "" };
}

// Validates a FormState and returns a user-facing error or null.
export function validateForm(form: FormState): string | null {
  if (form.dbType === "mongodb") {
    const uri = (form as any).connectionUri?.trim();
    if (uri && uri.length > 0) return null;
    if (!(form as any).host || !(form as any).port) return "Fill required fields: Host, Port (or provide a Connection URI).";
    if ((form as any).port && !/^\d+$/.test((form as any).port)) return "Port must be numeric.";
    return null;
  }
  const needs = DB_META[form.dbType].needs;
  const missing = needs.filter((k) => { if (k==="connectionUri") return false; const v=(form as any)[k]; return !v || String(v).trim()===""; });
  if (missing.length) {
    const label = (k: string) => k==="filePath"?"File path": k==="serviceName"?"Service name": k==="connectionUri"?"Connection URI": k[0].toUpperCase()+k.slice(1);
    return `Fill required fields: ${missing.map(label).join(", ")}.`;
  }
  if ("port" in form && (form as any).port && !/^\d+$/.test((form as any).port)) return "Port must be numeric.";
  return null;
}
