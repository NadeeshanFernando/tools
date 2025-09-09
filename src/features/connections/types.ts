// Defines shared domain types for connections and forms.
export type DbType = "postgres" | "mysql" | "mariadb" | "mssql" | "sqlite" | "oracle" | "mongodb";

export type BaseConn = { id: string; name: string; dbType: DbType };
export type NetworkConn = BaseConn & {
  host: string; port: string; database?: string; serviceName?: string; user: string; connectionUri?: string;
};
export type SqliteConn = BaseConn & { filePath: string };
export type Conn = NetworkConn | SqliteConn;

export type FormState =
  | (NetworkConn & { password?: string })
  | (SqliteConn & { password?: string });

export type Notice =
  | { kind: "idle" }
  | { kind: "loading"; msg: string }
  | { kind: "ok"; msg: string }
  | { kind: "err"; msg: string };
