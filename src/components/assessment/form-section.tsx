import { useState } from "react";
import { btnPrimary, ErrorNote, TextField } from "./fields";

/** Edits a flat record of text fields with one explicit Save and visible save feedback. */
export function FormSection<K extends string>({
  fields,
  initial,
  onSave,
  canEdit,
  unknownable,
  initialUnknown = [],
  columns = 2,
}: {
  fields: readonly (readonly [K, string])[];
  initial: Record<K, string>;
  onSave: (values: Record<K, string>, unknown: K[]) => Promise<unknown>;
  canEdit: boolean;
  /** Allow marking a field "Unknown" instead of inventing a value. */
  unknownable?: boolean;
  initialUnknown?: K[];
  columns?: 1 | 2;
}) {
  const [values, setValues] = useState(initial);
  const [unknown, setUnknown] = useState<K[]>(initialUnknown);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(values, unknown);
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={columns === 2 ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
        {fields.map(([k, label]) => {
          const isUnknown = unknown.includes(k);
          return (
            <div key={k} className="flex flex-col gap-1">
              <TextField
                label={label}
                value={isUnknown ? "" : values[k]}
                placeholder={isUnknown ? "Marked unknown" : "Not yet assessed"}
                multiline={columns === 1}
                disabled={!canEdit || isUnknown}
                onChange={(v) => {
                  setValues((s) => ({ ...s, [k]: v }));
                  setDirty(true);
                }}
              />
              {unknownable && canEdit && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3"
                    checked={isUnknown}
                    onChange={(e) => {
                      setUnknown((u) => (e.target.checked ? [...u, k] : u.filter((x) => x !== k)));
                      setDirty(true);
                    }}
                  />
                  Unknown
                </label>
              )}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnPrimary} onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save section"}
          </button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {dirty ? "Unsaved changes" : savedAt ? `Saved at ${savedAt}` : "No changes"}
          </span>
        </div>
      )}
      <ErrorNote error={error} />
    </div>
  );
}
