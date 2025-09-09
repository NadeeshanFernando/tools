// Maps raw DB errors to user-friendly messages.
import { DbType } from "../../features/connections/types";

export function friendlyMsg(raw: string, dbType: DbType): string {
  const txt = String(raw).replace(/^db error:\s*/i, "");
  if (/does not exist|unknown database/i.test(txt)) return "Database not found. Check database name.";
  if (/password authentication failed|access denied|login failed|Authentication failed|not authorized/i.test(txt)) return "Invalid credentials or not authorized.";
  if (/could not connect|connection refused|no such host|ENOTFOUND|ECONNREFUSED|closed connection/i.test(txt)) return "Cannot reach server. Check host/port and that the service is running.";
  if (/timeout|ETIMEDOUT|connect timed out/i.test(txt)) return "Connection timed out. Check network/VPN and port.";
  if (/self[-\s]?signed|certificate|TLS/i.test(txt)) return "SSL/TLS error. Verify SSL settings or try without SSL.";

  if (dbType==="mssql" && /port|login timeout/i.test(txt)) return "SQL Server unreachable. Ensure TCP/IP is enabled and port 1433 is open.";
  if ((dbType==="mysql"||dbType==="mariadb") && /handshake/i.test(txt)) return "Handshake failed. Check user host permissions and auth plugin.";
  if (dbType==="sqlite" && /unable to open database file/i.test(txt)) return "Cannot open SQLite file. Check path and permissions.";
  if (dbType==="oracle") {
    if (/ORA-01017/i.test(txt)) return "Invalid Oracle username or password (ORA-01017).";
    if (/ORA-12514/i.test(txt)) return "Service name not registered (ORA-12514). Check serviceName.";
    if (/ORA-12541|TNS:no listener/i.test(txt)) return "Listener not reachable (ORA-12541). Ensure port 1521 and listener are running.";
  }
  if (dbType==="mongodb") {
    if (/SRV|TXT record|dns/i.test(txt)) return "DNS/SRV issue. Check your Mongo SRV URI or DNS.";
    if (/auth/i.test(txt)) return "Mongo authentication failed. Check user/password and Auth DB.";
  }
  return txt;
}
