// Stores DB metadata (labels, defaults, required fields) and constructors.
import { DbType, NetworkConn, SqliteConn } from "./types";

export const DB_META: Record<
  DbType,
  { label: string; defaultPort?: string; needs: Array<"host" | "port" | "database" | "serviceName" | "user" | "password" | "filePath" | "connectionUri">;
    placeholders?: Partial<Record<"host"|"port"|"database"|"serviceName"|"user"|"filePath"|"connectionUri", string>> }
> = {
  postgres: { label:"PostgreSQL", defaultPort:"5432", needs:["host","port","database","user","password"], placeholders:{host:"localhost",port:"5432",database:"postgres",user:"postgres"} },
  mysql:    { label:"MySQL",      defaultPort:"3306", needs:["host","port","database","user","password"], placeholders:{host:"localhost",port:"3306",database:"mysql",user:"root"} },
  mariadb:  { label:"MariaDB",    defaultPort:"3306", needs:["host","port","database","user","password"], placeholders:{host:"localhost",port:"3306",database:"mysql",user:"root"} },
  mssql:    { label:"SQL Server", defaultPort:"1433", needs:["host","port","database","user","password"], placeholders:{host:"localhost",port:"1433",database:"master",user:"sa"} },
  sqlite:   { label:"SQLite",                       needs:["filePath"], placeholders:{filePath:"C:\\data\\app.db"} },
  oracle:   { label:"Oracle",     defaultPort:"1521", needs:["host","port","serviceName","user","password"], placeholders:{host:"localhost",port:"1521",serviceName:"XEPDB1",user:"system"} },
  mongodb:  { label:"MongoDB",    defaultPort:"27017", needs:["connectionUri","host","port","database","user","password"], placeholders:{connectionUri:"mongodb://user:pw@localhost:27017/?directConnection=true", host:"localhost", port:"27017", database:"admin", user:"root"} },
};

// Builds a default network connection for a given db type.
export const newNetworkConn = (dbType: Exclude<DbType, "sqlite">): NetworkConn => ({
  id: String(Date.now()),
  name: `${DB_META[dbType].label} Connection`,
  dbType,
  host: "localhost",
  port: DB_META[dbType].defaultPort || "",
  database: dbType==="postgres"?"postgres": dbType==="mssql"?"master": (dbType==="mysql"||dbType==="mariadb")?"mysql": dbType==="mongodb"?"admin": undefined,
  serviceName: dbType==="oracle" ? "XEPDB1" : undefined,
  user: dbType==="mssql"?"sa": dbType==="postgres"?"postgres": dbType==="oracle"?"system": dbType==="mongodb"?"": "root",
  connectionUri: dbType==="mongodb" ? "" : undefined,
});

// Builds a default sqlite connection object.
export const newSqliteConn = (): SqliteConn => ({
  id: String(Date.now()),
  name: "SQLite Connection",
  dbType: "sqlite",
  filePath: "",
});
