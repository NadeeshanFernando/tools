// Builds the sidebar preview string for a connection.
import { Conn, NetworkConn, SqliteConn } from "./types";

export function previewFor(p: Conn): string {
  if (p.dbType === "sqlite") return (p as SqliteConn).filePath || "No file";
  if (p.dbType === "oracle")
    return `${(p as NetworkConn).user}@${(p as NetworkConn).host}:${(p as NetworkConn).port}/${(p as NetworkConn).serviceName}`;
  if (p.dbType === "mongodb") {
    const uri = (p as NetworkConn).connectionUri?.trim();
    return uri && uri.length>0 ? uri :
      `${(p as NetworkConn).user || "(no-auth)"}@${(p as NetworkConn).host}:${(p as NetworkConn).port}/${(p as NetworkConn).database || "admin"}`;
  }
  return `${(p as NetworkConn).user}@${(p as NetworkConn).host}:${(p as NetworkConn).port}/${(p as NetworkConn).database}`;
}
