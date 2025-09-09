// Presents restore UI (file pick, mode, progress, logs) with fixed-height log scroller.
import React, { useEffect, useRef } from "react";
import { Backdrop } from "../../components/ui/Backdrop";
import { DbIcon } from "../../components/ui/DbIcon";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { Button } from "../../components/ui/Button";
import { Label } from "../../components/ui/Label";
import { Field } from "../../components/ui/Field";
import { RestoreState } from "./progress.types";
import { FormState } from "../connections/types";

export const RestoreModal: React.FC<{
  open: boolean; state: RestoreState; form: FormState;
  onClose: () => void; onBrowse: () => void; onStart: () => void;
  setNewName: (s: string) => void; setModeDrop: () => void; setModeCreate: () => void;
}> = ({ open, state, form, onClose, onBrowse, onStart, setNewName, setModeDrop, setModeCreate }) => {
  const logRef = useRef<HTMLDivElement>(null); // scroll container for logs

  // Auto-scroll the log to the bottom when new lines arrive.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.log.length, state.detail]);

  if (!open) return null;

  return (
    <Backdrop>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DbIcon type={form.dbType as any} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              Restore – {(form as any).name || form.dbType}
            </div>
            <div style={{ fontSize: 12, color: "#555" }}>{state.stage}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <Label>Backup file</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <Field
                placeholder="Choose a .dump / .sql / .gz file…"
                value={state.filePath ?? ""}
                readOnly
              />
              <Button onClick={onBrowse} disabled={state.picking || state.inProgress}>
                {state.picking ? "Picking…" : "Browse…"}
              </Button>
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
              • Custom format (*.dump) uses <code>pg_restore</code>; plain SQL (*.sql) uses <code>psql</code>.
            </div>
          </div>

          <div>
            <Label>Restore mode</Label>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  name="restore-mode"
                  checked={state.mode === "drop_and_restore"}
                  onChange={setModeDrop}
                  disabled={state.inProgress}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Drop all & restore into current database</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Drops all objects in <strong>{(form as any).database || "postgres"}</strong> then restores.
                  </div>
                </div>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="radio"
                  name="restore-mode"
                  checked={state.mode === "create_new"}
                  onChange={setModeCreate}
                  disabled={state.inProgress}
                />
                <div style={{ width: "100%" }}>
                  <div style={{ fontWeight: 600 }}>Create new database & restore</div>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                    Creates a fresh database and restores into it.
                  </div>
                  <Field
                    placeholder="new_database_name"
                    value={state.newDbName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={state.inProgress || state.mode !== "create_new"}
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        <ProgressBar percent={state.percent ?? null} />
        {state.detail && <div style={{ fontSize: 12, color: "#444" }}>{state.detail}</div>}

        {/* FIXED-HEIGHT LOG WITH SCROLLER */}
        <div
          ref={logRef}
          style={{
            height: "min(15vh, 260px)",   // fixed visual window for logs
            overflowY: "auto",            // scroll only the log area
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 8,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 12,
          }}
        >
          {state.log.length === 0 ? (
            <div style={{ color: "#888" }}>No messages yet…</div>
          ) : (
            state.log.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>

        {/* Footer stays visible because the log no longer grows the card */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {!state.inProgress ? (
            <>
              <Button onClick={onClose}>Close</Button>
              <Button
                onClick={onStart}
                disabled={!state.filePath || (state.mode === "create_new" && !state.newDbName.trim())}
              >
                Start Restore
              </Button>
            </>
          ) : (
            <Button disabled>Restoring…</Button>
          )}
        </div>
      </div>
    </Backdrop>
  );
};
