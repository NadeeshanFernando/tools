// Centralizes Tauri command calls for backup/restore/test flows.
import { FormState } from "../connections/types";
import { invokeSafe } from "../../lib/tauri/invoke";

// Tests a DB connection via backend command.
export function testConnection(form: FormState): Promise<string> {
  return invokeSafe<string>("test_connection", { profile: form }, 45000, "test_connection");
}
// Triggers a backup via backend command.
export function backupConnection(form: FormState, destPath: string, compress: boolean): Promise<void> {
  return invokeSafe<void>("backup_connection", { profile: form, destPath, compress }, 0, "backup_connection");
}
// Triggers a restore via backend command.
export function restoreConnection(form: FormState, srcPath: string, opts: { strategy: "drop_and_restore"|"create_new"; newDbName?: string | null; }): Promise<void> {
  return invokeSafe<void>("restore_connection", { profile: form, srcPath, opts }, 0, "restore_connection");
}
