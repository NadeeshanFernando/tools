// Defines progress event payloads & local state shapes for backup/restore.
export type BackupState = { open:boolean; stage:string; percent:number|null; detail?:string; log:string[] };
export type RestoreMode = "drop_and_restore" | "create_new";
export type RestoreState = { open:boolean; picking:boolean; inProgress:boolean; filePath:string|null; mode:RestoreMode; newDbName:string; stage:string; percent:number|null; detail?:string; log:string[] };
