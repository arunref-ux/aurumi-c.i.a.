import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputCls =
  "w-full rounded-md border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";
export const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
export const btnPrimary = cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90");
export const btnGold = cn(btn, "bg-accent text-accent-foreground hover:bg-accent/90");
export const btnGhost = cn(btn, "border bg-card hover:bg-muted");
export const btnDanger = cn(btn, "text-destructive hover:bg-destructive/10");

export type Options = Record<string, string>;

export function Field({
  label,
  help,
  error,
  children,
  className,
}: {
  label: string;
  help?: string | undefined;
  error?: string | undefined;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string | undefined;
}) {
  const id = useId();
  const hid = help || error ? `${id}-help` : undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children(id, hid)}
      {(help || error) && (
        <p
          id={hid}
          className={cn("text-[11px]", error ? "text-destructive" : "text-muted-foreground")}
        >
          {error ?? help}
        </p>
      )}
    </div>
  );
}

export function TextField(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
  help?: string;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <Field
      label={p.label + (p.required ? " *" : "")}
      help={p.help}
      error={p.error}
      className={p.className}
    >
      {(id, d) =>
        p.multiline ? (
          <textarea
            id={id}
            aria-describedby={d}
            aria-invalid={!!p.error}
            rows={3}
            className={inputCls}
            value={p.value}
            disabled={p.disabled}
            placeholder={p.placeholder}
            onChange={(e) => p.onChange(e.target.value)}
          />
        ) : (
          <input
            id={id}
            aria-describedby={d}
            aria-invalid={!!p.error}
            className={inputCls}
            value={p.value}
            disabled={p.disabled}
            placeholder={p.placeholder}
            onChange={(e) => p.onChange(e.target.value)}
          />
        )
      }
    </Field>
  );
}

export function SelectField(p: {
  label: string;
  value: string;
  options: Options;
  onChange: (v: string) => void;
  disabled?: boolean;
  help?: string;
  className?: string;
}) {
  return (
    <Field label={p.label} help={p.help} className={p.className}>
      {(id, d) => (
        <select
          id={id}
          aria-describedby={d}
          className={inputCls}
          value={p.value}
          disabled={p.disabled}
          onChange={(e) => p.onChange(e.target.value)}
        >
          {Object.entries(p.options).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function MultiField(p: {
  label: string;
  value: string[];
  options: Options;
  onChange: (v: string[]) => void;
  disabled?: boolean;
  empty?: string;
}) {
  const entries = Object.entries(p.options);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{p.label}</legend>
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{p.empty ?? "Nothing to link yet."}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map(([k, v]) => {
            const on = p.value.includes(k);
            return (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                  on ? "border-primary bg-primary/10" : "bg-card",
                )}
              >
                <input
                  type="checkbox"
                  className="size-3"
                  checked={on}
                  disabled={p.disabled}
                  onChange={() => p.onChange(on ? p.value.filter((x) => x !== k) : [...p.value, k])}
                />
                {v}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Completeness"}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}
