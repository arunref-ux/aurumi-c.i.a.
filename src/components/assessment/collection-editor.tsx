import { useState, type ReactNode } from "react";
import { EmptyState } from "@/components/app/ui-bits";
import { cn } from "@/lib/utils";
import {
  btnDanger,
  btnGhost,
  btnPrimary,
  ErrorNote,
  MultiField,
  SelectField,
  TextField,
  type Options,
} from "./fields";

export interface FieldDef {
  key: string;
  label: string;
  kind: "text" | "textarea" | "select" | "multi" | "bool";
  options?: Options;
  required?: boolean;
  help?: string;
  wide?: boolean;
}
type Row = { id: string };

/**
 * Section-based list editor: shows a compact list, and one inline form at a
 * time (progressive disclosure) for adding or editing a record.
 */
export function CollectionEditor<T extends Row>({
  items,
  fields,
  blank,
  summary,
  onSave,
  onRemove,
  canEdit,
  emptyTitle,
  emptyBody,
  addLabel,
  itemLabel,
  extra,
  fromItem,
  toInput,
}: {
  items: T[];
  fields: FieldDef[];
  blank: () => Record<string, unknown>;
  summary: (t: T) => ReactNode;
  onSave: (draft: Record<string, unknown>) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  canEdit: boolean;
  emptyTitle: string;
  emptyBody?: string;
  addLabel: string;
  itemLabel: (t: T) => string;
  extra?: (t: T) => ReactNode;
  /** Map a stored record to form values (defaults to the record itself). */
  fromItem?: (t: T) => Record<string, unknown>;
  /** Map form values to the service input (defaults to the field values). */
  toInput?: (values: Record<string, unknown>) => Record<string, unknown>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const open = (id: string, data: Record<string, unknown>) => {
    setEditing(id);
    setDraft(structuredClone(data));
    setError(null);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const values = Object.fromEntries(fields.map((f) => [f.key, draft[f.key]]));
      const input = toInput ? toInput(values) : values;
      await onSave(editing === "new" ? input : { ...input, id: editing });
      setEditing(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setError(null);
    try {
      await onRemove(id);
    } catch (e) {
      setError(e);
    }
  };

  const form = (
    <div className="rounded-lg border border-primary/30 bg-muted/40 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((f) => {
          const v = draft[f.key];
          const set = (x: unknown) => setDraft((d) => ({ ...d, [f.key]: x }));
          const wide = f.wide || f.kind === "textarea" || f.kind === "multi";
          return (
            <div key={f.key} className={cn(wide && "md:col-span-2")}>
              {f.kind === "select" ? (
                <SelectField label={f.label} value={String(v ?? "")} options={f.options ?? {}} onChange={set} {...(f.help ? { help: f.help } : {})} />
              ) : f.kind === "multi" ? (
                <MultiField label={f.label} value={(v as string[]) ?? []} options={f.options ?? {}} onChange={set} />
              ) : f.kind === "bool" ? (
                <label className="flex items-center gap-2 pt-5 text-sm">
                  <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />
                  {f.label}
                </label>
              ) : (
                <TextField
                  label={f.label}
                  value={String(v ?? "")}
                  onChange={set}
                  multiline={f.kind === "textarea"}
                  {...(f.required ? { required: true } : {})}
                  {...(f.help ? { help: f.help } : {})}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className={btnPrimary} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className={btnGhost} onClick={() => setEditing(null)} disabled={busy}>
          Cancel
        </button>
      </div>
      <div className="mt-3">
        <ErrorNote error={error} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && editing !== "new" && <EmptyState title={emptyTitle} {...(emptyBody ? { body: emptyBody } : {})} />}
      <ul className="flex flex-col gap-2">
        {items.map((it) =>
          editing === it.id ? (
            <li key={it.id}>{form}</li>
          ) : (
            <li key={it.id} className="rounded-lg border bg-card p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">{summary(it)}</div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <button className={btnGhost} onClick={() => open(it.id, fromItem ? fromItem(it) : (it as unknown as Record<string, unknown>))} aria-label={`Edit ${itemLabel(it)}`}>
                      Edit
                    </button>
                    <button className={btnDanger} onClick={() => remove(it.id)} aria-label={`Remove ${itemLabel(it)}`}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
              {extra?.(it)}
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        form
      ) : (
        canEdit && (
          <div>
            <button className={btnGhost} onClick={() => open("new", blank())}>
              + {addLabel}
            </button>
          </div>
        )
      )}
      {!editing && <ErrorNote error={error} />}
    </div>
  );
}
