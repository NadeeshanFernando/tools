// Manages profiles, selection, and form state; exposes CRUD + helpers.
import { useEffect, useMemo, useState } from "react";
import { Conn, FormState, NetworkConn, DbType } from "./types";
import { loadProfiles, saveProfiles } from "./profiles.storage";
import { makeDefaultForm } from "./profiles.validation";
import { newNetworkConn, DB_META } from "./dbMeta";

// Builds the default connection name for a given DB type.
const defaultNameFor = (t: DbType) => `${DB_META[t].label} Connection`;

// True if the current name equals the default name for its DB type.
const isDefaultName = (name: string | undefined, t: DbType | undefined) => {
  if (!t) return false;
  return !name || name.trim().toLowerCase() === defaultNameFor(t).toLowerCase();
};

export function useConnections() {
  // Initializes profiles & form on first render.
  const [profiles, setProfiles] = useState<Conn[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(makeDefaultForm("postgres"));

  // Hydrates state from storage (with v1→v2 migration).
  useEffect(() => {
    const arr = loadProfiles();
    if (arr.length === 0) {
      const first = newNetworkConn("postgres");
      setProfiles([first]);
      setSelectedId(first.id);
      setForm({ ...first, password: "" });
    } else {
      setProfiles(arr);
      setSelectedId(arr[0].id);
      const f = arr[0];
      setForm(
        f.dbType === "sqlite"
          ? ({ ...f } as FormState)
          : ({ ...(f as NetworkConn), password: "" } as FormState)
      );
    }
  }, []);

  // Computes the currently selected profile.
  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) || null,
    [profiles, selectedId]
  );

  // Selects a profile by id.
  function select(id: string) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setSelectedId(id);
    setForm(
      p.dbType === "sqlite"
        ? ({ ...p } as FormState)
        : ({ ...(p as NetworkConn), password: "" } as FormState)
    );
  }

  // Adds a fresh PostgreSQL profile.
  function add() {
    const p = newNetworkConn("postgres");
    const next = [...profiles, p];
    setProfiles(next);
    saveProfiles(next);
    setSelectedId(p.id);
    setForm({ ...p, password: "" });
  }

  // Duplicates the current profile.
  function duplicate() {
    const s = profiles.find((p) => p.id === selectedId);
    if (!s) return;
    const copy: Conn =
      s.dbType === "sqlite"
        ? ({ ...s, id: String(Date.now()), name: s.name + " (copy)" } as any)
        : ({ ...s, id: String(Date.now()), name: s.name + " (copy)" } as any);
    const next = [...profiles, copy];
    setProfiles(next);
    saveProfiles(next);
    setSelectedId(copy.id);
    setForm(
      copy.dbType === "sqlite"
        ? ({ ...copy } as FormState)
        : ({ ...(copy as NetworkConn), password: "" } as FormState)
    );
  }

  // Deletes the current profile with a fallback creation.
  function remove() {
    const s = profiles.find((p) => p.id === selectedId);
    if (!s) return;
    const next = profiles.filter((p) => p.id !== s.id);
    setProfiles(next);
    saveProfiles(next);
    const fallback = next[0] ?? newNetworkConn("postgres");
    if (!next[0]) {
      const fresh = [fallback];
      setProfiles(fresh);
      saveProfiles(fresh);
    }
    setSelectedId(fallback.id);
    setForm({ ...(fallback as NetworkConn), password: "" });
  }

  // Persists the current form (excluding password).
  function saveConn() {
    const { password, ...toSave } = form as any;
    const idx = profiles.findIndex((p) => p.id === (form as any).id);
    const next = profiles.slice();
    if (idx === -1) next.push(toSave as Conn);
    else next[idx] = toSave as Conn;
    setProfiles(next);
    saveProfiles(next);
  }

  // Resets fields when DB type changes; updates name only if it was default.
  function onDbTypeChange(nextType: DbType) {
    setForm((prev: any) => {
      const id = prev?.id ?? String(Date.now());
      const prevType = prev?.dbType as DbType | undefined;
      const prevName = prev?.name as string | undefined;

      const nextName = isDefaultName(prevName, prevType)
        ? defaultNameFor(nextType)
        : prevName ?? defaultNameFor(nextType);

      const base = makeDefaultForm(nextType) as any;
      base.id = id;
      base.name = nextName;
      return base as FormState;
    });
  }

  return {
    profiles,
    selectedId,
    selected,
    form,
    setForm,
    select,
    add,
    duplicate,
    remove,
    saveConn,
    onDbTypeChange,
  };
}
