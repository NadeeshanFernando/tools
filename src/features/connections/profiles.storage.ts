// Provides load/save/migrate functions for connection profiles.
import { Conn } from "./types";
import { getJson, setJson } from "../../lib/storage/jsonStorage";
import { LS_KEY_V1, LS_KEY_V2 } from "../../constants/localStorageKeys";

// Loads v2 profiles from storage.
export function loadProfilesV2(): Conn[] { return getJson<Conn[]>(LS_KEY_V2, []); }

// Migrates old v1 postgres-only profiles into v2 shape.
export function migrateV1ToV2(): Conn[] {
  const arr = getJson<any[]>(LS_KEY_V1, []);
  if (!Array.isArray(arr)) return [];
  const mapped: Conn[] = arr.map((p: any) => ({
    id: p.id ?? String(Date.now()),
    name: p.name ?? "Migrated Connection",
    dbType: "postgres",
    host: p.host ?? "localhost",
    port: p.port ?? "5432",
    database: p.database ?? "postgres",
    user: p.user ?? "postgres",
  }));
  if (mapped.length) setJson(LS_KEY_V2, mapped);
  return mapped;
}

// Loads profiles with migration fallback.
export function loadProfiles(): Conn[] {
  const v2 = loadProfilesV2();
  return v2.length ? v2 : migrateV1ToV2();
}

// Saves profiles to v2 storage.
export function saveProfiles(arr: Conn[]): void { setJson(LS_KEY_V2, arr); }
