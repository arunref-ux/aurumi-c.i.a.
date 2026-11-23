import { PageHeader, Panel } from "./ui-bits";

export function ModulePlaceholder({ title, phase, purpose, planned, recordsLabel, records }: {
  title: string; phase: number; purpose: string; planned: string[]; recordsLabel?: string; records?: number;
}) {
  return (
    <>
      <PageHeader eyebrow={`Scheduled for Phase ${phase}`} title={title} description={purpose} />
      <div className="grid gap-6 md:grid-cols-3">
        <Panel title="Planned capabilities" className="md:col-span-2">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {planned.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />{p}</li>)}
          </ul>
        </Panel>
        <Panel title="Foundation status">
          <p className="text-sm text-muted-foreground">Data model and permission-checked repository are in place. Screens and workflows arrive in Phase {phase}.</p>
          {recordsLabel !== undefined && (
            <p className="mt-4 text-3xl font-display">{records ?? 0}<span className="ml-2 font-sans text-xs text-muted-foreground">{recordsLabel} visible to you</span></p>
          )}
        </Panel>
      </div>
    </>
  );
}
